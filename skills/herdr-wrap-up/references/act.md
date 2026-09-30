# Act

Every command here ran without error in a full wrap-up on Herdr 0.9.1, Docker Desktop 4.93 (engine 29.8), agent-browser 0.38.1 and macOS: 63 panes closed, 9 worktrees and their branches removed, every Docker step below, two browser daemons and the runtime stopped. Run the steps in this order. Each one starts with its re-check, because time has passed since the inventory. A failed re-check is a surprise (SKILL.md).

Fill each `<placeholder>` from the inventory, and list items by name or ID; a pattern can match more than the inventory checked.

## 1. Herdr panes

Close the panes directly. A clean `/exit` first is not needed: the transcripts are already on disk and resume with `claude --resume`, and 63 panes closed without it left no stray processes. The Processes part of the second inventory confirms that on each run.

- **Closing unit.** Close the largest unit whose panes are all sorted remove: a workspace, else a tab, else single panes. Herdr removes a tab when its last pane closes, so `tab_not_found` after closing its panes means the tab is already gone.
- **Re-check each unit right before closing it:**
  - List its panes and compare them with the inventory. A pane the inventory does not list is new: keep it, and close the unit's other panes one by one.
  - Read each pane's input box again with `python3 <skill-dir>/scripts/pane-inventory.py --workspace <id>`. Typed text is a surprise.
- **`workspace_group_close_required` is a refusal.** `--group` would also close the primary workspace and every linked worktree workspace.

```bash
herdr pane list | jq -r '.result.panes[] | select(.workspace_id=="<workspace-id>") | .pane_id' | sort   # expect: the inventory's panes
herdr pane list | jq -r '.result.panes[] | select(.tab_id=="<tab-id>") | .pane_id' | sort

for w in <workspace-id> <workspace-id>; do herdr workspace close "$w" >/dev/null && echo "closed $w" || echo "FAILED $w"; done
for t in <tab-id> <tab-id>; do herdr tab close "$t" >/dev/null && echo "closed $t" || echo "FAILED $t"; done
for p in <pane-id> <pane-id>; do herdr pane close "$p" >/dev/null && echo "closed $p" || echo "FAILED $p"; done
```

A failed close prints its JSON error on stderr.

Verify by comparing the live panes with the kept ones:
```bash
diff <(herdr pane list | jq -r '.result.panes[].pane_id' | sort) <(sort <<'EOF'
<every kept pane id, one per line>
EOF
)
# no output: done. '<': open but not kept (a failed close, or a new pane: keep it). '>': kept but gone.
```

## 2. Worktrees

- **After the panes.** No pane may still sit in a worktree this step removes: `herdr pane list | jq -r '.result.panes[].cwd' | grep -F <worktree-path>` prints nothing.
- **Merged and clean only.** Remove a worktree when its head equals the merged request's head, `git status --porcelain` prints nothing, no stash names its branch, and nothing is unpushed beyond what merged. Re-check the head and status right before.
- **Archive first.** Copy what exists nowhere else into the work's state directory: generated fixtures, test evidence, files a record points at. The rest of the ignored files go with the worktree.
- `git worktree remove` without `--force` refuses a dirty worktree, and that refusal is a surprise.

```bash
# archive (adds files only)
A=<work-state-dir>/<name>-archive
mkdir -p "$A/<worktree-dir>" && cp -Rp <worktree-path>/<path>/. "$A/<worktree-dir>/"

# remove
for d in <worktree-path> <worktree-path>; do
  git -C <repo> worktree remove "$d" && echo "removed $d" || echo "REFUSED $d"
done
git -C <repo> worktree prune
git -C <repo> worktree list          # expect: the kept worktrees
```

## 3. Branches

A squash merge makes `git branch -d` refuse the branch, because its head is not an ancestor of main. So `-D` runs only inside this check, which deletes a branch only while it still points at its merged request's head:

```bash
while read -r b sha; do
  if [ "$(git -C <repo> rev-parse --verify -q "refs/heads/$b")" = "$sha" ]; then git -C <repo> branch -D "$b"; else echo "MOVED $b"; fi
done <<'EOF'
<branch> <full 40-character merged head sha>
EOF
git -C <repo> branch --list <branch> <branch>   # expect: no output
```

A `MOVED` line is a surprise: stop after the loop. A merged branch still on the remote stays there; the report gives `git -C <repo> push origin --delete <branch>`.

## 4. Docker

Re-check first: every agent that used a stack is `idle` or `done`, or its pane is closed, so that two agents never act on one stack.
```bash
herdr agent list | jq -r '.result.agents[] | "\(.pane_id) \(.agent_status)"'
```

Then in this order:

```bash
# 4.1 stop each running stack of the work. Without -v, so named volumes stay for 4.3 to decide.
cd <compose working_dir> && docker compose -f <config_file> -f <config_file> down

# 4.2 exited containers of the work's compose projects
for p in <compose-project> <compose-project>; do
  docker ps -aq --filter status=exited --filter "label=com.docker.compose.project=$p" | xargs -r docker rm
done

# 4.3 named volumes the rule removes, by name
docker volume rm <volume> <volume>

# 4.4 anonymous volumes: hash-named and unused only
docker volume ls -q --filter dangling=true | grep -E '^[0-9a-f]{64}$' | xargs -r docker volume rm

# 4.5 networks nothing uses
docker network prune -f

# 4.6 dangling images (can free 0 B: images pulled by digest are not dangling)
docker image prune -f

# 4.7 all of the build cache; the next build runs cold
docker builder prune -a -f

# 4.8 scratch images: list what the pattern matches, compare it with the inventory, then remove by name
docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}' | grep -E '<pattern>'
docker rmi <repository:tag> <repository:tag>

docker ps -a
docker system df
```

- **List before `docker rmi`.** A pattern can match a tag the inventory did not sort. In one run, a scan pattern also matched a tag on a digest-pulled image; the list caught it, and the image stayed. Pass `docker rmi` only the names you checked.
- **Images that stay:** the ones continuing work uses (its stack images, a browser test image) and images pulled by digest, with every tag on them.
- **`docker volume prune -a`** would also take named volumes the rule keeps, and **`docker image prune -a`** the images continuing work uses. 4.3 and 4.8 name what goes instead.

## 5. Processes and browser

- Kill by PID. PIDs get reused, so check each one's command right before the kill.
- Leave these alone:
  - a `caffeinate` whose parent is a live `claude`;
  - another session's background tasks;
  - scripts that exist only as files;
  - processes outside the work.
- Back up the saved logins before closing any daemon. They hold cookies, so the backup stays under `~/.agent-browser/`, out of every shared record.
- Close a daemon when the agent that used it last is `idle` or `done`, or its pane is closed. A daemon may already have exited on its own; `session list` shows which are left.

```bash
ps -o pid=,ppid=,command= -p <pid>,<pid>    # still the processes the inventory listed
kill <pid> <pid>

BK=~/.agent-browser/sessions-backup-<YYYYMMDD>
mkdir -p "$BK" && cp -p ~/.agent-browser/sessions/*.json "$BK/"
agent-browser --session <session> close
agent-browser session list           # expect: none of the closed sessions
ls -la ~/.agent-browser/sessions/    # expect: the saved logins still there
```

`close` saves the restore state. Reopen with `agent-browser --session <session> --restore open <url>`, and allow about 10 s before the first snapshot. If the restored page shows a login screen, copy that session's file back from the backup and retry.

## 6. Runtime

Stop the runtime unless continuing work needs it now. Stopping containers frees memory inside the VM only; stopping the runtime is what returns the VM's memory to the host. A container still running after step 4 belongs to something outside the work: leave the runtime running, and say so in the report.

```bash
docker ps -q                 # expect: no output
docker desktop stop
```

Docker Desktop shrinks `Docker.raw` after the prunes; measure it with `du -sh`. For another runtime, find it with `docker context ls` and take its stop command from its `--help`.
