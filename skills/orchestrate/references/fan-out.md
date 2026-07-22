# Fan-out

Apply this reference when two or more workers will run concurrently. Inherit the trusted-directory, run-prefix, worker-ledger, human-input, and completion rules from `SKILL.md`.

## Isolate the work

Give every concurrent worker a distinct trusted checkout or copy. Prefer a Git worktree for repository work:

```bash
git -C <repo> worktree add -b <worker-branch> <worktree-path> <base-ref>
```

Record each checkout path in the run ledger. Treat `--allow-shared-dir` as a human-decision branch: surface the collision risk and use it only after the user explicitly chooses shared-directory execution.

Complete isolation before spawning any concurrent worker. Every workstream must have its own directory, owner, deliverable, verification requirement, and coordination boundaries.

## Dispatch the fleet

Spawn every ledgered worker, wait until each is ready, and use `send` to submit prompts without serially waiting for their turns. Include the `>>> NEEDS_HUMAN:` contract in every prompt.

Supervise only the explicit ledger IDs:

```bash
pending=(auth7_api auth7_ui auth7_db)

while [ "${#pending[@]}" -gt 0 ]; do
  "$ORCH" waitall --any "${pending[@]}" --timeout 1800
  # Apply the core state action to every returned worker. Remove an ID only
  # after its result is accepted, reassigned, or explicitly dropped.
done
```

Interpret `DONE`, `NEEDS_INPUT`, `TIMEOUT`, and `GONE` through the core dispatch loop. `waitall` observes workers; it does not integrate results, resolve human decisions, or establish task completion.

Keep `TIMEOUT` workers pending and wait again after inspection. Keep `NEEDS_INPUT` workers pending until the user's answer and the follow-up turn produce a reviewable result or another explicit disposition.

This phase is complete when every concurrent workstream has a reviewable result, has been reassigned, or has been explicitly dropped with a reason.

## Integrate and clean up

Integrate accepted results in the control tower, accounting for cross-workstream interactions before running verification. Keep a worker available for focused follow-up until its output is accepted or dropped.

After integration and review pass, stop only the explicit worker IDs in the ledger. Preserve the worktrees unless the user separately asks for their removal, then apply the main completion gate.
