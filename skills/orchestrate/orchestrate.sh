#!/usr/bin/env bash
# orchestrate.sh — drive one or more worker `claude` sessions inside tmux or cmux.
# Mux-agnostic: a single dispatch layer (mux_*) backs every subcommand.
#
# Subcommands: spawn | send | run | poll | wait | waitall | logs | attach | list | stop | gc
# (run with none for help). run = send+wait fused; waitall = one loop over a fleet.
#
# State lives under $ORCH_HOME/<id>.meta — KEY=VALUE lines:
#   MUX=tmux|cmux  TARGET=<session-or-workspace ref>  DIR=<path>  CREATED=<epoch>
set -euo pipefail

# Default state dir lives OUTSIDE any repo so meta files (which contain absolute
# paths) never get committed/leaked. Override with ORCH_HOME.
ORCH_HOME="${ORCH_HOME:-${XDG_STATE_HOME:-$HOME/.local/state}/orchestrate}"

# ─── Detection regexes — TUNE HERE ───────────────────────────────────────────
# Matched (grep -E, POSIX ERE) against an ANSI-stripped TAIL of the worker's
# screen. Precedence in classify(): DIALOG > BUSY > IDLE > UNKNOWN. BUSY and
# DIALOG are searched across the WHOLE capture; only IDLE/composer is tail-
# anchored (a one-frame output burst can push the status line above the tail).
#
# Verified against a LIVE Claude Code v2.1.186 capture. The interrupt hint
# `esc to interrupt` anchors BUSY: it is pure ASCII and the single most stable
# busy marker. NOTE: the real footer is middot-delimited ("· esc to interrupt ·"),
# NOT parenthesized — match the bare substring, not "(esc to interrupt)".
#
# BUSY — a turn is actively running. Anchored to the LIVE STATUS LINE only:
#   the interrupt hint, or a spinner glyph at line-start on a line that also
#   carries the hint, or the ctrl-c/esc stop-hint variants. We deliberately do
#   NOT match bare gerunds/"...(N s)"/token counts — those occur in settled
#   PROSE and would pin BUSY forever (false-negative / guaranteed TIMEOUT).
BUSY_RE_UNICODE='esc to interrupt|(esc|ctrl-c)[[:space:]]+to[[:space:]]+(interrupt|stop|cancel)'
BUSY_RE_ASCII='esc to interrupt|(esc|ctrl-c)[[:space:]]+to[[:space:]]+(interrupt|stop|cancel)'
#
# IDLE/DONE — turn finished, composer waiting. POSITIVE idle evidence only:
#   an empty composer as the LAST non-blank line (glyph ❯ or ASCII >), or a
#   settled past-tense summary ("Cooked for 2s"). The persistent footer
#   ("? for shortcuts", "bypass permissions on") is STATE-INVARIANT — it is on
#   screen mid-turn too — so it is NOT idle evidence here (it is used only for
#   boot confirmation in cmd_spawn). The ❯ glyph is matched by its literal UTF-8
#   bytes (\xe2\x9d\xaf) so it works even under LANG=C. COMPOSER_RE is built at
#   runtime (printf the bytes) and OR-ed in.
IDLE_RE_BASE='[A-Za-z][A-Za-z-]+ed for [0-9]+(\.[0-9]+)?s|^[[:space:]]*(Done|Finished)\b'
#
# DIALOG / NEEDS_INPUT — blocked on a HUMAN choice. Gated on the interactive
# chooser shape (numbered option / "Esc to cancel" / explicit yes-no / trust),
# NOT on loose prose, plus the worker-emitted sentinel.
DIALOG_RE_BASE='>>> NEEDS_HUMAN:|Esc to cancel|^[[:space:]]*[0-9]+\.[[:space:]]+(Yes|No|Allow|Deny)\b|Do you want|Do you trust|\(y/n\)|trust the files'
# "Allow X to ..." is a real permission dialog ONLY when it co-occurs with a
# chooser footer; checked separately in classify() to avoid matching prose
# like "We allow admins to edit".
ALLOW_RE='Allow .* to '
CHOOSER_RE='Esc to cancel|^[[:space:]]*[❯>]?[[:space:]]*[0-9]+\.'
#
# First-run trust dialog — auto-dismissed ONCE at spawn, never treated as
# NEEDS_INPUT during a task. Kept narrow so it can't eat a real task dialog.
# Real v2.1.186 text: "Quick safety check: Is this a project you created or one
# you trust?" with "❯ 1. Yes, I trust this folder". Verified by live capture.
TRUST_RE='Quick safety check|Is this a project you|trust this folder|Do you trust the files'

# Literal-byte composer match (works under any locale; strip_ansi keeps bytes).
COMPOSER_RE="$(printf '(^|[^[:alnum:]])(\xe2\x9d\xaf|>)[[:space:]]*$')"

# Tier selection — Unicode classes only behave as "one glyph" under UTF-8.
pick_regex_tier() {
  case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
    *[Uu][Tt][Ff]-8*|*[Uu][Tt][Ff]8*) BUSY_RE="$BUSY_RE_UNICODE" ;;
    *) BUSY_RE="$BUSY_RE_ASCII" ;;
  esac
  [ "${ORCH_ASCII_ONLY:-0}" = 1 ] && BUSY_RE="$BUSY_RE_ASCII"
  IDLE_RE="$IDLE_RE_BASE|$COMPOSER_RE"
  DIALOG_RE="$DIALOG_RE_BASE"
  return 0
}
pick_regex_tier

# How many bottom lines the IDLE/composer test scans (the TUI pins the composer
# at the very bottom). BUSY/DIALOG search the whole capture, not just the tail.
CLASSIFY_TAIL="${CLASSIFY_TAIL:-25}"
# ─────────────────────────────────────────────────────────────────────────────

die() { echo "orchestrate: $*" >&2; exit 1; }
log() { echo "orchestrate: $*" >&2; }

# numeric-arg validator
need_int() { case "$2" in ''|*[!0-9]*) die "$1 must be a non-negative integer";; esac; }
need_num() { case "$2" in ''|*[!0-9.]*|*.*.*) die "$1 must be a number";; esac; }

# ANSI / control-sequence stripper. Reads stdin, writes clean text to stdout.
strip_ansi() {
  sed -E $'s/\x1b\\[[0-9;?]*[ -/]*[@-~]//g; s/\x1b\\][^\x07]*(\x07|\x1b\\\\)//g; s/\r//g'
}

# Bottom region of a stripped screen: drop blank lines, keep the last N.
# `|| true` so an all-blank screen (mid-redraw) does not abort under pipefail.
tail_region() { { grep -v '^[[:space:]]*$' || true; } | tail -n "$CLASSIFY_TAIL"; }

# Stable digest of the tail, with volatile fields normalized out so a ticking
# idle widget (context %, elapsed clock, token count) does not defeat the
# settled-screen guard in wait(). Falls back to cksum, then od, then constant.
HASH_CMD="$(command -v sha1sum || command -v shasum || command -v cksum || true)"
tail_hash() {
  local norm
  # collapse every digit run to 0 so counters/percentages/clocks don't mutate the hash
  norm="$(printf '%s' "$1" | tail_region | sed -E 's/[0-9]+/0/g')"
  if [ -n "$HASH_CMD" ]; then
    printf '%s' "$norm" | "$HASH_CMD" | tr -cd '0-9a-f' | cut -c1-40
  else
    printf '%s' "$norm" | od -An -tx1 2>/dev/null | tr -cd '0-9a-f' | cut -c1-40
  fi
}

# per-ORCH_HOME tag so tmux session names can't collide across orchestrators on
# the same socket, and gc/stop only touch OUR sessions.
orch_tag() {
  local tagf="$ORCH_HOME/.tag"
  if [ -f "$tagf" ]; then cat "$tagf"; return; fi
  mkdir -p "$ORCH_HOME"
  local t; t="$(printf '%s' "$ORCH_HOME" | (command -v shasum >/dev/null && shasum || cksum) | tr -cd '0-9a-f' | cut -c1-8)"
  [ -n "$t" ] || t="$$"
  printf '%s' "$t" > "$tagf"
  printf '%s' "$t"
}

meta_file() { echo "${ORCH_HOME}/$1.meta"; }

require_meta() {
  local f; f="$(meta_file "$1")"
  [ -f "$f" ] || die "unknown worker '$1' (no meta at $f). Try: orchestrate list"
  # shellcheck disable=SC1090
  MUX=""; TARGET=""; DIR=""; CREATED=""
  . "$f"
  [ -n "${MUX:-}" ] && [ -n "${TARGET:-}" ] || die "corrupt meta for '$1'"
}

# ─── Mux dispatch layer ──────────────────────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }

detect_mux() {
  if have cmux && cmux ping >/dev/null 2>&1; then echo cmux; return; fi
  if have tmux; then echo tmux; return; fi
  if have cmux; then echo cmux; return; fi
  die "neither tmux nor cmux found on PATH"
}

# --- tmux backend (dedicated private socket -L cc isolates us from user tmux) ---
TMUX_SOCK="${ORCH_TMUX_SOCK:-cc}"
tx() { command tmux -L "$TMUX_SOCK" "$@"; }
tmux_sname() { echo "orch_$(orch_tag)_$1"; }   # namespaced session name

tmux_spawn() { # <id> <dir> <cmd> -> prints TARGET ref (session:win.pane)
  have tmux || die "tmux not found"
  local s; s="$(tmux_sname "$1")"
  tx new-session -d -s "$s" -x 220 -y 50 -c "$2" "$3" \
    || die "tmux: could not create session '$s' (already exists? run: orchestrate gc)"
  # Lock geometry at the session, not just inside tmux_attach: tmux's default
  # window-size=latest lets ANY attaching client (incl. the raw `tmux attach -r`
  # command printed as the manual fallback) resize the worker's live pane, and
  # the resize persists after that client detaches. `manual` pins it to the
  # -x/-y above for every future attach, read-only or not.
  tx set-option -t "$s" window-size manual 2>/dev/null || true
  # NEVER assume the pane is :0.0 — ~/.tmux.conf is sourced at server start
  # even on this private -L socket, so `base-index 1`/`pane-base-index 1` there
  # shifts the indices and every later `tx -t` lookup would fail ("can't find
  # window: 0"), killing spawn before boot confirms (github issue #2). Ask tmux
  # what it actually created instead.
  local w p
  w="$(tx list-windows -t "$s" -F '#I' | head -1)"
  p="$(tx list-panes  -t "$s:${w:-0}" -F '#P' | head -1)"
  echo "$s:${w:-0}.${p:-0}"
}
tmux_send_text()  { tx send-keys -t "$1" -l -- "$2"; }         # literal text, NO Enter; -- guards dash-leading prompts
tmux_send_paste() { # <target> <file> — bracketed paste so newlines don't submit early
  tx load-buffer -b orch "$2"
  tx paste-buffer -p -b orch -t "$1"
}
tmux_send_key()   { tx send-keys -t "$1" "$2"; }               # named key: Enter/Escape/C-c
tmux_capture()    { if [ -n "${2:-}" ]; then tx capture-pane -t "$1" -p -S "-$2"; else tx capture-pane -t "$1" -p; fi; }
tmux_kill()       { tx kill-session -t "${1%%:*}" 2>/dev/null || true; }
tmux_alive()      { tx has-session -t "${1%%:*}" 2>/dev/null; }

# tmux is the CONTROL plane; cmux doubles as an on-demand VIEW plane. A tmux
# session is a shared object, so a read-only attach renders the SAME live
# session inside a cmux pane instead of opening a second control path.
tmux_attach() { # <target> <id> <dir> -> open/print a read-only viewer
  local session="${1%%:*}" id="$2" dir="$3"   # strip ":<w>.<p>" at the FIRST colon — same trick as tmux_kill/tmux_alive
  # -r = read-only: the viewer can never type into, interrupt, or kill the
  # worker; closing/detaching it leaves the worker running. Any number of
  # viewers may attach at once. (Future: --writable could drop -r for an
  # interactive takeover attach — not implemented.)
  local cmd="tmux -L $TMUX_SOCK attach -r -t $session"
  if have cmux && cmux ping >/dev/null 2>&1; then
    if CMUX_QUIET=1 cmux new-workspace --name "view-$id" --cwd "$dir" --command "$cmd" >/dev/null 2>&1; then
      log "opened a read-only viewer for '$id' in a new cmux workspace (closing it will NOT stop '$id')"
      return
    fi
    log "cmux: could not open a viewer workspace; run this yourself instead:"
  else
    log "cmux not reachable; view '$id' yourself with:"
  fi
  log "  $cmd"
}

# --- cmux backend (refs look like "workspace:6"; CMUX_QUIET silences alias notices) ---
cmux_spawn() { # <id> <dir> <cmd> -> prints workspace ref
  have cmux || die "cmux not found"
  local out ref
  out="$(CMUX_QUIET=1 cmux new-workspace --name "$1" --cwd "$2" --command "$3" 2>/dev/null)" \
    || die "cmux: could not create workspace for '$1'"
  # tolerant parse: grab the first workspace:<ref> token anywhere in the output.
  ref="$(printf '%s\n' "$out" | grep -oE 'workspace:[0-9A-Za-z_-]+' | head -1)"
  [ -n "$ref" ] || die "cmux: could not parse workspace ref from: $out"
  echo "$ref"
}
cmux_send_text()  { CMUX_QUIET=1 cmux send --workspace "$1" -- "$2" >/dev/null 2>&1; }  # types text, no Enter (\n/\r would Enter)
cmux_send_paste() { # <target> <file> — set-buffer + paste-buffer (newlines preserved)
  CMUX_QUIET=1 cmux set-buffer --name orch -- "$(cat "$2")" >/dev/null 2>&1
  CMUX_QUIET=1 cmux paste-buffer --name orch --workspace "$1" >/dev/null 2>&1
}
cmux_send_key()   { # map tmux key names to cmux key names
  local k="$2"
  case "$k" in
    Enter|enter)   k=enter ;;
    Escape|escape) k=escape ;;
    C-c|c-c)       k=ctrl+c ;;
  esac
  CMUX_QUIET=1 cmux send-key --workspace "$1" -- "$k" >/dev/null 2>&1
}
cmux_capture()    { if [ -n "${2:-}" ]; then CMUX_QUIET=1 cmux read-screen --workspace "$1" --lines "$2" 2>/dev/null; else CMUX_QUIET=1 cmux read-screen --workspace "$1" 2>/dev/null; fi; }
cmux_kill()       { CMUX_QUIET=1 cmux close-workspace --workspace "$1" >/dev/null 2>&1 || true; }
# Aliveness = EXISTENCE (list-workspaces), not terminal readability. read-screen
# can fail transiently on a live workspace whose terminal hasn't rendered.
cmux_alive()      { CMUX_QUIET=1 cmux list-workspaces 2>/dev/null | grep -qE "(^|[[:space:]])$1([[:space:]]|$)"; }
# GUI-owned workspace — no tmux session underneath, so no read-only view exists.
# Best-effort focus, then leave the user with an actionable next step either way.
cmux_attach()     { # <target> <id> <dir> -> focus the workspace; <dir> unused (cmux is already open)
  CMUX_QUIET=1 cmux select-workspace --workspace "$1" >/dev/null 2>&1 || true
  log "'$2' is a cmux-GUI worker (workspace $1); switch to it in the cmux app — orchestrate cannot open a separate view for a cmux-backed worker"
}

# Dispatch wrappers — pick backend by $MUX.
mux_send_text()  { "${MUX}_send_text"  "$TARGET" "$1"; }
mux_send_paste() { "${MUX}_send_paste" "$TARGET" "$1"; }
mux_send_key()   { "${MUX}_send_key"   "$TARGET" "$1"; }
mux_capture()    { "${MUX}_capture"    "$TARGET" "${1:-}"; }
mux_kill()       { "${MUX}_kill"       "$TARGET"; }
mux_alive()      { "${MUX}_alive"      "$TARGET"; }
mux_attach()     { "${MUX}_attach"     "$TARGET" "$1" "$2"; }

# ─── Shared helpers ──────────────────────────────────────────────────────────

# Dismiss ONLY the first-run trust dialog. Never cancels a real task dialog.
dismiss_trust() {
  local screen
  screen="$(mux_capture 60 | strip_ansi)" || return 0
  if printf '%s' "$screen" | grep -qE "$TRUST_RE"; then
    mux_send_key Enter; sleep 1            # first-run trust: default = accept (see residual risk)
  fi
  return 0
}

# Classify a stripped screen -> BUSY|IDLE|NEEDS_INPUT|UNKNOWN.
# DIALOG/BUSY scan the WHOLE screen; IDLE/composer is tail-anchored. Precedence
# DIALOG > BUSY > IDLE > UNKNOWN is load-bearing. A footer-only screen with no
# positive idle/busy/dialog evidence is UNKNOWN (never a false DONE).
classify() {
  local full tail
  full="$1"
  tail="$(printf '%s\n' "$full" | tail_region)"
  # DIALOG (whole screen)
  if printf '%s' "$full" | grep -qE "$DIALOG_RE"; then echo NEEDS_INPUT; return; fi
  if printf '%s' "$full" | grep -qE "$ALLOW_RE" && printf '%s' "$full" | grep -qE "$CHOOSER_RE"; then
    echo NEEDS_INPUT; return
  fi
  # BUSY (whole screen — status line may be pushed above the tail by an output burst)
  if printf '%s' "$full" | grep -qE "$BUSY_RE"; then echo BUSY; return; fi
  # IDLE (tail-anchored: composer or settled summary must be near the bottom)
  if printf '%s' "$tail" | grep -qE "$IDLE_RE"; then echo IDLE; return; fi
  echo UNKNOWN
}

# ─── Subcommands ─────────────────────────────────────────────────────────────

cmd_spawn() {
  local id="" dir="$PWD" mux="auto" flags="" allow_shared=0
  [ $# -ge 1 ] && { id="$1"; shift; }
  [ -n "$id" ] || die "spawn: need an <id>"
  # ids name tmux sessions (no '.'/':' allowed) and key waitall's <id>=<STATE>
  # output lines (no '='), so keep them boring.
  case "$id" in *[!A-Za-z0-9_-]*) die "spawn: id must be alphanumeric/_/- only" ;; esac
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir)              dir="$2"; shift 2 ;;
      --mux)              mux="$2"; shift 2 ;;
      --flags)            flags="$2"; shift 2 ;;
      --allow-shared-dir) allow_shared=1; shift ;;
      *) die "spawn: unknown arg '$1'" ;;
    esac
  done
  [ -d "$dir" ] || die "spawn: --dir '$dir' is not a directory"
  dir="$(cd "$dir" && pwd)"
  [ "$mux" = "auto" ] && mux="$(detect_mux)"
  [ "$mux" = tmux ] || [ "$mux" = cmux ] || die "spawn: --mux must be tmux|cmux|auto"

  mkdir -p "$ORCH_HOME"
  # keep state out of any repo even if ORCH_HOME was pointed inside one
  [ -f "$ORCH_HOME/.gitignore" ] || printf '*\n' > "$ORCH_HOME/.gitignore"
  [ -f "$(meta_file "$id")" ] && die "spawn: worker '$id' already exists (stop it first)"

  # same-dir footgun guard (--dangerously-skip-permissions has no approval gate)
  if [ "$allow_shared" -ne 1 ]; then
    local f odir
    shopt -s nullglob
    for f in "$ORCH_HOME"/*.meta; do
      odir="$(sed -n 's/^DIR=//p' "$f" | head -1)"
      [ "$odir" = "$dir" ] && die "spawn: dir '$dir' already used by $(basename "$f" .meta); use a separate git worktree, or pass --allow-shared-dir"
    done
  fi

  local cmd="claude --dangerously-skip-permissions"
  [ -n "$flags" ] && cmd="$cmd $flags"

  log "spawning '$id' via $mux in $dir"
  local target
  target="$("${mux}_spawn" "$id" "$dir" "$cmd")" || die "spawn failed"

  { echo "MUX=$mux"; echo "TARGET=$target"; echo "DIR=$dir"; echo "CREATED=$(date +%s)"; } > "$(meta_file "$id")"
  MUX="$mux"; TARGET="$target"

  # Wait for boot (~5-10s) + dismiss the conditional first-run trust dialog.
  # NOTE: this loop sleeps up to ~40s — callers should run spawn in background.
  local i screen
  for i in $(seq 1 40); do
    screen="$(mux_capture 60 | strip_ansi)" || true
    if printf '%s' "$screen" | grep -qE "$TRUST_RE"; then
      log "dismissing first-run trust dialog"
      mux_send_key Enter; sleep 1; continue
    fi
    if printf '%s' "$screen" | grep -qE 'bypass permissions on|\? for shortcuts|Welcome'; then
      log "'$id' booted (target=$target)"
      echo "$id"; return 0
    fi
    sleep 1
  done
  log "'$id' spawned but boot not confirmed; check: orchestrate poll $id"
  echo "$id"
}

# Prompt delivery shared by send/run. Caller must have run require_meta.
deliver_prompt() { # <id> <file> <inline> <got_inline> <enter_delay> <answer>
  local id="$1" file="$2" inline="$3" got_inline="$4" enter_delay="$5" answer="$6"
  mux_alive || die "send: worker '$id' is gone"

  # Refuse to send into a live human-decision dialog (would silently cancel it).
  # --answer is the ONLY way past this guard, and it asserts a HUMAN made the
  # decision being delivered — the dialog (or the >>> NEEDS_HUMAN: sentinel)
  # stays on screen after it is surfaced, so the guard would otherwise also
  # block the legitimate reply. Never pass --answer on the agent's own call.
  if [ "$answer" -ne 1 ]; then
    local probe
    probe="$(mux_capture 60 | strip_ansi)" || probe=""
    if printf '%s' "$probe" | grep -qE "$DIALOG_RE" && ! printf '%s' "$probe" | grep -qE "$TRUST_RE"; then
      die "send: worker '$id' is at a human-decision dialog (NEEDS_INPUT). Surface it to the user; deliver THEIR decision with --answer. Do not auto-answer."
    fi
  fi

  # Resolve prompt source into a temp file (uniform path for single/multi line).
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/orch.XXXXXX")"
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN
  if [ -n "$file" ]; then
    [ -f "$file" ] || die "send: --file '$file' not found"
    cat "$file" > "$tmp"
  elif [ "$got_inline" -eq 1 ]; then
    printf '%s' "$inline" > "$tmp"
  elif [ ! -t 0 ]; then
    cat > "$tmp"
  else
    die "send: no prompt (use --file, -- <text>, or pipe via stdin)"
  fi
  [ -s "$tmp" ] || die "send: empty prompt"

  dismiss_trust

  # Multiline (decided from the FILE, not a newline-stripped var) -> bracketed
  # paste (one block, no early submit). Single line -> literal type. Both submit
  # with a SEPARATE Enter after a short settle (neither text primitive submits).
  local nbytes
  nbytes="$(wc -c < "$tmp" | tr -d ' ')"
  if [ "$(grep -c '' "$tmp")" -gt 1 ]; then
    mux_send_paste "$tmp"
  else
    mux_send_text "$(cat "$tmp")"
  fi
  sleep "$enter_delay"
  mux_send_key Enter
  log "sent ${nbytes} bytes to '$id'"
}

cmd_send() {
  local id="" file="" enter_delay="0.5" inline="" got_inline=0 answer=0
  [ $# -ge 1 ] && { id="$1"; shift; }
  [ -n "$id" ] || die "send: need an <id>"
  while [ $# -gt 0 ]; do
    case "$1" in
      --file)        file="$2"; shift 2 ;;
      --enter-delay) need_num "send: --enter-delay" "$2"; enter_delay="$2"; shift 2 ;;
      --answer)      answer=1; shift ;;
      --) shift; inline="$*"; got_inline=1; break ;;
      *) die "send: unknown arg '$1' (use --file, -- <text>, or stdin)" ;;
    esac
  done
  require_meta "$id"
  deliver_prompt "$id" "$file" "$inline" "$got_inline" "$enter_delay" "$answer"
}

# send+wait fused — the loop primitive. One prompt in, one STATE= line out.
cmd_run() {
  local id="" file="" inline="" got_inline=0 enter_delay="0.5" answer=0
  local timeout=900 idle_cycles=3 interval=3 max_interval=10 show_screen=0
  [ $# -ge 1 ] && { id="$1"; shift; }
  [ -n "$id" ] || die "run: need an <id>"
  while [ $# -gt 0 ]; do
    case "$1" in
      --file)         file="$2"; shift 2 ;;
      --enter-delay)  need_num "run: --enter-delay" "$2"; enter_delay="$2"; shift 2 ;;
      --answer)       answer=1; shift ;;
      --timeout)      need_int "run: --timeout" "$2"; timeout="$2"; shift 2 ;;
      --idle-cycles)  need_int "run: --idle-cycles" "$2"; idle_cycles="$2"; shift 2 ;;
      --interval)     need_int "run: --interval" "$2"; interval="$2"; shift 2 ;;
      --max-interval) need_int "run: --max-interval" "$2"; max_interval="$2"; shift 2 ;;
      --screen)       show_screen=1; shift ;;
      --) shift; inline="$*"; got_inline=1; break ;;
      *) die "run: unknown arg '$1'" ;;
    esac
  done
  [ "$interval" -ge 1 ] || interval=1   # engine re-clamps the rest
  require_meta "$id"
  deliver_prompt "$id" "$file" "$inline" "$got_inline" "$enter_delay" "$answer"
  # One-interval grace before the first classify: let the submitted turn
  # visibly start, so a lingering pre-turn idle frame can't seed the settled
  # window into a false instant DONE.
  sleep "$interval"
  wait_engine "$timeout" "$idle_cycles" "$interval" "$max_interval" 0 "$id"
  report_single "$id" "$show_screen"
}

cmd_poll() {
  local id="${1:-}"; [ -n "$id" ] || die "poll: need an <id>"
  require_meta "$id"
  # single existence probe (instant command) — wait/waitall do the 3-strike confirm
  if ! mux_alive; then echo "STATE=GONE"; return; fi
  local screen state
  screen="$(mux_capture 60 | strip_ansi)" || { echo "STATE=UNKNOWN"; return; }
  state="$(classify "$screen")"
  echo "STATE=$state"
  echo "──────── last lines ────────"
  printf '%s\n' "$screen" | { grep -v '^[[:space:]]*$' || true; } | tail -20
}

# ─── Wait engine (shared by wait / run / waitall) ────────────────────────────
# Poll 1..N workers until each reaches a terminal state — DONE | NEEDS_INPUT |
# GONE, or TIMEOUT for whatever is unfinished at the deadline — with ONE sleep
# per cycle. Detection semantics are the classic, per-worker ones:
#   DONE  = K consecutive IDLE polls with an UNCHANGED volatility-normalized
#           tail hash (the first IDLE only arms the window),
#   GONE  = >=3 consecutive existence-probe failures (a single failed probe or
#           screen read is a skipped sample, never a verdict),
#   NEEDS_INPUT = classify() saw a human-decision dialog / sentinel.
# NEVER kills anything — TIMEOUT means "still alive, just slow".
#
# Only the CADENCE adapts: the sleep starts at <interval> and doubles up to
# <max_interval> while every pending worker stays BUSY/UNKNOWN with no state
# change; the moment any pending worker classifies IDLE (arming/counting the
# settled window) or ANY state transition happens, it snaps back to <interval>
# so DONE fires promptly. The last sleep is clamped so the <timeout> deadline
# is still checked on time.
#
# NOTE: index-parallel arrays, not `declare -A` — /usr/bin/env bash can be 3.2
# (macOS), where assoc arrays don't exist and `a[$k]` silently coerces every
# non-numeric key to index 0.
# Results (parallel to ENG_IDS): ENG_STATE[i] = terminal state, or last live
# state for targets still pending when --any returned early; ENG_SCREEN[i] =
# last capture; ENG_NTERM = how many targets went terminal.
wait_engine() { # <timeout> <idle_cycles> <interval> <max_interval> <any 0|1> <id>...
  local timeout="$1" idle_k="$2" base_iv="$3" max_iv="$4" any="$5"; shift 5
  [ "$idle_k" -ge 2 ] || idle_k=2       # the hash guard needs >=2 equal samples to mean anything
  [ "$base_iv" -ge 1 ] || base_iv=1
  [ "$max_iv" -ge "$base_iv" ] || max_iv="$base_iv"   # ceiling never below the base
  ENG_IDS=("$@"); ENG_STATE=(); ENG_SCREEN=(); ENG_NTERM=0
  local total="$#" i id
  local -a emux etgt term prevh consec gone prevst
  for i in "${!ENG_IDS[@]}"; do
    id="${ENG_IDS[$i]}"
    require_meta "$id"
    emux[i]="$MUX"; etgt[i]="$TARGET"
    ENG_STATE[i]=UNKNOWN; ENG_SCREEN[i]=""
    term[i]=0; prevh[i]=""; consec[i]=0; gone[i]=0; prevst[i]=""
  done
  local start now elapsed left cur="$base_iv" nterm=0 snap transition screen state h
  start="$(date +%s)"
  while :; do
    now="$(date +%s)"; elapsed=$(( now - start ))
    if [ "$elapsed" -ge "$timeout" ]; then
      for i in "${!ENG_IDS[@]}"; do
        [ "${term[$i]}" -eq 1 ] || { ENG_STATE[i]=TIMEOUT; term[i]=1; nterm=$(( nterm + 1 )); }
      done
      break
    fi
    snap=0; transition=0
    for i in "${!ENG_IDS[@]}"; do
      [ "${term[$i]}" -eq 1 ] && continue
      MUX="${emux[$i]}"; TARGET="${etgt[$i]}"
      if ! mux_alive; then
        # first failed probe counts as a transition so the 3-strike GONE
        # confirmation runs at base cadence, not a backed-off one
        [ "${prevst[$i]}" = "PROBE_FAIL" ] || transition=1
        prevst[i]="PROBE_FAIL"
        gone[i]=$(( gone[i] + 1 ))
        [ "${gone[$i]}" -ge 3 ] && { ENG_STATE[i]=GONE; term[i]=1; nterm=$(( nterm + 1 )); }
        continue
      fi
      gone[i]=0
      screen="$(mux_capture 60 | strip_ansi)" || continue   # transient read failure: skip the sample, keep counters
      ENG_SCREEN[i]="$screen"
      state="$(classify "$screen")"
      [ "$state" = "${prevst[$i]}" ] || transition=1
      prevst[i]="$state"
      ENG_STATE[i]="$state"
      h="$(tail_hash "$screen")"
      case "$state" in
        NEEDS_INPUT) term[i]=1; nterm=$(( nterm + 1 )) ;;
        IDLE)
          snap=1
          # first IDLE only arms the window; consec advances only on an UNCHANGED hash
          if [ -n "${prevh[$i]}" ] && [ "$h" = "${prevh[$i]}" ]; then consec[i]=$(( consec[i] + 1 ))
          else consec[i]=0; fi
          [ "${consec[$i]}" -ge $(( idle_k - 1 )) ] && { ENG_STATE[i]=DONE; term[i]=1; nterm=$(( nterm + 1 )); }
          ;;
        *) consec[i]=0 ;;
      esac
      prevh[i]="$h"
    done
    ENG_NTERM="$nterm"
    [ "$nterm" -ge "$total" ] && break
    [ "$any" -eq 1 ] && [ "$nterm" -ge 1 ] && break
    # adaptive cadence (see block comment): any change -> base; steady busy -> double
    if [ "$snap" -eq 1 ] || [ "$transition" -eq 1 ]; then
      cur="$base_iv"
    else
      cur=$(( cur * 2 )); [ "$cur" -gt "$max_iv" ] && cur="$max_iv"
    fi
    now="$(date +%s)"; left=$(( timeout - (now - start) ))
    [ "$cur" -gt "$left" ] && cur="$left"   # never oversleep past --timeout
    [ "$cur" -ge 1 ] || cur=1
    sleep "$cur"
  done
  ENG_NTERM="$nterm"
}

# Terminal report for a single-target wait/run. Default: EXACTLY one stdout
# line "STATE=<x>" (machine-parseable; diagnostics go to stderr). --screen
# appends the final screen and repeats STATE= as the last line for tail-readers.
report_single() { # <id> <show_screen 0|1>  (reads ENG_* slot 0)
  local id="$1"
  printf 'STATE=%s\n' "${ENG_STATE[0]}"
  if [ "$2" -eq 1 ]; then
    echo "──────── final screen ($id) ────────"
    printf '%s\n' "${ENG_SCREEN[0]}" | { grep -v '^[[:space:]]*$' || true; } | tail -25
    printf 'STATE=%s\n' "${ENG_STATE[0]}"
  fi
}

cmd_wait() {
  local id="" timeout=900 idle_cycles=3 interval=3 max_interval=10 show_screen=0
  [ $# -ge 1 ] && { id="$1"; shift; }
  [ -n "$id" ] || die "wait: need an <id>"
  while [ $# -gt 0 ]; do
    case "$1" in
      --timeout)      need_int "wait: --timeout" "$2"; timeout="$2"; shift 2 ;;
      --idle-cycles)  need_int "wait: --idle-cycles" "$2"; idle_cycles="$2"; shift 2 ;;
      --interval)     need_int "wait: --interval" "$2"; interval="$2"; shift 2 ;;
      --max-interval) need_int "wait: --max-interval" "$2"; max_interval="$2"; shift 2 ;;
      --screen)       show_screen=1; shift ;;
      *) die "wait: unknown arg '$1'" ;;
    esac
  done
  wait_engine "$timeout" "$idle_cycles" "$interval" "$max_interval" 0 "$id"
  report_single "$id" "$show_screen"
}

# Batch supervisor: ONE adaptive loop across a fleet. Observe-only — never
# kills, restarts, or answers anything. Output is implicitly quiet: one
# "<id>=<STATE>" line per target + a final "BATCH=<terminal>/<total>".
cmd_waitall() {
  local any=0 timeout=900 idle_cycles=3 interval=3 max_interval=10
  local ids=() f id i
  while [ $# -gt 0 ]; do
    case "$1" in
      --any)          any=1; shift ;;
      --timeout)      need_int "waitall: --timeout" "$2"; timeout="$2"; shift 2 ;;
      --idle-cycles)  need_int "waitall: --idle-cycles" "$2"; idle_cycles="$2"; shift 2 ;;
      --interval)     need_int "waitall: --interval" "$2"; interval="$2"; shift 2 ;;
      --max-interval) need_int "waitall: --max-interval" "$2"; max_interval="$2"; shift 2 ;;
      -*)             die "waitall: unknown arg '$1'" ;;
      *)              ids+=("$1"); shift ;;
    esac
  done
  if [ "${#ids[@]}" -eq 0 ]; then   # no ids -> every worker with a live meta here
    mkdir -p "$ORCH_HOME"
    shopt -s nullglob
    for f in "$ORCH_HOME"/*.meta; do
      id="$(basename "$f" .meta)"
      require_meta "$id" 2>/dev/null || continue
      ids+=("$id")
    done
  fi
  [ "${#ids[@]}" -gt 0 ] || die "waitall: no workers to wait for (spawn some, or pass ids)"
  log "waitall: supervising ${#ids[@]} worker(s): ${ids[*]}"
  wait_engine "$timeout" "$idle_cycles" "$interval" "$max_interval" "$any" "${ids[@]}"
  for i in "${!ENG_IDS[@]}"; do printf '%s=%s\n' "${ENG_IDS[$i]}" "${ENG_STATE[$i]}"; done
  printf 'BATCH=%s/%s\n' "$ENG_NTERM" "${#ENG_IDS[@]}"
}

cmd_logs() {
  local id="" lines=2000
  [ $# -ge 1 ] && { id="$1"; shift; }
  [ -n "$id" ] || die "logs: need an <id>"
  while [ $# -gt 0 ]; do
    case "$1" in
      --lines) need_int "logs: --lines" "$2"; lines="$2"; shift 2 ;;
      *) die "logs: unknown arg '$1'" ;;
    esac
  done
  require_meta "$id"
  mux_alive || { echo "(worker '$id' is gone)"; return; }
  mux_capture "$lines" | strip_ansi
}

cmd_attach() {
  local id="${1:-}"; [ -n "$id" ] || die "attach: need an <id>"
  require_meta "$id"
  mux_alive || die "attach: worker '$id' is gone"
  mux_attach "$id" "$DIR"
}

cmd_list() {
  mkdir -p "$ORCH_HOME"
  printf '%-16s %-6s %-22s %-12s %s\n' ID MUX TARGET STATE DIR
  local f id
  shopt -s nullglob
  for f in "$ORCH_HOME"/*.meta; do
    id="$(basename "$f" .meta)"
    require_meta "$id" 2>/dev/null || continue
    local state="gone"
    if mux_alive; then
      state="$(classify "$(mux_capture 60 | strip_ansi)")"
    fi
    printf '%-16s %-6s %-22s %-12s %s\n' "$id" "$MUX" "$TARGET" "$state" "$DIR"
  done
}

cmd_stop() {
  local id="${1:-}"; [ -n "$id" ] || die "stop: need an <id> or --all"
  if [ "$id" = "--all" ]; then
    shopt -s nullglob
    local f
    for f in "$ORCH_HOME"/*.meta; do cmd_stop "$(basename "$f" .meta)"; done
    return
  fi
  require_meta "$id"
  if mux_alive; then
    mux_send_key Escape 2>/dev/null || true   # interrupt any running turn first
    sleep 1
    mux_kill
  fi
  rm -f "$(meta_file "$id")"
  log "stopped '$id'"
}

# Reap orphaned tmux sessions for THIS ORCH_HOME (meta gone but session alive).
cmd_gc() {
  have tmux || { log "gc: tmux not present; nothing to sweep (cmux workspaces survive in the GUI — close via stop or the app)"; return; }
  local tag prefix s id reaped=0
  tag="$(orch_tag)"; prefix="orch_${tag}_"
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    case "$s" in "$prefix"*) ;; *) continue ;; esac
    id="${s#"$prefix"}"
    if [ ! -f "$(meta_file "$id")" ]; then
      tx kill-session -t "$s" 2>/dev/null && { log "gc: reaped orphan session $s"; reaped=$(( reaped + 1 )); } || true
    fi
  done < <(tx list-sessions -F '#{session_name}' 2>/dev/null || true)
  log "gc: reaped $reaped orphan(s)"
}

usage() {
  cat >&2 <<EOF
orchestrate.sh — drive worker \`claude\` sessions in tmux or cmux.

Loop commands print machine lines on STDOUT (diagnostics on stderr):
  run/wait -> one line  STATE=DONE|NEEDS_INPUT|TIMEOUT|GONE
  waitall  -> one <id>=<STATE> line per target + final BATCH=<terminal>/<total>
  poll     -> first line STATE=BUSY|IDLE|NEEDS_INPUT|UNKNOWN|GONE

  spawn <id> [--dir <path>] [--mux tmux|cmux|auto] [--flags "<extra>"] [--allow-shared-dir]
        Launch \`claude --dangerously-skip-permissions\`, dismiss first-run dialog.
        Sleeps during boot (~40s) — run as a BACKGROUND command. Refuses a --dir
        already in use by a live worker unless --allow-shared-dir. id: [A-Za-z0-9_-]+.
  run   <id> [--file <f> | -- <text...>] [--answer] [--timeout <s>] [--idle-cycles <k>]
             [--interval <s>] [--max-interval <s>] [--screen] [--enter-delay <s>]
        send+wait FUSED: submit the prompt (or stdin), block until the worker
        settles, print exactly one STATE=<x> line (--screen appends the final
        screen, repeating STATE= last). The loop primitive. BACKGROUND.
  send  <id> [--file <promptfile> | -- <inline text...>] [--answer] [--enter-delay <s>]
        Type a prompt (also reads stdin) and submit it WITHOUT waiting — the
        fan-out primitive. Refuses into a live human-decision dialog unless
        --answer (= a HUMAN decided; never pass it on your own initiative).
        Multiline -> one bracketed-paste block + Enter.
  wait  <id> [--timeout <s>] [--idle-cycles <k>] [--interval <s>] [--max-interval <s>] [--screen]
        Block until settled WITHOUT sending (re-arm after TIMEOUT, or follow a
        bare send). Same one-line STATE=<x> contract as run. BACKGROUND.
  waitall [<id>...] [--any] [--timeout <s>] [--idle-cycles <k>] [--interval <s>] [--max-interval <s>]
        Supervise MANY workers in ONE loop (no ids = all in this ORCH_HOME).
        Default returns when ALL are terminal; --any returns at the FIRST
        (others report their live state). Observe-only — never kills. BACKGROUND.
  poll  <id>
        STATE=<x> + last ~20 lines. Instant, non-blocking.
  logs  <id> [--lines <n>]
        Full capture incl. scrollback (default 2000 lines). Instant.
  attach <id>
        Open a LIVE READ-ONLY view (never disrupts/kills the worker). tmux
        worker: opens a new cmux pane running \`tmux attach -r\`; if cmux is
        unreachable, prints that command for you to run yourself. cmux worker:
        focuses its workspace (GUI-owned, no read-only view exists).
  list  Table of workers + current state. Instant.
  stop  <id> | stop --all
        Interrupt, close the session/workspace, remove meta. Sleeps briefly.
  gc    Reap orphaned tmux sessions for THIS ORCH_HOME (run after a crash).

Waiting adapts its cadence: sleeps start at --interval (3s) and double up to
--max-interval (10s, never below the base) while the screen stays BUSY/UNKNOWN,
snapping back to base the moment anything changes (esp. IDLE, which arms the
settled window). DONE still = --idle-cycles (min 2) consecutive IDLE polls with
an unchanged volatility-normalized tail. NOTHING is ever killed on timeout.

State dir: $ORCH_HOME
Env: ORCH_HOME, ORCH_TMUX_SOCK, ORCH_ASCII_ONLY, CLASSIFY_TAIL.
EOF
  exit 1
}

main() {
  local sub="${1:-}"; [ $# -gt 0 ] && shift || true
  case "$sub" in
    spawn)   cmd_spawn   "$@" ;;
    send)    cmd_send    "$@" ;;
    run)     cmd_run     "$@" ;;
    poll)    cmd_poll    "$@" ;;
    wait)    cmd_wait    "$@" ;;
    waitall) cmd_waitall "$@" ;;
    logs)    cmd_logs    "$@" ;;
    attach)  cmd_attach  "$@" ;;
    list)    cmd_list    "$@" ;;
    stop)    cmd_stop    "$@" ;;
    gc)      cmd_gc      "$@" ;;
    ""|-h|--help|help) usage ;;
    *) die "unknown subcommand '$sub' (try: orchestrate help)" ;;
  esac
}

main "$@"