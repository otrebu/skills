# One-time setup (do once per account)

The skill detects whether setup exists and offers to run this. On first use, check: is `wrangler` logged in? does the `artifacts` bucket exist? does the Worker exist? is the Code Mode MCP connected? If not, walk the user through the steps below. **No API token required — everything authenticates via browser OAuth.** A couple of steps are the human's (an interactive login, confirming OTP); the agent runs the rest.

**Prerequisite already true for this user:** `ubuilt.dev` is registered on Cloudflare (Registrar), so the zone is already on Cloudflare nameservers — no DNS migration.

1. **Log in with OAuth — no token (human, once per machine).** Run `wrangler login`. It opens a browser, you authorize, and wrangler stores an OAuth session locally. With no flags it requests all available scopes, which include Workers deploy *and* R2 — so this one login covers creating the bucket, deploying the Worker, and every asset upload. `wrangler whoami` then shows the account email + id (no secret to copy anywhere).
2. **Confirm Email OTP is enabled (human, ~30s).** Zero Trust → Settings → Authentication → Login methods. **One-time PIN** is a default method — just confirm it's on. (If the org has never been initialized, the dashboard prompts for a team name once; pick one, e.g. `ubuilt`.)
3. **Enable R2, then create the bucket.** R2 must be turned on once per account (human): dashboard → **R2 Object Storage** → enable (free tier, 10 GB; accept terms — may ask for billing info but isn't charged under the free limits). Then (agent): `wrangler r2 bucket create artifacts`. If R2 isn't enabled first, bucket creation fails with `code: 10042 — Please enable R2 through the Cloudflare Dashboard`.
4. **Init & deploy the Worker (agent).** `init` is a *detect-then-generate* routine — the same pull-and-reconcile philosophy as publishing, applied to setup. It reads the Config (`site`/`bucket`/`worker`) from the manifest, **probes the account** for each prerequisite, **generates** the gitignored `worker/wrangler.toml` from `wrangler.toml.template`, then deploys. It's idempotent (safe to re-run) and surfaces the human-only steps explicitly instead of failing mid-deploy.

   Probe — all OAuth/MCP, no token (every check below was exercised live when this skill was built):

   | Check | How | If missing |
   | --- | --- | --- |
   | logged in | `wrangler whoami` | `wrangler login` *(human)* |
   | `site` is a Cloudflare zone | `execute()` `GET /zones?name=<site>` | add `site` to the account first |
   | R2 on + `bucket` exists | `wrangler r2 bucket list` / `GET /accounts/{id}/r2/buckets` | enable R2 *(human)* → `wrangler r2 bucket create <bucket>` |
   | Worker exists on `site` | `execute()` `workers_list` / `wrangler deployments` | the deploy below creates it |
   | Zero Trust + OTP on | `GET /access/organizations` + `/identity_providers` | enable Access *(human)* → confirm OTP |

   Then generate + deploy — the agent fills the template's `__WORKER__`/`__SITE__`/`__BUCKET__` from the Config, writes `worker/wrangler.toml`, and deploys with `npx` (self-fetches wrangler — nothing global to install):
   ```
   npx wrangler deploy --cwd "<this-skill-dir>/worker"
   ```
   `<this-skill-dir>` is wherever the skill lives (e.g. `~/.agents/skills/publish-artifacts`, or the repo checkout). Deploy provisions the `site` custom domain + TLS and binds the bucket. **Report a status table** — each piece `✓ exists` / `created` / `needs you` — so the account state is visible in one place. (The generated `wrangler.toml` and the `.wrangler/` cache are gitignored.)
5. **Install Cloudflare's plugin — wires up the Access-capable MCP (human, once per machine).** This is Cloudflare's own agent setup (from `https://developers.cloudflare.com/agent-setup/prompt.md`):
   ```
   claude plugin marketplace add cloudflare/skills
   claude plugin install cloudflare@cloudflare
   ```
   then `/reload-plugins`. It connects Cloudflare's MCP servers — including the full-API one at `https://mcp.cloudflare.com/mcp` (Code Mode `search()`/`execute()`, which fronts the whole API incl. Zero Trust/Access) plus `docs`/`bindings`/`builds`/`observability` — and bundles Cloudflare's official skills. **OAuth triggers automatically on first Cloudflare tool use; no API token.** This is how the agent creates/updates Access apps token-free (`wrangler` can't manage Access; the REST `curl` path needs a token).
   - *Minimal alternative* (just the one MCP, skip the plugin bundle): `claude mcp add --transport http cloudflare-api https://mcp.cloudflare.com/mcp`.
   - The full-API MCP **does** cover Zero Trust/Access — verified on this account: `execute()` created, served, and deleted a path-scoped Access app + policy token-free. (If a future account's OAuth ever lacks Access scope, the calls return an explicit error rather than failing silently — fall back to a scoped token then.)

Setup is done when: `wrangler whoami` succeeds, the `artifacts` bucket exists, the Worker responds on `https://ubuilt.dev/`, OTP is on, and the Cloudflare MCP (full-API) is connected. After that, publishing is fully automated.
