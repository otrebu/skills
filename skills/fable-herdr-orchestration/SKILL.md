---
name: fable-herdr-orchestration
description: Orchestrate Fable and Codex workers through Herdr with explicit model and effort routing.
disable-model-invocation: true
---

# Fable Herdr Orchestration

Treat the current Fable session as the control tower. Run it from a trusted directory with:

```bash
claude --model fable --effort xhigh --dangerously-skip-permissions
```

If the current session was not launched this way, give the command to the user and stop.

Load and follow the `herdr` skill before issuing Herdr commands. Continue only when `HERDR_ENV=1`.

## Herdr topology

Keep the control tower and every worker in the current Herdr workspace. Leave the current Fable pane in its existing control-tower tab. Create worker tabs in that workspace and group related workstreams in the same tab; reuse a matching tab while it has capacity, and open another clearly named tab when it does not. Each worker tab may contain at most four panes.

Give every worker tab and pane a concise role label, keep focus in the control-tower pane during background work, and record the IDs of every tab and pane created during the run. Those IDs define the resources eligible for cleanup.

## Model routing

| Agent | Assign |
|---|---|
| **Fable, xhigh — current session** | Decomposition, routing, integration, user communication, and final review. |
| **Codex GPT-5.6, xhigh** | Default worker for implementation, research, debugging, and review. |
| **Codex GPT-5.6, max** | The hardest isolated implementation, debugging, or adversarial review. |
| **Fable, xhigh worker** | Architecture or synthesis that benefits from a second Fable perspective. |
| **Fable, max worker** | The hardest cross-cutting reasoning, recovery from stalled work, or an independent final review. |

Start uncertain work at `xhigh`. Reserve `max` for work whose observed difficulty or stakes justify its cost.

## Worker launch commands

Start workers interactively in Herdr panes:

```bash
# Default Codex worker
codex -m gpt-5.6-sol --sandbox workspace-write --ask-for-approval on-request -c 'model_reasoning_effort="xhigh"' -c 'approvals_reviewer="auto_review"'

# Hardest Codex work
codex -m gpt-5.6-sol --sandbox workspace-write --ask-for-approval on-request -c 'model_reasoning_effort="max"' -c 'approvals_reviewer="auto_review"'

# Additional Fable worker
claude --model fable --effort xhigh --dangerously-skip-permissions

# Hardest Fable work
claude --model fable --effort max --dangerously-skip-permissions
```

For Codex, `-c key=value` overrides one config value for that worker without changing global config. Values are parsed as TOML, so string values retain their inner quotes.

Codex stays inside `workspace-write`; eligible boundary requests go to automatic approval review. Fable workers skip permission checks, so use them only in directories the user has entrusted to autonomous work.

## Dispatch loop

1. Decompose the task into independent, verifiable workstreams. Give each workstream one owner; serialize work that may edit the same files or depends on unfinished output.
2. Place each worker in the appropriate worker tab under the topology rules above without stealing focus. Launch the routed agent, wait until it is idle, then send a prompt containing the objective, scope, deliverable, and verification requirement.
3. Monitor every worker through Herdr. Inspect current state and output before waiting; surface blocked decisions to the user instead of answering them silently.
4. Integrate completed output in the control tower. Escalate unexpectedly difficult or stalled work to `max`, choosing Codex for isolated execution and Fable for cross-cutting reasoning.
5. Run relevant verification and perform the final integrated review in Fable. Use an independent `max` reviewer when the result is high-risk or unusually difficult.

## Completion and cleanup

The work is definitely done only when every workstream is completed or explicitly dropped, all accepted output is integrated, verification has passed, and Fable has reviewed the whole result.

Once that gate passes, tell the user the work is done and ask whether to close the worker panes and tabs created for this run. Leave them open until the user confirms. If confirmed, close only the recorded resources, preserving the current workspace and Fable control-tower pane.
