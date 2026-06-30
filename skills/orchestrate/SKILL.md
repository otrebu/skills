---
name: orchestrate
description: 'Delegate one or more coding tasks to background worker `claude` sessions and babysit them — spawn each in its own tmux pane or cmux workspace, send a prompt, poll/wait for completion, collect the result, then stop. Use when the user says "spin up a worker / sub-agent to do X", "run these in parallel", "fan this out", "delegate X while I keep working", "drive another claude", or otherwise wants long-running tasks handled by separate claude instances you supervise. SAFETY: workers run with --dangerously-skip-permissions (no per-action approval) in whatever directory you point them at — only use on repos/dirs the user trusts you to modify autonomously, and surface NEEDS_INPUT to a human rather than auto-answering.'
---

# orchestrate

Drive background worker `claude` sessions from this session. Each worker lives in its own tmux pane (private socket) or cmux workspace; you supervise by screen-scraping its TUI. One script, `orchestrate.sh`, backs every step and is mux-agnostic.

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

Workers launch `claude --dangerously-skip-permissions` — they edit files and run commands **with no approval prompts**. Only spawn against directories the user has entrusted to autonomous work. Never auto-answer a worker's dialog: when `wait`/`poll` reports `NEEDS_INPUT`, **surface the rendered dialog to the user and let a human decide.** The only auto-dismiss is the one-time first-run folder-trust prompt at spawn (an environment prompt, not a task decision).

**`DONE` does not mean "task complete."** It means the worker's screen settled into an idle composer. A worker can settle while asking you a free-text clarifying question ("Should I use approach A or B?") — that prose is NOT detectable as a dialog. So after every `DONE`: **read the collected `logs` and look for a trailing question or an unfinished plan before you send the next prompt or `stop`.** To make this machine-detectable, the recommended spawn prompt tells workers to emit a sentinel line `>>> NEEDS_HUMAN: <question>` when they need you; that sentinel IS detected and surfaced as `NEEDS_INPUT`.

## The loop

```
spawn ─▶ send ─▶ wait[background] ─▶ collect(logs) ─▶ act ─▶ stop
                      │
                      └─ NEEDS_INPUT ─▶ surface to human ─▶ send their answer ─▶ wait
```

1. **spawn** a worker with a stable id, in a dir **the user explicitly trusts for autonomous, unprompted edits**.
   `"$ORCH" spawn fix-auth --dir /path/to/repo` (add `--mux tmux|cmux` to force a backend; default auto). Spawning sleeps during boot (~up to 40s) — run it as a BACKGROUND command. Prepend your task with the human-input contract, e.g.:
   `"If you need a human decision, print a line exactly: >>> NEEDS_HUMAN: <your question> and stop."`
2. **send** the task prompt. Multiline is fine — it is pasted as one block, not submitted line-by-line. `send` sleeps briefly; run it as a BACKGROUND command. It refuses to send if the worker is sitting at a real human-decision dialog (check `poll` first).
   `"$ORCH" send fix-auth --file task.md` or `"$ORCH" send fix-auth -- "Refactor X, keep the public API, add tests"`.
3. **wait** for it to settle. **This blocks (it sleeps internally) — you MUST run it as a BACKGROUND command**, because the harness cannot run foreground sleeps. Read its final output (last line is `STATE=...`) when it returns.
   `"$ORCH" wait fix-auth --timeout 1200` (run in background).
4. **collect** the full transcript once `STATE=DONE`, and scan it for trailing questions (see SAFETY).
   `"$ORCH" logs fix-auth --lines 2000`.
5. **act** on the result (review the diff, run tests, summarize for the user).
6. **stop** the worker when finished. `"$ORCH" stop fix-auth` (or `stop --all`). `stop` sleeps briefly; run it as a BACKGROUND command.

For a quick non-blocking status check instead of waiting, use `poll`. `poll`, `logs`, `list`, and `attach` are instant/foreground-safe; `spawn`, `send`, `wait`, and `stop` sleep and should run in the background.

## Reading states

`poll`/`wait`/`list` classify the worker's screen into:

| State | Meaning | What you do |
|---|---|---|
| `BUSY` | A turn is running (spinner line ending in `(esc to interrupt)`, or `ctrl-c to stop/cancel`). | Keep waiting. |
| `IDLE` | Turn finished, composer empty and waiting (last non-blank line is the `❯`/`>` composer), or a settled past-tense summary. `wait` only calls `DONE` after several consecutive IDLE polls with an **unchanged** screen (volatile counters normalized out) — so a brief pause between tool calls won't fool it. | Collect, read for trailing questions, then send the next prompt or stop. |
| `NEEDS_INPUT` | Blocked on a human choice: a chooser dialog (numbered options / `Esc to cancel` / `Do you want` / `(y/n)`), or the worker printed the `>>> NEEDS_HUMAN:` sentinel. | **Surface to the user. Do not auto-answer.** After they decide, `send` the choice (e.g. `-- "1"` or `-- "yes"`), then `wait` again. |
| `UNKNOWN` | No marker matched (e.g. long thinking with no spinner, or a footer-only screen). Treated as "not done". | Keep waiting; `wait` will not advance toward DONE on UNKNOWN. |

`wait` terminal states printed as the **last line** `STATE=<x>`:
- `DONE` — settled. Collect, read for trailing questions, proceed.
- `NEEDS_INPUT` — surface to human (above).
- `TIMEOUT` — still alive, just slow. **Never kill on timeout** — re-`wait` with a larger `--timeout`, or `poll`/`logs` to inspect, then escalate to the user if truly stuck.
- `GONE` — the session/workspace died (confirmed by a repeated existence probe, not a single failed read). Grab `logs` if still readable, then `stop` to clean up the meta.

## Fan-out (multiple workers)

Give each a distinct id and spawn independently — they are fully isolated (separate tmux sessions / cmux workspaces).

**NEVER point two workers at the same `--dir`.** Both run with `--dangerously-skip-permissions`; two in one directory will clobber each other's edits and race on the git index with no approval gate to stop them. Each worker MUST get its own git worktree (`git worktree add ../wt-<id>`) or its own copy. `spawn` refuses a `--dir` already in use by a live worker unless you pass `--allow-shared-dir`.

```bash
git -C "$REPO" worktree add ../wt-api && git -C "$REPO" worktree add ../wt-ui
"$ORCH" spawn w_api --dir ../wt-api; "$ORCH" send w_api --file api.md   # both in background
"$ORCH" spawn w_ui  --dir ../wt-ui ; "$ORCH" send w_ui  --file ui.md
# wait on each in its OWN background command, then collect per id:
"$ORCH" wait w_api --timeout 1800   # background
"$ORCH" wait w_ui  --timeout 1800   # background
"$ORCH" list                        # snapshot of every worker's state
```

Use `list` for a one-glance table of all workers and their current state.

## Recovery / cleanup

Workers are detached processes; if this orchestrator crashes between `spawn` and `stop`, the worker keeps running `claude --dangerously-skip-permissions` and burning tokens. To reap orphans:

- `"$ORCH" stop --all` — stop every worker that still has a meta in this `ORCH_HOME`.
- `"$ORCH" gc` — sweep the private tmux socket for orphaned worker sessions tagged for THIS `ORCH_HOME` (sessions whose meta is gone) and kill them. Run this after a crash. (cmux workspaces survive in the GUI and can be closed there or via `stop`.)

## tmux vs cmux

`--mux auto` (default) picks **cmux** when its app/socket is reachable (`cmux ping`), else **tmux**. Both expose identical mechanics through the script. tmux workers run on a **private socket** (`-L cc`, override `ORCH_TMUX_SOCK`) so they never collide with the user's own tmux; session names are namespaced per `ORCH_HOME` so two orchestrators on the same socket can't clobber each other. cmux workers are real workspaces in the cmux GUI, so the user can watch/intervene there directly.

**ids are unique only within one `ORCH_HOME`.** If two people/agents share the same `ORCH_TMUX_SOCK`, the per-`ORCH_HOME` namespacing keeps `stop --all`/`gc` from touching each other's workers; to be fully independent, give each its own `ORCH_TMUX_SOCK`.

**Control plane vs view plane.** tmux is the control plane — `spawn`/`send`/`poll`/`wait`/`stop` script every tmux worker directly. cmux is an on-demand view plane: `attach <id>` opens a new cmux pane running **read-only** `tmux attach -r`, which can never type into, interrupt, or kill the worker, and supports any number of concurrent viewers. Viewer workspaces aren't tracked in `ORCH_HOME`, so close them yourself — `gc`/`stop` won't. If cmux isn't reachable it prints the `tmux -L <sock> attach -r -t <session>` command to run yourself; for a cmux-backed (GUI-owned) worker, `attach` just focuses its workspace instead.

## Tuning (env vars)

`ORCH_HOME` (state dir, default `${XDG_STATE_HOME:-$HOME/.local/state}/orchestrate` — outside any repo so meta files with absolute paths never get committed), `ORCH_TMUX_SOCK`, `ORCH_ASCII_ONLY=1` (force ASCII detection under non-UTF-8 locales), `CLASSIFY_TAIL` (how many bottom lines the idle/composer test scans; busy/dialog markers are searched across the whole capture). For bursty multi-tool runs that pause often, raise `wait --idle-cycles` (min 2; e.g. 4–5) or `--interval`. The detection regexes are centralized and commented at the top of `orchestrate.sh` — tune there if a future TUI version changes its markers.
