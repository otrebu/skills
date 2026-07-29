---
name: fable-herdr-orchestration
description: Orchestrate Fable and Codex workers through Herdr with explicit model and effort routing.
disable-model-invocation: true
---

# Fable Herdr Orchestration

Read `~/.agents/skills/herdr-orchestration/SKILL.md` and follow it for topology, the dispatch loop, and completion and cleanup; it sets `disable-model-invocation`, so reach it by file rather than through the skill tool.

This skill binds that one to Fable and Codex. Where the two disagree, this skill wins.

## Control tower

Treat the current Fable session as the control tower. Run it from a trusted directory with:

```bash
claude --model fable --effort xhigh --dangerously-skip-permissions
```

If the current session was not launched this way, give the command to the user and stop.

## Role binding

Bind the capability roles from `herdr-orchestration` to these agents:

| Role | Agent |
|---|---|
| **Control tower** | Fable, xhigh — the current session. |
| **Default worker** | Codex GPT-5.6, xhigh. |
| **Specialist worker** | Fable, xhigh, for architecture or synthesis that benefits from a second Fable perspective. |
| **Maximum worker** | Codex GPT-5.6, max for the hardest isolated implementation, debugging, or adversarial review; Fable, max for the hardest cross-cutting reasoning, recovery from stalled work, or an independent final review. |

Start uncertain work at `xhigh`. Reserve `max` for work whose observed difficulty or stakes justify its cost. When escalating, choose Codex for isolated execution and Fable for cross-cutting reasoning.

## Launch commands

Start workers interactively in Herdr panes:

```bash
# Default worker — Codex, xhigh
codex -m gpt-5.6-sol --sandbox workspace-write --ask-for-approval on-request -c 'model_reasoning_effort="xhigh"' -c 'approvals_reviewer="auto_review"'

# Maximum worker — Codex, max
codex -m gpt-5.6-sol --sandbox workspace-write --ask-for-approval on-request -c 'model_reasoning_effort="max"' -c 'approvals_reviewer="auto_review"'

# Specialist worker — Fable, xhigh
claude --model fable --effort xhigh --dangerously-skip-permissions

# Maximum worker — Fable, max
claude --model fable --effort max --dangerously-skip-permissions
```

For Codex, `-c key=value` overrides one config value for that worker without changing global config. Values are parsed as TOML, so string values retain their inner quotes.

Codex stays inside `workspace-write`; eligible boundary requests go to automatic approval review. Fable workers skip permission checks, so use them only in directories the user has entrusted to autonomous work.
