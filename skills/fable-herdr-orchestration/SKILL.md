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
codex -m gpt-5.6-sol -c 'model_reasoning_effort="xhigh"' --dangerously-bypass-approvals-and-sandbox

# Hardest Codex work
codex -m gpt-5.6-sol -c 'model_reasoning_effort="max"' --dangerously-bypass-approvals-and-sandbox

# Additional Fable worker
claude --model fable --effort xhigh --dangerously-skip-permissions

# Hardest Fable work
claude --model fable --effort max --dangerously-skip-permissions
```

These commands remove approval prompts. Use them only in directories the user has entrusted to autonomous work.

## Dispatch loop

1. Decompose the task into independent, verifiable workstreams. Give each workstream one owner; serialize work that may edit the same files or depends on unfinished output.
2. Use Herdr to create sibling panes without stealing focus. Launch the routed agent, wait until it is idle, then send a prompt containing the objective, scope, deliverable, and verification requirement.
3. Monitor every worker through Herdr. Inspect current state and output before waiting; surface blocked decisions to the user instead of answering them silently.
4. Integrate completed output in the control tower. Escalate unexpectedly difficult or stalled work to `max`, choosing Codex for isolated execution and Fable for cross-cutting reasoning.
5. Run relevant verification and perform the final integrated review in Fable. Use an independent `max` reviewer when the result is high-risk or unusually difficult.

Finish only when every workstream is completed or explicitly dropped, all accepted output is integrated, verification has passed, and Fable has reviewed the whole result.
