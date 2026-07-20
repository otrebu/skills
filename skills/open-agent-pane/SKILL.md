---
name: open-agent-pane
description: Open a right-hand Herdr pane and brief a chosen coding agent from a conversation snapshot.
disable-model-invocation: true
---

# Open Agent Pane

Treat the handoff as a **brief**: give the specialist the relevant context, a bounded assignment, and a checkable deliverable.

Load and follow the `tmp-snapshot` skill before creating the pane. Load and follow the `herdr` skill before issuing any Herdr command.

## Resolve the brief

Determine these inputs from the request:

- **Agent:** `claude`, `codex`, `agent` (Cursor Agent), or `pi`. Default to `claude` when the user omits it.
- **Model:** honor an explicit model or effort override; otherwise use the table below.
- **Context slice:** include only the part of the conversation and current work the specialist needs.
- **Assignment:** state the work to perform, its boundaries, whether edits are allowed, the deliverable, and how to verify it.
- **Return path:** decide whether the user only wants the pane started or wants this session to collect and integrate the result.

Ask once before mutating anything only when the assignment cannot be inferred safely.

## Model defaults

| Agent | Default | Interactive launch command |
|---|---|---|
| `claude` | Fable, xhigh effort | `claude --model fable --effort xhigh --dangerously-skip-permissions` |
| `codex` | GPT-5.6 Sol, xhigh thinking | `codex -m gpt-5.6-sol --sandbox workspace-write --ask-for-approval on-request -c 'model_reasoning_effort="xhigh"' -c 'approvals_reviewer="auto_review"'` |
| `agent` | Grok 4.5, xhigh effort | `agent --model <resolved-model-id> --yolo --sandbox disabled` |
| `pi` | Kimi K3, max thinking | `pi --approve --provider kimi-coding --model k3 --thinking max` |

Use the Codex command verbatim: `on-request` plus `approvals_reviewer="auto_review"` sends eligible escalation requests through automatic review while retaining `workspace-write` sandboxing.

Before splitting, resolve the account-specific Cursor model ID and confirm that pi exposes Kimi K3:

```bash
agent --list-models
pi --version
pi --list-models k3
```

For the Cursor default, require an exact Grok 4.5 xhigh match and place its listed ID in the launch command; never pass `<resolved-model-id>` literally. For pi's K3 default, require version 0.80.10 or later, configured Kimi Code access, and the exact `kimi-coding/k3` entry. Pi has no per-tool approval mode: its built-in read, bash, edit, and write tools are enabled by default, while `--approve` only trusts project-local resources. If K3 is absent, report the failed precondition and never silently use K2.7. If any requested default is unavailable, stop before creating the pane and substitute only with the user's approval.

Keep the launch interactive and preserve the current working directory. Run Claude with permission checks bypassed, Cursor Agent with YOLO and its sandbox disabled, and pi with its default unrestricted built-in tools. Keep Codex on the shown automatic approval-review setup. Honor an explicit permission override from the user.

## Dispatch

1. Invoke `tmp-snapshot` to save the relevant context slice as a standalone handoff in `/tmp`. Include current state, relevant decisions, concrete paths or artifacts, constraints, and unresolved questions. Treat its returned path and outline as a sub-step result and continue this workflow.
2. Confirm the snapshot path is readable and contains enough context to perform the assignment without the chat.
3. Follow `herdr` to verify `HERDR_ENV=1`, learn the installed CLI, and preflight the chosen executable and model. Complete this step only with a valid interactive launch command.
4. Split the calling pane to the right without moving focus:

   ```bash
   herdr pane split --current --direction right --no-focus
   ```

5. Read the new pane ID from the JSON response. Rename it for the assignment, launch the chosen command with `herdr pane run`, inspect the pane, and wait until the agent is `idle`.
6. Send one task prompt with `herdr pane run`. Use this shape:

   ```text
   Read <absolute-snapshot-path>. It is the handoff context for this assignment.

   Assignment: <specific work>
   Scope: <boundaries and whether edits are allowed>
   Deliverable: <review, second opinion, implementation, investigation, or side-task result>
   Verification: <evidence or checks required>

   Treat this prompt as authoritative if it conflicts with the snapshot. Surface any blocker instead of expanding scope.
   ```

7. Wait for the pane to enter `working`. If it does not, inspect its status and transcript before reporting the failure.

## Return

When the user only asked to open or hand off, finish after dispatch starts. Report the pane ID, agent and model, snapshot path, and assignment in one compact status.

When the user asked for the result, follow the Herdr monitoring loop until the agent reaches `idle` or `done`, handle blockers through the user, read the transcript, and return or integrate the requested deliverable.

Finish only when the correct right-hand pane exists, the requested model is running, the snapshot-backed brief has been submitted, and the return path requested by the user is complete.
