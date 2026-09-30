# The report

The run ends with one report, as the reply to the user. Fill it from the second inventory and the baseline: run the [baseline commands](inventory.md#baseline) again, and compare. Replace every `<placeholder>`. Leave out a section with nothing in it, except Kept and Restart-after.

````markdown
**Wrap-up of <work>, <date, time, zone>**

<Only when the run stopped: **Stopped on a surprise:** what, on which item, and which steps did not run.>

**Freed**
- Disk: <before> → <after> used on the data volume (<GiB> freed). `Docker.raw`: <before> → <after>.
- Memory: <before> → <after> GB free. By source: ~<GB> pane processes, ~<GB> runtime VM, ~<GB> browser daemons.

**Closed and removed**
- Herdr: <n> panes in <n> tabs and <n> workspaces.
- Worktrees: <n> removed, and <n> local branches deleted after the head check. Archived to <path>.
- Docker: <n> containers, <n> named volumes, <n> anonymous volumes, <n> networks, <n> images (<GB>), build cache (<GB>). Runtime: <stopped | left running, because …>.
- Processes: <pid: what it was>.
- Browser: logins backed up to <path>; <sessions> closed.

**Kept**
| Item | Why |
|---|---|
| <pane, worktree, branch, volume, image, daemon, file> | <the keep rule, or what continuing work needs it for> |

Panes the work did not start are rows here, with their kind, status and cwd.

**Skipped**
| Item | Why |
|---|---|
| <an item the rule would remove that was left> | <e.g. matched the image pattern but was not on the checked list; a merged branch still on the remote, with its delete command> |

**Loose ends** from the closed panes' last output
- <pane>: <an unanswered question, an offered follow-up, a file left behind>

**Restart-after**
<for each piece of continuing work, the items below that apply>
````

## Restart-after

For each piece of continuing work, give what it needs in order to resume:
- **Session:** its pane. If the pane is lost: `cd <cwd> && claude --resume <session-id>`, or the `claude --resume` picker when Herdr recorded no id.
- **Next steps:** a pointer to its resume file, not a copy of it.
- **Runtime:** `docker desktop start && until docker info >/dev/null 2>&1; do sleep 2; done`, or the other runtime's start command.
- **Stacks:** the exact bring-up command, and the directory to run it from, for each removed stack it needs. A tool that runs `compose up` itself recreates its stack; say so.
- **Commit hook:** the services a pre-commit hook or test run expects to find running (a database, a mail catcher), and the commands that bring them back before the next commit.
- **Browser:** `agent-browser --session <session> --restore open <url>`, and about 10 s before the first snapshot.
- **Reboot:** "do not reboot until <condition>, or copy <paths> out of `/private/tmp` first", when its state lives there.
- **Worktrees and branches:** the kept ones, with their heads.
