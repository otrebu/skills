# Inventory (read-only)

Every command here only reads. Save the raw output under `$W`, the snapshot directory from step 1; the report compares against it. Proven in a full wrap-up on Herdr 0.9.1, Docker Desktop 4.93 (engine 29.8), agent-browser 0.38.1 and macOS.

## Baseline

Save these before step 5, and run them again for the report.

```bash
df -h /System/Volumes/Data | tail -1        # macOS; on Linux: df -h /
vm_stat | awk '/page size/{ps=$8} /Pages free/{gsub(/\./,"",$3); printf "%.1f GB free\n", $3*ps/1e9}'
docker system df
du -sh ~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw   # Docker Desktop on macOS
```

- On macOS, `df -h /` reads the sealed system volume. Its use stays the same whatever you remove; the data volume shows the gain.
- `Docker.raw` is a sparse file: `du -sh` gives the disk it really uses, and `ls -lh` its apparent size.
- Once the runtime is stopped, `docker system df` has nothing to read; the report uses the disk, memory and `Docker.raw` numbers.

## Herdr

```bash
herdr status          > "$W/herdr-status.txt"
herdr workspace list  > "$W/workspaces.json"
herdr pane list       > "$W/panes.json"
herdr agent list      > "$W/agents.json"
python3 <skill-dir>/scripts/pane-inventory.py > "$W/panes.tsv"
```

- `herdr workspace list` gives each workspace's `worktree.checkout_path`, `worktree.is_linked_worktree` and `worktree.repo_root`.
- `agent_session.value` in `herdr pane list` holds the agent's session id on some panes only. Record it when present; without it, the session reopens from the `claude --resume` picker.
- `herdr worktree list` fails with `not_git_worktree` unless given `--workspace` or `--cwd`. Take the worktrees from `git worktree list` instead.

### The pane table

[`scripts/pane-inventory.py`](../scripts/pane-inventory.py) prints one TSV row per pane with these columns:
- pane, workspace, tab and tab label;
- label, kind, agent name, status and session id;
- `rss_mb`: the memory of the pane's process tree, in MB;
- the foreground processes;
- `input`: the input-box state;
- the cwd and the terminal title.

The memory freed by the panes is the sum of `rss_mb` over the panes sorted remove.

The `input` column:

| Value | Meaning | Verdict |
|---|---|---|
| `empty` | nothing typed | none |
| `suggestion` | Claude Code's dim suggestion | none |
| `placeholder` | the Codex or Cursor placeholder | none |
| `TEXT: …` | typed but not sent | keep |
| `?: …` | not recognised: a dialog, another CLI, a shell showing output | read the pane yourself |

The helper reads `herdr pane read <pane> --source visible --format ansi` by these rules. Use them to read a `?` pane by eye, or to check the helper after a CLI update changes its input box:
- **Claude Code**: the input box is the line or lines between the last two horizontal rules (`─────`) on the screen. The prompt glyph is `❯`, followed by a no-break space. Text drawn dim (`ESC[2m`) is a suggestion; text at normal brightness is typed input.
- **Codex**: the input box is the last line that starts with `›`. The dim "Ask Codex to do anything" is a placeholder.
- **Cursor Agent**: the input box is the `→` line. "Add a follow-up" is a placeholder. The cursor draws its first letter in reverse video; that letter is not typed text.
- **Shell**: the last line is an empty `❯`, `$` or `%` prompt.

### Purpose of each pane

Take it from the first of these that has it:
1. its ledger row: the workstream, prompt file and launch command;
2. its terminal title;
3. its last output: `herdr agent read <name|pane> --source recent-unwrapped --lines 120`, or `herdr pane read <pane> --source recent-unwrapped --lines 120` for a shell.

A shell pane's `foreground` column names what runs in it: a server, a `tail -f`, a test run.

## Git worktrees

The repos to check are every `worktree.repo_root` in `workspaces.json`, plus any repo a ledger names.

```bash
git -C <repo> worktree list --porcelain            # path, HEAD and branch of each worktree
git -C <repo> stash list                           # stashes are per repo; each names its branch
```

For each worktree `<wt>` on branch `<b>`:

```bash
git -C <wt> status --porcelain                     # any line: dirty
git -C <wt> status --porcelain --ignored | grep '^!!'   # ignored files that go with it
git -C <wt> ls-remote --heads origin <b>           # remote head; nothing if deleted
git -C <wt> rev-list --count origin/<b>..HEAD      # unpushed commits, when the remote branch exists
git -C <wt> cherry origin/main HEAD                # '+': a commit whose patch is not on main
```

**Merged, by the forge.** A squash merge puts a new commit on main, so a squash-merged branch is not an ancestor of main. Ask the forge which requests merged, and with which head:

```bash
# GitLab, run inside the repo (":id" resolves to its project)
glab api "projects/:id/merge_requests?state=merged&per_page=100" \
  | jq -r '.[] | [.iid, .source_branch, .sha, (.squash_commit_sha // .merge_commit_sha // "-")] | @tsv'

# GitHub
gh pr list --state merged --limit 100 --json number,headRefName,headRefOid,mergeCommit \
  | jq -r '.[] | [.number, .headRefName, .headRefOid, (.mergeCommit.oid // "-")] | @tsv'
```

A branch is merged when the forge reports its request merged and the local head equals that request's head (`sha` on GitLab, `headRefOid` on GitHub). Record the full 40-character head: the branch delete checks it. A head that moved past the merged one is unpushed work: keep it.

**Ignored files.** Most go with the worktree and are rebuilt: `node_modules`, `dist`, generated certificates, a per-worktree `.env`. Flag generated fixtures, test evidence and anything a record points at: act.md archives those before the worktree goes.

**Disk.** `du -sh <wt>` overstates the gain when a package manager clones files from its store (pnpm on APFS). Report the du figure as an upper bound; the baseline `df` shows the real gain.

## Docker

```bash
docker context ls        # which runtime: Docker Desktop, OrbStack, colima, ...
docker info --format '{{.Name}} | {{.OperatingSystem}} | {{.MemTotal}} | {{.ServerVersion}}'
docker desktop status    # Docker Desktop only
docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.State}}\t{{.Status}}\t{{.Label "com.docker.compose.project"}}\t{{.Image}}\t{{.Size}}'
docker stats --no-stream
docker system df -v
docker volume ls --format '{{.Name}}\t{{.Label "com.docker.compose.project"}}'
docker network ls
docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}'
docker images -f dangling=true
```

- **Group by compose project.** For each project that act.md brings down, read how it was started:

  ```bash
  docker inspect <container> --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}} {{index .Config.Labels "com.docker.compose.project.config_files"}}'
  ```
- **Anonymous volumes** have 64-hex names. Map them to containers with `docker inspect <c> --format '{{range .Mounts}}{{.Type}} {{.Name}} {{.Destination}}{{"\n"}}{{end}}'`.
- **Named volumes.** Say what each database volume holds, and whether a fresh start rebuilds it. For Postgres: `docker exec <pg> psql -U postgres -Atc "select datname, pg_size_pretty(pg_database_size(datname)) from pg_database where not datistemplate"`. Synthetic data that a seed or migration rebuilds goes by the rule; data nothing rebuilds is kept.
- **Images.** Sort them into what continuing work uses (its stack images, a browser test image), images pulled by digest, and scratch images a tool rebuilds (scan outputs, one-off builds). An image pulled by digest shows `<none>` but is not dangling, so `docker image prune -f` leaves it and can free 0 B.
- **Runtime memory.** Containers use memory inside the VM, and the VM's footprint on the host stays the same whatever they use. For Docker Desktop on macOS:
  - find the VM process with `pgrep -f com.apple.Virtualization.VirtualMachine`;
  - read its footprint with `top -l 1 -pid <vm-pid> -stats pid,command,mem`;
  - read the configured size from `MemoryMiB` in `~/Library/Group Containers/group.com.docker/settings-store.json`.

  For another runtime, take its status and stop commands from its own `--help`.

## Processes

```bash
lsof -nP -iTCP -sTCP:LISTEN
ps -axo pid,ppid,etime,rss,command | grep -E 'node|pnpm|vite|tsx|playwright|agent-browser|caffeinate|tail -|watch' | grep -v grep
```

- **PPID 1** means orphaned: an old `tail -f <log>` follower, or a server whose pane closed.
- **`caffeinate -i -t 300`** whose parent is a live `claude` process belongs to that session. Check the parent with `ps -o pid=,command= -p <ppid>`.
- **`/bin/zsh -c source ~/.claude/shell-snapshots/…`** children of a `claude` process are that session's background tasks. They end with the session.
- **Watch-loop scripts** may exist only as files in scratchpads (`/private/tmp/claude-<uid>/…/scratchpad/*.sh`). The report lists them as files only, not running.
- **`/private/tmp` is cleared on reboot.** When continuing work keeps state there, Restart-after warns about rebooting.
- Processes outside the work (other apps, other projects) are left alone.

## Browser

```bash
agent-browser session list          # active daemons
ls ~/.agent-browser/                # <session>.pid and <session>.target: the daemon's pid and last target
ls -la ~/.agent-browser/sessions/   # saved logins (*.json); they hold cookies
```

A daemon's memory is the RSS of its pid and its Chrome children. To find the agent that used it last, compare its `.target` with the ledger rows.
