# Agent launch matrix

The canonical per-agent facts for autonomous operation: each agent's Herdr `--kind` and its permission/sandbox posture. Skills link here instead of restating these facts; verify a flag against the installed CLI's `--help` before relying on it in a new version.

| Executable | Herdr `--kind` | Autonomous posture flags | Effect |
|---|---|---|---|
| `claude` | `claude` | `--dangerously-skip-permissions` | Bypasses all permission checks. |
| `codex` | `codex` | `--approve-for-me` | Routes approval requests through automatic review while retaining the `workspace-write` sandbox. Needs no separate `--sandbox` or `--ask-for-approval` flag. See §Codex stays sandboxed for report-directory access. |
| `agent` (Cursor Agent) | `cursor` | `--yolo --sandbox disabled` | Force-allows commands unless explicitly denied and disables the sandbox. The first launch in a directory shows a workspace-trust dialog after `agent start` reports idle, and a prompt sent then is lost: read the pane and re-send once the dialog clears; trust is per directory, so later launches in the same worktree take their first prompt. |
| `pi` | `pi` | none | Built-in read, bash, edit, and write tools run without approval by default. |

There is no `agent` kind; the `agent` executable is Cursor Agent, kind `cursor` — the Cursor CLI ships as both `agent` and `cursor-agent` (the same binary; Herdr's `cursor` manifest carries `cursor-agent` as an alias). `herdr agent` prints the full installed kind list. In `herdr agent start`, posture flags go after `--`:

```bash
herdr agent start <name> --kind claude --pane <pane-id> -- --dangerously-skip-permissions
herdr agent start <name> --kind codex --pane <pane-id> -- --approve-for-me
```

## Codex stays sandboxed

`--approve-for-me` is Codex's approved autonomous posture, not an unrestricted mode: the `workspace-write` sandbox stays on, and requests outside automatic review have surfaced as `blocked` in observed Herdr runs — the help text does not guarantee this, but expect and handle `blocked` all the same. A test lane that starts a listener can hit a sandbox denial (`listen EPERM`); request the needed permission through the host approval flow. A report directory outside the writable roots needs `-c 'sandbox_workspace_write.writable_roots=["<report-dir>"]'` on the launch, or lives inside the worktree under an ignored path. Never substitute `--dangerously-bypass-approvals-and-sandbox`.

## pi: permissions and trust are separate axes

- **Tool permissions:** pi has no permission or approval mode. Its built-in read, bash, edit, and write tools are enabled by default, so autonomous operation needs no flag. The only levers are restrictions: `--tools`, `--exclude-tools`, `--no-tools`, `--no-builtin-tools`.
- **Project-local trust:** `--approve` trusts project-local files (the project's settings and extensions) for this run; `--no-approve` ignores them. This governs what pi loads, not what its tools may do.

The axes are independent: "pi needs no flag" is a permissions statement, and a pinned command that carries `--approve` is making a trust decision, not granting permissions.
