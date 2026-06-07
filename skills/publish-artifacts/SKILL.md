---
name: publish-artifacts
description: Publish HTML artifacts (mockups, demos, reports, prototypes) from a local folder tree to a Cloudflare-hosted site at ubuilt.dev, preserving the folder structure as URL paths, with per-folder access control — some folders public, others gated behind email one-time-PIN for named collaborators who need no Cloudflare account. Additive and multi-machine safe: every publish reconciles against live Cloudflare state (R2 objects + Access apps) and never clobbers what another machine pushed. Use when the user says "publish this artifact / mockup / prototype", "share this with <person>", "put this folder behind email auth", "publish to ubuilt.dev", "make this folder public / protected", "unpublish X", or otherwise wants to deploy an HTML tree to their Cloudflare artifacts site and control who can see each part.
---

# publish-artifacts

Turn a local folder of HTML artifacts into a live site at your domain, where the folder tree *is* the URL structure and each top-level folder is either public or locked to specific people by email one-time-PIN. The whole thing is driven by one declarative `manifest` and is safe to run from any machine.

## Config — your specifics, in one place

Three values personalize this skill. They live in the **manifest** (the single source of truth). Nothing instance-specific is committed: the repo ships a generic **`worker/wrangler.toml.template`**, and **init generates `worker/wrangler.toml`** (gitignored) by substituting these values — wrangler can't read JSON, so this generation step is the bridge.

| Key | Example | Used for |
| --- | --- | --- |
| `site` | `ubuilt.dev` | the apex the Worker serves, and the host in every Access app `domain` |
| `bucket` | `artifacts` | the R2 bucket that holds the objects |
| `worker` | `ubuilt-artifacts` | the Worker name |

Throughout this doc `ubuilt.dev`, `artifacts`, and `ubuilt-artifacts` appear as **concrete examples** — read them as your Config values. To point the skill at a different domain: set these three in the manifest, then run setup (which generates `worker/wrangler.toml` from the template). Nothing else is account-specific. (The Worker code itself hardcodes nothing — it serves whatever the bound bucket holds.)

## Mental model

- **The folder tree is the URL map.** `mockups/clientA/home.html` → `https://ubuilt.dev/clientA/home.html`; `clientA/index.html` → `https://ubuilt.dev/clientA/`. What you publish is exactly what the structure says.
- **Storage is additive.** Files live as objects in a private **R2** bucket. Publishing *adds or overwrites* the files you have locally; it never deletes what isn't in your local tree. So you can publish `clientC/` from your laptop without touching `clientA/` that your desktop pushed last week. Removing something is an explicit `unpublish`.
- **The cloud is the source of truth — there is no local state file.** Every run *pulls* current Cloudflare state (R2 object list + Access apps) and reconciles your manifest against it. Run it from three machines; they converge, they don't fight. This is the whole reason the design avoids Terraform-style local state.
- **Access is per top-level folder.** A folder is `public` (no gate) or `protected` (gated to an allow-list). Protection is a Cloudflare Access application scoped to `ubuilt.dev/<folder>/*`. Uncovered paths stay open; covered paths are deny-by-default.
- **Collaborators need no account.** Protected folders use the built-in **Email One-Time-PIN** identity provider: the visitor enters their email, gets a code, and they're in if their address is on the folder's allow-list. No Google, no Cloudflare login.

## Placement — folder = URL = audience

Because a top-level folder is at once the URL prefix *and* the access boundary, **where you put a file decides who can see it.** So add artifacts mindfully, not wherever is convenient:

- **Group by audience first, topic second.** A client-confidential mockup goes under that client's `protected` folder — never under `public/`. A misplaced file either *leaks* (sensitive bytes in an open folder) or is *invisible* to the people who need it.
- **Decide the destination folder before generating artifacts.** When asked to "make and publish" something, pick the audience/folder first — confirm with the user if it isn't obvious — then write into that folder so the publish maps it correctly.
- **One audience per top-level folder.** Two artifacts needing different allow-lists need different top-level folders; don't co-locate them.
- **Shared assets** (CSS/JS/images referenced across folders) are served at whatever folder holds them — keep cross-cutting assets in a `public/` folder only if they're not sensitive, since that folder is ungated.

## Architecture (how it actually runs)

```
  local artifacts/            Cloudflare                         visitor
  ────────────────            ──────────                         ───────
  manifest.json   ──reconcile─► Access apps                      GET /clientA/x.html
  public/        ─┐            ubuilt.dev/clientA/*  ──gate──►    → OTP email → code → in
    index.html    │ wrangler   ubuilt.dev/clientB/*              GET /public/x.html
  clientA/       ─┼─r2 object─► (private) R2 bucket "artifacts"  → served directly (no gate)
    home.html     │  put       keys mirror the tree
  clientB/       ─┘
                     Worker on ubuilt.dev (custom domain):
                       path → R2 key, index.html, content-type, 404
                       workers_dev = false  (no *.workers.dev bypass)
```

Three moving parts, two of them set up once:

1. **A private R2 bucket** (`artifacts`) — the additive object store. *Stays private* — only the Worker reads it.
2. **One serving Worker** bound to the bucket, on the `ubuilt.dev` custom domain — maps request paths to R2 keys, handles `index.html` and content types. Deployed once; only changes if you edit serving logic.
3. **Per-folder Access apps** — created/updated on every publish to match the manifest.

Each request to a protected path hits Access *at the edge first* (gate), then the Worker (serve). A private bucket + `workers_dev = false` means there is no way to reach protected bytes except through the gated hostname.

## One-time setup (do once per account; the skill detects and offers to run it)

On first use, check whether setup exists (is `wrangler` logged in? does the `artifacts` bucket exist? does the Worker exist? is the Code Mode MCP connected?). If not, walk the user through this. **No API token required — everything authenticates via browser OAuth.** A couple of steps are the human's (an interactive login, confirming OTP); the rest the agent runs.

**Prerequisites already true for this user:** `ubuilt.dev` is registered on Cloudflare (Registrar), so the zone is already on Cloudflare nameservers — no DNS migration.

1. **Log in with OAuth — no token (human, once per machine).** Run `wrangler login`. It opens a browser, you authorize, and wrangler stores an OAuth session locally. With no flags it requests all available scopes, which include Workers deploy *and* R2 — so this one login covers creating the bucket, deploying the Worker, and every asset upload. `wrangler whoami` then shows the account email + id (no secret to copy anywhere).
2. **Confirm Email OTP is enabled (human, ~30s).** Zero Trust → Settings → Authentication → Login methods. **One-time PIN** is a default method — just confirm it's on. (If the org has never been initialized, the dashboard will prompt for a team name once; pick one, e.g. `ubuilt`.)
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

### The serving Worker

Bundled in the skill at `worker/` and the source of truth: a generic `src/index.ts` and a `wrangler.toml.template`. The real `wrangler.toml` is generated from the template at init (step 4) and gitignored. The blocks below are a copy for reading.

`worker/src/index.ts`:

```ts
export interface Env {
  ARTIFACTS: R2Bucket;
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif",
  ico: "image/x-icon",
  woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf",
  txt: "text/plain; charset=utf-8", pdf: "application/pdf", map: "application/json",
};

function typeFor(key: string): string {
  const ext = key.includes(".") ? key.split(".").pop()!.toLowerCase() : "";
  return TYPES[ext] ?? "application/octet-stream";
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    const url = new URL(req.url);
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");

    // Candidate R2 keys, most-specific first. The tree maps 1:1 to keys.
    const candidates =
      path === "" || path.endsWith("/")
        ? [path + "index.html"]
        : [path, path + "/index.html", path + ".html"];

    for (const key of candidates) {
      const obj = await env.ARTIFACTS.get(key);
      if (obj) {
        const headers = new Headers();
        obj.writeHttpMetadata(headers);
        headers.set("Content-Type", typeFor(key));
        headers.set("X-Content-Type-Options", "nosniff"); // serve the declared type, never sniff
        headers.set("Cache-Control", "no-store"); // artifacts iterate; never serve stale
        headers.set("ETag", obj.httpEtag);
        return new Response(req.method === "HEAD" ? null : obj.body, { headers });
      }
    }
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
```

`worker/wrangler.toml.template` (committed; init substitutes `__WORKER__` / `__SITE__` / `__BUCKET__` from the Config):

```toml
name = "__WORKER__"
main = "src/index.ts"
compatibility_date = "2026-01-01"

# No *.workers.dev URL — the ONLY way in is the gated custom domain.
workers_dev = false

# Whole apex routed to this Worker; Access apps gate specific paths.
routes = [
  { pattern = "__SITE__", custom_domain = true }
]

[[r2_buckets]]
binding = "ARTIFACTS"
bucket_name = "__BUCKET__"
```

## The manifest — folder → access

A single file at the **root of the local artifacts tree**, named `artifacts.manifest.json`. It declares, per top-level folder, who can see it. Folders not listed inherit `default`.

```json
{
  "site": "ubuilt.dev",
  "bucket": "artifacts",
  "worker": "ubuilt-artifacts",
  "default": "public",
  "folders": {
    "public":  { "access": "public" },
    "landing": { "access": "public" },
    "clientA": { "access": "protected", "allow": ["jane@acme.com", "@acme.com"] },
    "clientB": { "access": "protected", "allow": ["bob@globex.com"] }
  }
}
```

The `site` / `bucket` / `worker` keys are the [Config](#config--your-specifics-in-one-place) — they must match `worker/wrangler.toml`. `default` + `folders` are the per-tree access map.

Rules for `allow` entries:
- A string **with a local part** (`jane@acme.com`) → exact email (`include: {email: {email: …}}`).
- A string **starting with `@`** (`@acme.com`) → anyone at that domain (`include: {email_domain: {domain: "acme.com"}}`).
- A `protected` folder with an **empty or missing `allow` is fail-closed** (nobody gets in). That's safe but pointless — **warn** the user and ask for emails before publishing it.

If there's no manifest yet, infer a draft from the tree (every top-level folder → `default`) and show it for confirmation before publishing. Never invent allow-lists; ask who each protected folder is for.

## Publish — the per-call operation

Inputs: a local artifacts directory (default: the cwd if it has a manifest, else ask). The operation is **idempotent** and **additive**.

1. **Resolve + validate.** Find the artifacts root and its `artifacts.manifest.json`. Validate every `protected` folder has a non-empty `allow`. Confirm the destination is `ubuilt.dev`.
2. **Auth + setup check.** Ensure `wrangler` has an OAuth session (`wrangler whoami`) and the Code Mode MCP is connected; confirm the bucket + Worker exist (run one-time setup if not). No token needed.
3. **Upload assets to R2 (additive).** For every file under the root, preserving relative path as the R2 key:
   ```bash
   wrangler r2 object put "artifacts/<relpath>" --file="<abspath>" --content-type="<type>" --remote
   ```
   The key (`clientA/home.html`) is exactly what the Worker resolves. This only *adds/overwrites* the local files — nothing else in the bucket is touched, so concurrent machines stay additive. For large trees, an S3-compatible batch tool (`rclone copy <dir> r2:artifacts` against the R2 S3 endpoint) is a faster equivalent — note it but `wrangler r2 object put` in a loop needs no extra setup.
4. **Pull current Access state.** List existing Access apps and keep only the ones this skill manages — identify them by `domain` starting with `ubuilt.dev/` **and** name starting with `artifacts/`. Never read/modify apps outside that namespace (that's how we avoid clobbering anything else on the account).
   - Code Mode MCP: `execute()` a `GET /accounts/{id}/access/apps`.
   - Fallback: `curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"`
5. **Reconcile per top-level folder** (desired = manifest, actual = step 4):
   - **public** → ensure **no managed app** covers `ubuilt.dev/<folder>/*`. If one exists from a prior run, delete it. (No app = open, because we leave "Require Access protection" off.)
   - **protected** → ensure a policy with the folder's allow-rules exists, and an app `artifacts/<folder>` at `ubuilt.dev/<folder>/*` references it. Create if missing; update allow-list/policy if it drifted from the manifest. Keyed on the domain so re-runs update in place rather than duplicating.
   - Leave unmanaged apps and unrelated folders untouched.
6. **Report** (see Reporting style): each folder's URL, access, and who — plus exactly what changed this run.

### Access reconciliation — the API shapes

**Primary (token-free): the Code Mode MCP `execute()`** calling these same Access endpoints — that's how this runs when authing by OAuth. The `curl` form below is the byte-identical equivalent for the optional API-token path; the request bodies are the same either way, so read these as the *shapes* `execute()` should send.

Create/update a **policy** (reusable), then reference it from the **app**. Allow-list built from the folder's `allow`:

```bash
# 1) policy
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/policies" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" --json '{
    "name": "artifacts/clientA",
    "decision": "allow",
    "include": [
      { "email": { "email": "jane@acme.com" } },
      { "email_domain": { "domain": "acme.com" } }
    ]
  }'

# 2) app, scoped to the folder path, referencing the policy id from (1)
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" --json '{
    "name": "artifacts/clientA",
    "type": "self_hosted",
    "domain": "ubuilt.dev/clientA/*",
    "session_duration": "24h",
    "app_launcher_visible": false,
    "allowed_idps": [],
    "policies": ["<POLICY_ID>"]
  }'
```

- `domain` holds the **hostname + path + wildcard** — this is what scopes the app to one folder. Access resolves most-specific path first, so `ubuilt.dev/clientA/*` governs that subtree while siblings stay open.
- `allowed_idps: []` = all configured login methods, which includes One-Time-PIN. (To force OTP-only, set it to the OTP IdP's id — look it up via the identity-providers endpoint.)
- Updates use `PUT …/access/apps/<id>` and `…/access/policies/<id>`. The `domain` form above is **verified working** (a `self_hosted` app with a path wildcard, created + served + deleted via `execute()`). The newer API also accepts `destinations: [{type:"public", uri:"ubuilt.dev/clientA/*"}]` as an equivalent — only reach for it if a future schema change rejects `domain`.

`unpublish <path>`: delete the matching R2 objects (`wrangler r2 object delete "artifacts/<relpath>"`) and, if a whole protected folder is removed, delete its managed Access app + policy. Confirm before deleting — deletion is the one non-additive action.

## Security invariants — never violate

1. **`workers_dev = false` stays in `wrangler.toml`.** A live `*.workers.dev` route serves the same Worker on an *ungated* hostname — a complete bypass of Access. If it's ever re-enabled (a dashboard toggle silently flips back on next deploy unless the config says false), protected content leaks. Verify after every Worker deploy.
2. **The R2 bucket stays private.** Never enable its `r2.dev` public URL or attach a public custom domain to the bucket — that exposes objects directly, around the gate. Only the Worker's binding reads it.
3. **Leave the account "Require Access protection" setting OFF.** With it off, uncovered paths are public (what we want for `public/` folders) and covered paths are gated. If it were on, every public folder would need an explicit Bypass policy — more moving parts, easy to get wrong.
4. **Protected = deny-by-default.** An app with no allow-policy lets nobody in; a protected folder with an empty `allow` is fail-closed. Safe, but warn rather than publish a folder no one can open.
5. **Only touch the `artifacts/` Access namespace.** Manage exactly the apps you created (name `artifacts/*`, domain `ubuilt.dev/*`). Pull-then-reconcile; never bulk-delete or assume local state is authoritative.

## Tools & auth — use both, each where it's strongest

| Job | Primary | Fallback |
| --- | --- | --- |
| Deploy/redeploy the Worker | `wrangler deploy` | Code Mode MCP `execute()` |
| Upload / delete R2 objects | `wrangler r2 object put/delete` (or `rclone` for bulk) | Code Mode MCP / S3 API |
| List current R2 / Worker state | `wrangler r2 object list`, `wrangler deployments` | connected Cloudflare MCP read tools |
| Create/update/list Access apps + policies | Code Mode MCP `execute()` | REST API `curl` with the token |

- **Default auth is OAuth — no API token.** `wrangler login` (browser; all scopes incl. R2) covers Worker deploy + R2 uploads; the **Code Mode MCP** (`https://mcp.cloudflare.com/mcp`, OAuth) covers Access. Both are per-machine browser logins — nothing secret to copy between machines. The local OAuth session is machine-local *auth*, not resource state; the cloud is still the single source of truth for what's published.
- Because there's no token, **Access goes through the Code Mode MCP `execute()`** — the REST `curl` path needs a bearer token. The **older connected Cloudflare MCP** (`Cloudflare_Developer_Platform`) is read-only and can't write Access — use it only to *read* state.
- **An API token is optional, only for headless/CI** (e.g. a future scheduled publish with no browser). If ever wanted: a token with Workers Scripts + Workers R2 Storage + Access: Apps and Policies (Edit) makes both wrangler and the `curl` Access calls headless. Note `wrangler auth token` prints the current OAuth token, but wrangler's scopes don't include Access — so it can't authorize the Access API; use the MCP or a real token for that.

## Reporting style

After a publish, one compact table plus a one-line changelog. Example:

```
Published 3 folders to ubuilt.dev  (R2: +4 files, Access: 1 app updated)

  folder     URL                          access      who
  ───────    ─────────────────────────    ─────────   ─────────────────────
  public/    https://ubuilt.dev/public/   public      anyone
  clientA/   https://ubuilt.dev/clientA/  protected   jane@acme.com, @acme.com
  clientB/   https://ubuilt.dev/clientB/  protected   bob@globex.com

  Changed: clientA allow-list +@acme.com · uploaded clientA/home.html, clientA/flow.html, public/index.html, public/style.css
```

Always show the actual URLs (they're clickable and the point of the whole thing), the access state, and the allow-list for protected folders. Call out collaborators' first-visit flow when a protected folder is new: "clientA is gated — jane@acme.com will get a one-time PIN by email on first visit."

Never print the API token. Never dump full R2 listings unless asked.

## Files

- `<artifacts-root>/artifacts.manifest.json` — the Config (`site`/`bucket`/`worker`) + per-folder access map (committed with the artifacts; it's the source of intent).
- `worker/` **inside this skill** — the serving Worker. Committed + generic: `src/index.ts`, `wrangler.toml.template`, `.gitignore`. **Not committed (gitignored):** `wrangler.toml` (generated from the template at init, step 4), `.wrangler/`, `node_modules/`. Deploy with `npx wrangler deploy --cwd <skill>/worker`. Bundling the generic files here is what makes it identical across machines (ships via `npx skills`); only the generated config is instance-specific.
- No machine-local state that matters. The generated `wrangler.toml` is a local artifact reproducible from Config at any time; the current truth of what's published always lives in Cloudflare (R2 objects + Access apps) and is pulled fresh each run.
