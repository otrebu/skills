---
name: orchestrate
description: 'Delegate one or more coding tasks to background worker `claude` sessions and babysit them — spawn each in its own tmux pane or cmux workspace, send a prompt, poll/wait for completion, collect the result, then stop. Use when the user says "spin up a worker / sub-agent to do X", "run these in parallel", "fan this out", "delegate X while I keep working", "drive another claude", or otherwise wants long-running tasks handled by separate claude instances you supervise. SAFETY: workers run with --dangerously-skip-permissions (no per-action approval) in whatever directory you point them at — only use on repos/dirs the user trusts you to modify autonomously, and surface NEEDS_INPUT to a human rather than auto-answering.'
---

# orchestrate

Drive background worker `claude` sessions from this session. Each worker lives in its own tmux pane (private socket) or cmux workspace; you supervise by screen-scraping its TUI. One script, `orchestrate.sh`, backs every step and is mux-agnostic. Loop commands print machine-parseable `KEY=VALUE` lines on **stdout** (diagnostics go to stderr): you parse one line per worker, never a screen dump.

```bash
# `orchestrate.sh` ships in THIS skill's directory (next to this SKILL.md). Set
# ORCH to its absolute path — the directory this SKILL.md was loaded from. This
# resolves the usual install/repo locations (canonical copy first, repo last):
ORCH="$(command ls \
  "$HOME/.agents/skills/orchestrate/orchestrate.sh" \
  "$HOME/.claude/skills/orchestrate/orchestrate.sh" \
  "./skills/orchestrate/orchestrate.sh" 2>/dev/null | head -1)"
[ -x "$ORCH" ] || echo "orchestrate.sh not found — set ORCH to this skill's orchestrate.sh"
```

## SAFETY (read first)

Workers launch `claude --dangerously-skip-permissions` — they edit files and run commands **with no approval prompts**. Only spawn against directories the user has entrusted to autonomous work. Never auto-answer a worker's dialog: when `run`/`wait`/`waitall`/`poll` reports `NEEDS_INPUT`, **surface the rendered dialog (`poll` or `logs`) to the user and let a human decide.** Deliver their decision with `--answer` — `send`/`run` refuse to type into a live human-decision dialog without it, and you must NEVER pass `--answer` on your own initiative. The only auto-dismiss is the one-time first-run folder-trust prompt at spawn (an environment prompt, not a task decision).

**`DONE` does not mean "task complete."** It means the worker's screen settled into an idle composer. A worker can settle while asking you a free-text clarifying question ("Should I use approach A or B?") — that prose is NOT detectable as a dialog. So after every `STATE=DONE`: **read the collected `logs` and look for a trailing question or an unfinished plan before you send the next prompt or `stop`.** To make this machine-detectable, the recommended spawn prompt tells workers to emit a sentinel line `>>> NEEDS_HUMAN: <question>` when they need you; that sentinel IS detected and surfaced as `NEEDS_INPUT`.

**Never kill on timeout.** `STATE=TIMEOUT` means still alive, just slow. Nothing in `run`/`wait`/`waitall` ever kills a worker — only you do, via `stop`, once the task is truly finished.

## The loop

```
spawn ─▶ run(prompt) ─▶ STATE=DONE ─▶ logs ─▶ act ─▶ run(next prompt) … ─▶ stop
              │
              ├─ STATE=NEEDS_INPUT ─▶ surface to human ─▶ run --answer -- "<their choice>"
              ├─ STATE=TIMEOUT ─────▶ still working: wait again (NEVER kill)
              └─ STATE=GONE ────────▶ worker died: logs if readable, then stop
```

`run` fuses send+wait and is the loop primitive: submit a prompt, block until the worker settles, print **exactly one stdout line** — `STATE=DONE|NEEDS_INPUT|TIMEOUT|GONE`. `run`, `wait`, and `waitall` sleep internally: **always run them as BACKGROUND commands** (the harness cannot run foreground sleeps).

1. **spawn** a worker with a stable id (`[A-Za-z0-9_-]+`), in a dir **the user explicitly trusts for autonomous, unprompted edits**.
   `"$ORCH" spawn fix-auth --dir /path/to/repo` (add `--mux tmux|cmux` to force a backend; default auto). Sleeps during boot (~up to 40s) — BACKGROUND. Prepend your task with the human-input contract, e.g.:
   `"If you need a human decision, print a line exactly: >>> NEEDS_HUMAN: <your question> and stop."`
2. **run** the task prompt (sources: `--file task.md`, `-- <inline text...>`, or stdin; multiline is pasted as one block, never submitted line-by-line):
   ```bash
   "$ORCH" run fix-auth --file task.md --timeout 1200    # BACKGROUND; when it returns, stdout is exactly:
   # STATE=DONE
   ```
   Parse that single line (e.g. `case` on `STATE=DONE|STATE=NEEDS_INPUT|STATE=TIMEOUT|STATE=GONE`). Add `--screen` only when a human wants the final screen appended (the last line then repeats `STATE=<x>`).
3. **collect** on `STATE=DONE`: `"$ORCH" logs fix-auth --lines 2000` — and scan for trailing questions (see SAFETY).
4. **act** on the result (review the diff, run tests, summarize for the user).
5. **iterate**: the next prompt is just another `run`. To keep waiting WITHOUT sending anything new (after `TIMEOUT`, or after a bare `send`), use `wait` — same one-line contract: `"$ORCH" wait fix-auth --timeout 1800` → `STATE=<x>`.
6. **stop** the worker when finished: `"$ORCH" stop fix-auth` (or `stop --all`). Sleeps briefly — BACKGROUND.

`poll` is the instant, non-blocking check: first line `STATE=BUSY|IDLE|NEEDS_INPUT|UNKNOWN|GONE`, then the last ~20 screen lines. `send` types+submits without waiting — the fan-out primitive (below). Instant/foreground-safe: `poll`, `logs`, `list`, `attach`. Sleeping/BACKGROUND: `spawn`, `send`, `run`, `wait`, `waitall`, `stop`.

## Reading states

Live states (what `poll`/`list` show, and what `waitall --any` reports for still-running targets):

| State | Meaning | What you do |
|---|---|---|
| `BUSY` | A turn is running (status line with `esc to interrupt`, or `ctrl-c to stop/cancel`). | Keep waiting. |
| `IDLE` | Turn finished, composer empty and waiting (last non-blank line is the `❯`/`>` composer), or a settled past-tense summary. `run`/`wait`/`waitall` only call `DONE` after several consecutive IDLE polls with an **unchanged** screen (volatile counters normalized out) — a brief pause between tool calls won't fool it. | Collect, read for trailing questions, then `run` the next prompt or `stop`. |
| `NEEDS_INPUT` | Blocked on a human choice: a chooser dialog (numbered options / `Esc to cancel` / `Do you want` / `(y/n)`), or the worker printed the `>>> NEEDS_HUMAN:` sentinel. | **Surface to the user. Do not auto-answer.** After they decide, deliver it: `"$ORCH" run fix-auth --answer -- "1"` (`--answer` asserts a HUMAN made this choice — required because the dialog/sentinel is still on screen). |
| `UNKNOWN` | No marker matched (e.g. long thinking with no spinner, or a footer-only screen). Treated as "not done". | Keep waiting; nothing advances toward DONE on UNKNOWN. |

Terminal states — the one-line verdicts of `run`/`wait` (`STATE=<x>`) and per-id in `waitall` (`<id>=<x>`):

- `DONE` — settled. Collect `logs`, read for trailing questions, proceed.
- `NEEDS_INPUT` — surface to human (above).
- `TIMEOUT` — still alive, just slow. **Never kill on timeout** — `wait` again with a larger `--timeout`, or `poll`/`logs` to inspect, then escalate to the user if truly stuck.
- `GONE` — the session/workspace died (confirmed by repeated existence probes, not a single failed read). Grab `logs` if still readable, then `stop` to clean up the meta.

## Fan-out (multiple workers)

Give each a distinct id and spawn independently — they are fully isolated (separate tmux sessions / cmux workspaces).

**NEVER point two workers at the same `--dir`.** Both run with `--dangerously-skip-permissions`; two in one directory will clobber each other's edits and race on the git index with no approval gate to stop them. Each worker MUST get its own git worktree (`git worktree add ../wt-<id>`) or its own copy. `spawn` refuses a `--dir` already in use by a live worker unless you pass `--allow-shared-dir`.

The batch pattern is `send` to each (no waiting), then ONE `waitall` loop over the fleet:

```bash
git -C "$REPO" worktree add ../wt-api && git -C "$REPO" worktree add ../wt-ui
"$ORCH" spawn w_api --dir ../wt-api && "$ORCH" send w_api --file api.md   # background
"$ORCH" spawn w_ui  --dir ../wt-ui  && "$ORCH" send w_ui  --file ui.md   # background
"$ORCH" waitall --timeout 1800      # ONE supervised loop over the whole fleet — background
```

`waitall` (no ids = every worker in this `ORCH_HOME`; or list explicit ids) polls all targets in one adaptive loop and prints, as its ENTIRE stdout, one line per target plus a batch summary:

```
w_api=DONE
w_ui=NEEDS_INPUT
BATCH=2/2
```

- Default: returns when EVERY target is terminal (`DONE|NEEDS_INPUT|TIMEOUT|GONE`); `BATCH=<n_terminal>/<n_total>`.
- `--any`: returns at the FIRST terminal target; the others report their live state (`BUSY|IDLE|UNKNOWN` = still running). Dispatch-as-they-finish:

```bash
pending=(w_api w_ui w_db)
while [ "${#pending[@]}" -gt 0 ]; do
  "$ORCH" waitall --any "${pending[@]}"   # background; e.g. → w_api=DONE / w_ui=BUSY / w_db=BUSY / BATCH=1/3
  # for every id whose state is terminal: logs → act → run next prompt or stop,
  # then drop it from pending and loop again on the rest
done
```

`waitall` observes only — it never kills, restarts, or answers anything. `list` remains the one-glance human table of all workers.

## Recovery / cleanup

Workers are detached processes; if this orchestrator crashes between `spawn` and `stop`, the worker keeps running `claude --dangerously-skip-permissions` and burning tokens. To reap orphans:

- `"$ORCH" stop --all` — stop every worker that still has a meta in this `ORCH_HOME`.
- `"$ORCH" gc` — sweep the private tmux socket for orphaned worker sessions tagged for THIS `ORCH_HOME` (sessions whose meta is gone) and kill them. Run this after a crash. (cmux workspaces survive in the GUI and can be closed there or via `stop`.)

## tmux vs cmux

`--mux auto` (default) picks **cmux** when its app/socket is reachable (`cmux ping`), else **tmux**. Both expose identical mechanics through the script. tmux workers run on a **private socket** (`-L cc`, override `ORCH_TMUX_SOCK`) so they never collide with the user's own tmux; session names are namespaced per `ORCH_HOME` so two orchestrators on the same socket can't clobber each other. cmux workers are real workspaces in the cmux GUI, so the user can watch/intervene there directly.

**ids are unique only within one `ORCH_HOME`.** If two people/agents share the same `ORCH_TMUX_SOCK`, the per-`ORCH_HOME` namespacing keeps `stop --all`/`gc` from touching each other's workers; to be fully independent, give each its own `ORCH_TMUX_SOCK`.

**Control plane vs view plane.** tmux is the control plane — `spawn`/`send`/`run`/`poll`/`wait`/`stop` script every tmux worker directly. cmux is an on-demand view plane: `attach <id>` opens a new cmux pane running **read-only** `tmux attach -r`, which can never type into, interrupt, or kill the worker, and supports any number of concurrent viewers. Viewer workspaces aren't tracked in `ORCH_HOME`, so close them yourself — `gc`/`stop` won't. If cmux isn't reachable it prints the `tmux -L <sock> attach -r -t <session>` command to run yourself; for a cmux-backed (GUI-owned) worker, `attach` just focuses its workspace instead.

## Tuning

**Adaptive cadence.** `run`/`wait`/`waitall` poll on an adaptive clock: sleeps start at `--interval` (default 3s) and double while the screen stays `BUSY`/`UNKNOWN` with no state change, capped at `--max-interval` (default 10s, never below the base). Any state change — in particular going `IDLE`, which arms the settled window — snaps the cadence back to `--interval`, so `DONE` lands within a few polls of the turn actually finishing; the final sleep is clamped so the `--timeout` deadline is checked on time. For hour-long turns raise `--max-interval` (e.g. 30) to make steady-state supervision near-free. Completion detection itself never changes: `DONE` = `--idle-cycles` (default 3, min 2) consecutive `IDLE` polls with an unchanged volatility-normalized screen tail. For bursty multi-tool runs that pause often, raise `--idle-cycles` (4–5).

**Env vars.** `ORCH_HOME` (state dir, default `${XDG_STATE_HOME:-$HOME/.local/state}/orchestrate` — outside any repo so meta files with absolute paths never get committed), `ORCH_TMUX_SOCK`, `ORCH_ASCII_ONLY=1` (force ASCII detection under non-UTF-8 locales), `CLASSIFY_TAIL` (how many bottom lines the idle/composer test scans; busy/dialog markers are searched across the whole capture). The detection regexes are centralized and commented at the top of `orchestrate.sh` — tune there if a future TUI version changes its markers.
