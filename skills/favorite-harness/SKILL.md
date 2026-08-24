---
name: favorite-harness
description: Look up the user's preferred coding-agent harness, model, effort, and autonomous launch command. Use when choosing or launching a coding agent or when another routing skill needs defaults; do not use as an orchestration workflow.
---

# Favorite harness

This skill selects defaults; it does not orchestrate or launch by itself. Match rows top-to-bottom, and preserve each table value the user did not explicitly override. When a caller launches, use the complete autonomous command shown.

| Job | Harness | Model | Effort |
|---|---|---|---|
| Orchestration, final review, security review | Claude | Fable 5 | xhigh |
| Implementation | Codex | GPT-5.6 Sol | high; xhigh only if stuck |
| Tests, retrieval, checking, creating issues | Cursor Agent | Grok 4.6 | high; medium if mechanical |
| Anything that is not tool/repo work | Kimi Code CLI | K3 | max |

```bash
# Claude — Fable xhigh
claude --model fable --effort xhigh --dangerously-skip-permissions

# Codex — Sol high (stuck → xhigh)
codex -m gpt-5.6-sol --approve-for-me -c 'model_reasoning_effort="high"'
codex -m gpt-5.6-sol --approve-for-me -c 'model_reasoning_effort="xhigh"'

# Cursor Agent — Grok 4.6 high (mechanical → medium)
agent --model cursor-grok-4.6-high --yolo --sandbox disabled
agent --model cursor-grok-4.6-medium --yolo --sandbox disabled

# Kimi Code CLI — K3 max. No launch-time effort flag; send /effort max once idle.
kimi -m k3 --yolo
```

In Herdr, `--kind` is `claude` / `codex` / `cursor` / `kimi`. Pass everything after the executable after `--`.

Never pin Fable max, Sol max, or Grok xhigh. Do not put Kimi on a tool loop. Do not use Opus unless the user asks.
