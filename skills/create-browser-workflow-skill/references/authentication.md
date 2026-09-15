# Persistent authentication with agent-browser

Reference for step 3 of the parent skill, and a template for the generated
skill's authentication section. Check `agent-browser skills get core`, section
"Persist session across runs", for the current form of these flags.

## Mechanisms, and which to pick

| Mechanism | Flag | Pick it when |
|---|---|---|
| Restore keyed on the session | `--session <id> --restore` | Default for agent skills. Cookies and localStorage are saved on close and periodically, then replayed on the next open. |
| Persistent Chrome profile | `--profile <dir>` | The app needs real browser state that restore cannot replay: passkeys, extensions, service-worker caches, or a vendor SSO that pins the browser instance. |
| Saved state file | `--state <path>` | Handing a one-off snapshot to another machine or CI. It is a snapshot: it goes stale the moment the app rotates a token. |
| Attach to a running Chrome | `--auto-connect` | The user is already logged in in their own Chrome and wants the agent to reuse it. Sequential use only. |

A named session alone persists nothing durable: it is an isolated browser for
the life of the daemon. `--restore` is what makes the login survive.

The application can expire or revoke any of these at any time. Every run
verifies before it acts.

## Template for the generated skill

```bash
# One literal name per application and account. Same name on every command.
export AGENT_BROWSER_SESSION=<app>-<account>
export AGENT_BROWSER_RESTORE="$AGENT_BROWSER_SESSION"

# Open and validate: the check must match something only a logged-in page shows.
agent-browser --restore-check-text "<logged-in marker>" open https://app.example.com/<landing>
agent-browser get url
agent-browser snapshot -i
```

The name is literal on purpose. `agent-browser session id --scope ...` derives
the id from the working directory (worktree, cwd or git root), which suits a
per-worktree dev loop and defeats a login that must be found from any
directory. Two agents running the same skill at once then share one browser;
give the second a `--namespace` if that is a real case.

Using the environment variables rather than repeating `--session` and
`--restore` on every line keeps the invocation in one place and stops a
forgotten flag from silently opening the shared default browser.

Verify from the page, not from the `open` line, which echoes the requested URL
whatever happened. Observed on 0.37.1: when stderr says `launched browser`,
the active tab is sometimes `about:blank`; running the same `open` again
lands on the page. Then confirm the account, not just the marker: read the
account name or email from the page and compare it with the intended account.
When the app shows no account identity, say so in the generated skill and
name the vault profile as the account check.

Restore state is written on `close` and periodically while the browser is
open, so end every run with `agent-browser close`.

## First login

Headed, so the user can complete MFA or a passkey:

```bash
agent-browser --headed open https://app.example.com/login
# user logs in, then:
agent-browser --restore-check-text "<logged-in marker>" open https://app.example.com/<landing>
agent-browser close    # saves restore state
```

For password-only logins, store credentials in the auth vault once and log in
from it; nothing sensitive reaches the shell history or the skill package:

```bash
agent-browser auth save <app> --url https://app.example.com/login \
  --username <user> --password-stdin
agent-browser auth login <app>
```

## Expired login during a run

A failed restore is reported on stderr, with exit code 0:
`restore: loaded_but_invalid` (check failed) or `restore: missing` (no saved
state). `session info --json` carries the same value in
`runtime.restoreStatus` once the daemon is up. The page itself lands on the
login page. When either shows:

1. Preserve progress: note the record and step reached.
2. Re-authenticate through the mechanism above (vault login, or ask the user
   for a headed login).
3. Re-verify account and marker, then re-read the application state before
   resuming. A modifying step that timed out may already have applied.

## Rules

- One browser owner per restore key or profile directory at a time. Close the
  previous owner before another process opens the same one.
- Restore state and profiles live in agent-browser's directories or a path the
  user configures, outside the skill package and source control.
- Keep `--restore-save auto` (the default) so a failed restore does not
  overwrite the last known-good state.
