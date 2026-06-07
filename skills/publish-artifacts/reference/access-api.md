# Access reconciliation — verbatim API bodies & the CI token path

The Publish flow's "Access reconciliation — the API shapes" section in `SKILL.md` lists the request *fields* (what `execute()` must send over OAuth). This file holds the verbatim `curl` forms — the byte-identical equivalent for the optional API-token path; the request bodies are the same shapes either way — plus the optional headless/CI token setup.

**Primary (token-free): the Code Mode MCP `execute()`** calling these same Access endpoints — that's how this runs when authing by OAuth. The `curl` form below is the byte-identical equivalent for the optional API-token path.

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

# 2) app, scoped to the folder path, referencing the policy id from (1).
#    Scope to BOTH the bare folder path AND the wildcard — see the note below.
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" --json '{
    "name": "artifacts/clientA",
    "type": "self_hosted",
    "destinations": [
      { "type": "public", "uri": "ubuilt.dev/clientA" },
      { "type": "public", "uri": "ubuilt.dev/clientA/*" }
    ],
    "session_duration": "24h",
    "app_launcher_visible": false,
    "allowed_idps": [],
    "policies": ["<POLICY_ID>"]
  }'
```

- **Two destinations, not one.** `ubuilt.dev/clientA/*` governs the subtree but does **not** match the bare path `ubuilt.dev/clientA` (no trailing slash), which the serving Worker still resolves to `clientA/index.html`. Scoping only `/*` leaks the folder index at the no-slash URL. List both `ubuilt.dev/clientA` (exact) and `ubuilt.dev/clientA/*` (subtree). Access resolves most-specific path first, so siblings stay open.
  - This is the Access half of security invariant 6; the Worker half (rejecting `%2F`/`%5C`/`..` and redirecting non-canonical paths) is required too — Access path rules can't see through an encoded `%2F`, so the Worker MUST refuse to serve it. Neither layer alone is sufficient.
- `allowed_idps: []` = all configured login methods, which includes One-Time-PIN. (To force OTP-only, set it to the OTP IdP's id — look it up via the identity-providers endpoint.)
- Updates use `PUT …/access/apps/<id>` and `…/access/policies/<id>`; pass the full `destinations` + `policies` arrays again (PUT replaces). The legacy single-string `domain: "ubuilt.dev/clientA/*"` field still works for the subtree but cannot express the bare path, so prefer `destinations`. The create/update via `execute()` is verified working on this account.

## Optional: API token for headless/CI

An API token is optional, only for headless/CI (e.g. a future scheduled publish with no browser). A token with **Workers Scripts + Workers R2 Storage + Access: Apps and Policies (Edit)** makes both `wrangler` and the `curl` Access calls headless. Note `wrangler auth token` prints the current OAuth token, but wrangler's scopes don't include Access — so it can't authorize the Access API; use the MCP or a real token for that. Never print the API token.
