---
name: fable-orchestration
description: Route orchestration and subagent work to the appropriate model tier.
disable-model-invocation: true
---

# Fable Orchestration

Enable UltraCode. Maximize useful parallelism: give each independent, verifiable workstream its own appropriately capable subagent.

## Model routing

| Model | Assign |
|---|---|
| **Fable 5 XI, maximum level** | Orchestration planning, the hardest reasoning, difficult debugging, recovery when work is stuck, and final review. For exceptionally hard problems, also assign a Fable subagent at maximum level. |
| **Opus 4.8, extra high** | Difficult implementation and adversarial review. |
| **Opus 4.8, high** | Ordinary implementation, research, and intermediate review. |
| **Sonnet 5** | Only mechanical, extremely obvious work, or execution from a specification detailed enough that error is nearly impossible. |

## Execution

1. Use Fable 5 XI to plan the decomposition and model assignments.
2. Fan out every independent workstream that benefits from parallel execution.
3. Route each workstream using the table; move uncertain assignments up one tier.
4. Escalate stalled work or unexpectedly difficult debugging to Fable 5 XI at maximum level.
5. Use Fable 5 XI for the final integrated review.

Finish only when every workstream has an owner, completed outputs have been integrated, and Fable has reviewed the result.
