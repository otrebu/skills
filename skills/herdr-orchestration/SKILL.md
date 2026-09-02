---
name: herdr-orchestration
description: Orchestrate agent workers through Herdr from any host agent, with capability-based routing, supervised integration, and scoped cleanup.
disable-model-invocation: true
---

# Herdr Orchestration

Treat the current agent session as the control tower, regardless of its CLI or model. Keep decomposition, routing, integration, user communication, and final review in this host session.

Load and follow the `herdr` skill before issuing Herdr commands. Continue only when `HERDR_ENV=1`, and use the installed CLIs as the authority for supported launch options. Herdr's discovery commands print their help and exit 2; treat that as success for discovery and do not run them under `set -e`.

## Topology

The `herdr` skill governs command mechanics and safety. Where its defaults disagree with this skill — sibling-pane topology, no new tabs, or its `--wait`-at-prompt guidance — this skill wins: an orchestration run is an explicit request for this topology and this dispatch behavior.

Keep the control tower and every worker in the current Herdr workspace. Leave the control-tower pane in its existing tab. Rename that pane and that tab `orchestrator` before creating workers; do not create a new tab for the control tower, and do not add either ID to the cleanup ledger:

```bash
herdr pane rename "$HERDR_PANE_ID" orchestrator
herdr tab rename "$HERDR_TAB_ID" orchestrator
```

Create worker tabs in that workspace, group related workstreams in the same tab, and cap each worker tab at four panes:

```bash
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$PWD" --label "<role>" --no-focus
herdr pane split --pane <worker-pane-id> --direction right --cwd "$PWD" --no-focus
```

Read `result.tab` and `result.root_pane` from the create response. `herdr tab create` already returns a `root_pane`, so count it against the cap rather than splitting a spare. Split from a worker pane, never `--current`, which is the control tower. Split a wide pane to the right and a tall one down. Reuse a matching tab this run created while it has capacity; otherwise create another clearly named tab. Never place a worker in a tab belonging to another session.

Give every worker tab and pane a concise role label: `--label` on `herdr tab create`, then `herdr pane rename <pane_id> "<role>"` for each worker pane, including the tab's root pane. Preserve focus in the control-tower pane during background work. Record every tab ID, pane ID, and agent name created during the run; this ledger defines the resources eligible for cleanup and the names that `herdr agent prompt` and `herdr agent wait` target. Moving a pane between workspaces changes its ID, so re-read the response and update the ledger after any move.

## Worker agent

Read the host agent from Herdr rather than guessing it:

```bash
herdr pane current --current
```

Take the `agent` field of the returned pane; its value is also the `--kind` value for `herdr agent start`, and read [references/agent-launch.md](references/agent-launch.md) for each executable's kind and autonomous flags. Use that agent for every worker in the run, and keep the CLI the same across the roles below. Model and effort come from the user or a binding skill, never from this skill: when neither names one, run every role at local configuration's defaults. State the resolved agent in the first status report, so the user can redirect before work spreads across panes.

Use a different agent only when the user names one, a binding skill pins one, or the host agent cannot run in a worker pane. Ask which agent to use when the pane reports no agent, when the resolved executable is missing from `PATH`, or when the user requested a capability the host agent does not have. Never substitute another CLI silently.

## Capability routing

| Role | Assign | Select |
|---|---|---|
| **Control tower** | Decomposition, routing, integration, user communication, and final review. | The current host session. |
| **Default worker** | Ordinary implementation, research, debugging, and review. | The host agent at local configuration's defaults; pass no model or effort flags. |
| **Specialist worker** | Work that benefits from a particular agent's coding, tool-use, architecture, or synthesis strengths. | The host agent, or an agent the user named, at local configuration's defaults unless the user or a binding skill named a model. |
| **Maximum worker** | The hardest isolated work, recovery from stalled work, adversarial review, or independent final review. | The host agent at the strongest model and effort the user or a binding skill named; when neither named one, keep local configuration's defaults and say so in the status report. |

Start uncertain work with a default worker. Promote work to a specialist when its shape is clear, and reserve maximum workers for observed difficulty or high stakes. Keep the host as coordinator even when a worker is stronger.

Launch each worker with `herdr agent start <name> --kind <kind> --pane <pane-id> -- <posture-flags>`, taking the flags from §Worker permissions below, using the kind that matches the host agent and a unique name the ledger records. Run `herdr agent` for the installed kind list. Native agent arguments go after `--`. Let local configuration choose model and effort. Apply explicit model or effort flags only when the user supplied them or a binding skill pins them; a `--model` or `--effort` flag merely existing on the worker's CLI is not a reason to set it. Agent names must be unique among all live agents in the session, not just this run, and a previous run's workers keep their names for as long as their panes stay open. Check `herdr agent list` before choosing a name and prefix this run's names so they cannot collide. If `agent start` returns `agent_name_taken`, its message names the pane still holding the name: choose another name, or release the old one with `herdr agent rename <target> --clear` once the user agrees that worker is finished.

## Worker permissions

Launch each worker in its agent's approved autonomous mode, passing the flags after `--`:

```bash
herdr agent start <name> --kind <kind> --pane <pane-id> -- <posture-flags>
```

Take each agent's `--kind` and posture flags from [references/agent-launch.md](references/agent-launch.md); it is the reference of record, so read it rather than reciting flags from memory. A binding skill may repeat a complete launch command so that it still works when the matrix is not installed; where a repeated command and the matrix disagree, the matrix wins. Where the matrix shows a safe unrestricted mode, use it so the worker runs without prompting. For an agent outside the matrix, use its documented unrestricted mode; when it has none, launch it plain and say so.

The matrix keeps Codex sandboxed and reviewed rather than unrestricted, so a Codex worker can report `blocked` mid-run; on a Codex host every worker is this case. Expect those states and handle them through the dispatch loop.

Unrestricted workers edit and run commands without asking, so launch them only in a directory the user has entrusted to autonomous work. Honor an explicit permission override from the user.

## Dispatch loop

1. Decompose the task into independent, verifiable workstreams. Give each workstream one owner, one deliverable, and one verification requirement. Serialize workstreams that edit the same files or depend on unfinished output. This step is complete when every active workstream has an unambiguous boundary and owner.
2. Route each workstream by capability, place its owner under the topology rules, and submit its prompt with `herdr agent prompt <name> "<text>"`, containing the objective, scope, deliverable, verification, and coordination boundaries. Prompt by agent name rather than with `herdr pane run`, which parks long prompt text in the composer instead of sending it. Leave dispatch non-blocking so workers run concurrently; supervise in the next step rather than adding `--wait` here. `herdr agent prompt` returns a pre-send snapshot, so a successful prompt still reports `agent_status` `idle`; confirm the transition with `herdr agent get <name>` rather than reading it off the prompt response. This step is complete when every dispatched worker has moved to `working` or reported a block.
3. Supervise through Herdr with `herdr agent wait <name> --timeout <ms>`, whose defaults settle on `idle`, `done`, or `blocked`; add `--until` only for a state-specific wait, and always bound the wait so a stalled worker cannot hang the control tower. Inspect current status and output first with `herdr agent get <name>` and `herdr agent read <name> --source recent-unwrapped`; treat `idle` or `done` as completion and `blocked` as a decision point. Text sitting in a worker's composer may be a dim CLI suggestion rather than real input, so read it with `herdr agent read <name> --source visible --format ansi` before treating it as a queued prompt or as the user's words. A suggestion is wrapped in the dim SGR code `ESC[2m`; real input arrives at normal brightness. Surface blocked decisions to the user. This step is complete when each worker has produced a reviewable result, been reassigned, or been explicitly dropped.
4. Integrate accepted output in the control tower. Inspect worker results and diffs, resolve interactions, and run the relevant verification. Escalate unexpectedly difficult or stalled work using the routing table. This step is complete when all accepted output forms one verified result.
5. Review the integrated result in the host session. Add an independent maximum reviewer when the result is high-risk or unusually difficult. This step is complete when every workstream and verification result is accounted for and no actionable review finding remains.

## Completion and cleanup

The work is done only when every workstream is completed or explicitly dropped, all accepted output is integrated, verification has passed, and the host has reviewed the whole result.

Report the outcome when the run ends, whether or not the gate passed, and keep the workers open while the session continues so their transcripts stay readable.

When wrapping up the session, propose closing the run's workers. Once the user agrees, close each ledger entry that Herdr still reports as the labelled worker this run created, and report anything you skipped. There is no agent-level close: close panes with `herdr pane close <pane_id>`. Herdr removes a tab as soon as its last pane closes, so `herdr tab close <tab_id>` afterwards returns `tab_not_found` and exit 1; treat that as the tab already being gone, and call it only for a tab this run created that outlived its panes. Entries missing from the ledger stay open for the user to close.
