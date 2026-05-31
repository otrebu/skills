---
name: topic-to-issue
description: Investigate a given topic against the codebase, docs, and (when relevant) the web, then — only if it surfaces a concrete action that can't be resolved right now — draft a lean, assertive GitHub issue and create it for the relevant repo via the gh CLI after the user confirms. Use when the user hands over a topic, idea, or question to look into and may want it captured as an actionable ticket — e.g. "look into X and open an issue if needed", "investigate Y", "should this become a ticket?".
---

# topic-to-issue

Investigate a topic. If — and only if — it leaves a concrete action that can't be resolved on the spot, capture it as an actionable GitHub issue. Otherwise just answer; do not file noise.

## Steps

1. **Investigate the topic.**
   - Search the current repo first (`Grep`/`Glob`/`Read`) and any docs it ships.
   - Reach for the web (`WebSearch`/`WebFetch`) only when the topic isn't codebase-internal.
   - Goal: establish the facts so the ticket reflects a finished investigation, not a guess.

2. **Decide: file or not.** Open an issue ONLY when the investigation leaves a concrete action that can't be done right now — needs another person, another repo, or is deferred work. If you can just answer or fix it now, do that and stop. State the verdict either way.

3. **Draft using the template below.** Keep the *What to do* line imperative and scoped. Add the *Open question* line only when something genuinely needs deciding first. Drop *Pointers* if there's nothing to link. Fill *Done when* with checkable outcomes.

4. **Confirm before creating.** Show the full drafted issue (title + body) and the target repo. Wait for the user's go-ahead. Creating an issue is outward-facing — never `gh issue create` without confirmation.

5. **Create it.** Write the body to a temp file (preserves markdown/backticks/checkboxes), then create against the current repo. Report back the issue URL.

## Template

```markdown
**Title:** <imperative summary — "Add X", "Decide Y", "Fix Z">

### Context
Why this came up + what the investigation established. 2–3 lines or a few bullets.

### What to do
Assertive statement of the action to take — imperative, scoped.
- Open question: <…>   ← include only if something genuinely needs deciding first

### Pointers
- file paths / URLs / constraints worth knowing  (drop the section if none)

### Done when
- [ ] checkable outcome
```

The title goes in `--title`; everything from `### Context` down goes in the body.

## Creating the issue (gh)

```bash
# Confirm the target repo (run in the repo's working dir)
gh repo view --json nameWithOwner -q .nameWithOwner

# Write the body, then create
# (body file holds the "### Context …" markdown — NOT the title)
gh issue create \
  --title "<imperative summary>" \
  --body-file /tmp/topic-to-issue-body.md
```

- **Repo:** defaults to the repo in the working directory. If the user names a different one, add `--repo owner/name`.
- **Label:** none by default. If the user asks for one, add `--label "<name>"`; if `gh` errors that the label doesn't exist, retry without it and mention the skip.
- **Prereqs:** `gh` must be installed and authenticated (`gh auth status`). If not, surface that instead of failing silently.
