---
name: herdr-orchestration
description: Orchestrate agent workers through Herdr from any host agent, with capability-based routing, supervised integration, and scoped cleanup.
disable-model-invocation: true
---

# Herdr Orchestration

Treat the current agent session as the control tower, regardless of its CLI or model. Keep decomposition, routing, integration, user communication, and final review in this host session.

Load and follow the `herdr` skill before issuing Herdr commands. Continue only when `HERDR_ENV=1`, and use the installed CLIs as the authority for supported launch options.

## Topology

Keep the control tower and every worker in the current Herdr workspace. Leave the control-tower pane in its existing tab. Create worker tabs in that workspace, group related workstreams in the same tab, and cap each worker tab at four panes. Reuse a matching tab while it has capacity; otherwise create another clearly named tab.

Give every worker tab and pane a concise role label. Preserve focus in the control-tower pane during background work. Record every tab and pane ID created during the run; this ledger defines the resources eligible for cleanup.

## Capability routing

| Role | Assign | Select |
|---|---|---|
| **Control tower** | Decomposition, routing, integration, user communication, and final review. | The current host session. |
| **Default worker** | Ordinary implementation, research, debugging, and review. | A capable installed agent at its configured high-quality setting. |
| **Specialist worker** | Work that benefits from a particular agent's coding, tool-use, architecture, or synthesis strengths. | The best available fit for the bounded workstream. |
| **Maximum worker** | The hardest isolated work, recovery from stalled work, adversarial review, or independent final review. | The strongest available agent at its highest verified effort setting. |

Start uncertain work with a default worker. Promote work to a specialist when its shape is clear, and reserve maximum workers for observed difficulty or high stakes. Keep the host as coordinator even when a worker is stronger.

Launch workers interactively with the normal executable specified by the `herdr` skill, letting local configuration choose model and effort. Apply explicit model or effort flags only when the user supplied them or the installed CLI confirms them.

## Dispatch loop

1. Decompose the task into independent, verifiable workstreams. Give each workstream one owner, one deliverable, and one verification requirement. Serialize workstreams that edit the same files or depend on unfinished output. This step is complete when every active workstream has an unambiguous boundary and owner.
2. Route each workstream by capability, place its owner under the topology rules, wait for the launched agent to become idle, and send a prompt containing the objective, scope, deliverable, verification, and coordination boundaries. This step is complete when every dispatched worker has accepted its prompt or reported a block.
3. Supervise through Herdr. Inspect current status and output before waiting; treat `idle` or `done` as completion and `blocked` as a decision point. Surface blocked decisions to the user. This step is complete when each worker has produced a reviewable result, been reassigned, or been explicitly dropped.
4. Integrate accepted output in the control tower. Inspect worker results and diffs, resolve interactions, and run the relevant verification. Escalate unexpectedly difficult or stalled work using the routing table. This step is complete when all accepted output forms one verified result.
5. Review the integrated result in the host session. Add an independent maximum reviewer when the result is high-risk or unusually difficult. This step is complete when every workstream and verification result is accounted for and no actionable review finding remains.

## Completion and cleanup

The work is done only when every workstream is completed or explicitly dropped, all accepted output is integrated, verification has passed, and the host has reviewed the whole result.

After that gate passes, tell the user the work is done and ask whether to close the worker panes and tabs created for this run. Leave them open until the user confirms. On confirmation, close only the resources in the ledger, preserving the current workspace and control-tower pane.
