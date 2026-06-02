---
name: work-tree-canvas
description: Maintain a persistent visual work tree in an Obsidian Canvas as you (and the agents you're driving) branch into sub-problems, decisions, and dead ends across sessions. Resolves which canvas to use per project, attaches new nodes to the current 🎯 focus (or asks when ambiguous), and keeps the layout tidy. Use when the user says "add to the tree/canvas", "branch off X", "focus on Y", "tidy the tree", "where was I", "what was I doing", "I lost my place", or otherwise wants to capture / navigate the shape of an ongoing investigation.
---

# work-tree-canvas

A persistent, visual graph of how your work branches as you (and any agents you're driving) traverse a problem space. Each node is a unit of attention — a problem, decision, question, insight. Edges mean "spawned from": a child exists because of its parent. The graph lives in an Obsidian Canvas so you can pan/zoom/edit it like any other note.

Built on top of the JSON Canvas 1.0 format used by [`kepano/obsidian-skills/json-canvas`](https://github.com/kepano/obsidian-skills/tree/main/skills/json-canvas) (MIT, © 2026 Steph Ango). See the **Attribution** section at the end.

## Mental model

- **Nodes are units of attention.** Anything you'd otherwise lose between sessions: an open question, a decision you punted on, an insight that came up while debugging something else.
- **Edges are "because of".** A child exists because the parent led you there. Direction matters — fromNode is the cause / context, toNode is the spawned branch.
- **Exactly one node is 🎯 the current focus.** That's "where I'm thinking from right now". New nodes attach there by default.
- **`add` does not move focus.** Focus only moves when the user says so. This is what lets you branch sideways without descending forever.

## Color & emoji taxonomy

There MUST be exactly one node with color `"5"` (current focus). Refocusing moves the marker; never duplicates it.

| Preset | Color  | Emoji | Meaning             | When to use |
|--------|--------|-------|---------------------|-------------|
| `"1"`  | red    | 🔴    | blocker             | Stuck — needs external input or unblocking action |
| `"2"`  | orange | 💡    | insight / idea      | Worth keeping, doesn't need immediate action |
| `"3"`  | yellow | ❓    | open question       | Default for a new branch; the most common kind |
| `"4"`  | green  | 🟢    | resolved            | Closed out — answered, fixed, or decided |
| `"5"`  | cyan   | 🎯    | current focus       | Exactly one node at a time |
| `"6"`  | purple | 🤔    | decision point      | A fork in the road; usually has multiple children |

## Node text format

```
{emoji} {title}
{YYYY-MM-DD} · {context-tag}
{optional one-line link or path}
```

- Title: one line, ≤ 80 chars
- Context tag: short — e.g. `repo:new-skills`, `pr:#42`, `chat`, `cli`, `obsidian`
- Link line: include only when there's a concrete file path, URL, PR, or issue worth jumping to. Skip if empty — don't pad with whitespace.

In JSON, newlines inside `text` are a single `\n`, NOT `\\n` (double-backslash renders the literal characters `\n` in Obsidian).

## Resolve the canvas — do this first, every time

The mapping `cwd → absolute canvas path` lives at `~/.config/work-tree-canvas/registry.json`:

```json
{
  "/Users/me/dev/foo": "/Users/me/Documents/my-vault/work-trees/foo.canvas"
}
```

Use the absolute path so the vault is implicit.

### Algorithm

1. Identify the project root: if the current working dir is inside a git repo, use `git rev-parse --show-toplevel`; otherwise use `cwd`.
2. Read the registry (create the file with `{}` if it doesn't exist).
3. If the project root is keyed and the canvas file exists, use it. If it's keyed but the file is missing, recreate it from `{"nodes":[],"edges":[]}` and re-seed the root (see below).
4. If the project root is NOT keyed:
   - Discover vaults: `find ~ -maxdepth 6 -name ".obsidian" -type d 2>/dev/null`. The parent of each `.obsidian` directory is a vault root.
   - If exactly one vault is found, propose it. If multiple, list them and ASK which to use.
   - Propose a canvas path of the form `<vault>/work-trees/<repo-basename>.canvas`. ASK to confirm or override.
   - Create any missing intermediate directories.
   - Persist the new mapping to the registry and continue.
5. Confirm to the user once per conversation: `Working tree → <canvas-path>`. Don't repeat.

### Seed the root on first creation

When creating a fresh canvas, write a single root node:
- `id`: fresh 16-hex-char lowercase
- `type`: `"text"`
- `text`: `"🎯 <repo-basename>\n<YYYY-MM-DD>\nroot"`
- `color`: `"5"` (current focus)
- `x`: 0, `y`: 0, `width`: 320, `height`: 120

The root starts as the focus. The user can move focus later.

## Operations

Map natural-language intent to one of these. Always: read the canvas → mutate in memory → validate (see Validation) → write back → report in one line.

### `add` — append a child node

Input: a title; optional explicit parent; optional status (emoji or color).

1. Resolve the parent:
   - If the user named one ("under the auth one"), fuzzy-match against existing node titles. If exactly one matches, use it. If zero or multiple match, ASK with a list.
   - Otherwise, find the current focus (the unique color `"5"` node). If found, use it.
   - If there's no focus AND no parent named, ASK the user to pick a parent from a list of ≤ 6 candidates (top-level nodes + recent additions).
2. Build the new node:
   - 16-hex-char `id`, lowercase, not colliding with any existing node OR edge id.
   - `text` per the format above. Default status: `❓` / color `"3"` (open question).
   - `width: 320`, `height: 120`.
3. Position it via the **Add-time layout** rules below.
4. Add an edge:
   - 16-hex `id`
   - `fromNode`: parent.id, `toNode`: newNode.id
   - `fromSide`: `"bottom"`, `toSide`: `"top"`, `toEnd`: `"arrow"`
   - `label`: include when the user phrased a relation ("because", "blocks", "leads to", "decides between")
5. Do NOT move the focus marker. Only `focus` does that.
6. Report: `Added "{emoji} {title}" under "{parent emoji} {parent title}".`

### `focus` — move the 🎯 marker

Input: target node (fuzzy match on title).

1. Disambiguate as in `add`.
2. Old focus: strip the leading `🎯 ` from its first line, prepend the emoji matching its semantic state. Default: if it has children → `🟢` / color `"4"` (resolved). Otherwise → `❓` / color `"3"`. ASK if the user might want something else (e.g. blocker).
3. New focus: set color `"5"`. Replace the leading emoji on its first line with `🎯 `.
4. Report: `Refocused 🎯 to "{title}" (was "{old title}", marked {emoji}).`

### `update` — change a node's status

Input: target node + new status (emoji name or color preset).

1. Disambiguate.
2. Swap the emoji on the first line and set the color to match.
3. If the user is changing TO 🎯, run `focus` instead (uniqueness).
4. Report: `"{title}" → {new emoji}.`

### `tidy` — full re-layout

Run **full tidy** layout (below) on every node. WARN that this overwrites manual position tweaks before doing it; require a yes from the user.

### `show` — describe current state

Don't try to open the canvas; you can't render it. Instead, report:
- Canvas path
- Current focus title
- Depth-1 branches (root's direct children) with their child counts
- All 🔴 blocker and ❓ open question nodes — these are the "loose ends" worth resurfacing

Keep it ≤ 10 lines. If there are more than ~15 loose ends, summarize counts and list the 5 oldest.

## Layout

Coordinates: top-left origin, +x right, +y down. Snap node coordinates to multiples of 20.

Standard dimensions: 320 × 120. Horizontal slot = 360 (40px gap). Vertical slot = 200 (80px gap).

### Add-time layout (cheap, local)

When adding a child to parent at `(px, py)` that already has `n` children:

1. The new total child count is `n + 1`.
2. Total row width = `(n + 1) * 360 - 40` (slot width × count, minus the trailing gap).
3. Leftmost child x = `px + 160 - totalRowWidth / 2` (parent center is `px + 160`).
4. Distribute children left-to-right: child `i` (0-indexed) goes at `x = leftmost + i * 360`, `y = py + 200`.
5. Re-balance: existing siblings move to their new x; if any sibling has its own subtree, shift every descendant by the same `Δx`.
6. Snap final x values to multiples of 20.

This keeps a single sibling row centered under its parent without disturbing the rest of the tree.

### Full tidy layout (on demand only)

Use the classic layered tidy-tree:

1. Identify the root: the node with no incoming edges. If multiple, pick the oldest (lowest id sort order is fine as a tiebreaker, since ids are random). If there are real cycles, abort and report — don't mangle.
2. BFS to assign each node a depth `d`. Set `y = d * 200`.
3. Recursively compute subtree widths: a leaf's width = 360; an internal node's width = `max(360, sum of children's subtree widths)`.
4. For each parent, place children left-to-right consuming their own subtree widths; horizontally center the parent over its children's combined extent.
5. Snap final x values to multiples of 20.

Edges and node contents are preserved; only x/y change.

## Self-healing on read

Detect and offer to fix these on every read, before any mutation:

- **Zero focus nodes:** ASK which existing node should be focus.
- **Multiple focus nodes:** ASK which to keep; the others get demoted (default `❓` / color `"3"`).
- **Edge with missing `fromNode` or `toNode`:** report orphan edge; ask to delete or rewire.
- **Cycles:** report cycle path; ask to delete one edge.
- **Duplicate ids:** regenerate ids in place, keeping the rest of the data; report what changed.
- **`\\n` in node text:** replace with `\n`.

If the user declines a fix, proceed with the operation but warn that the invariant is broken.

## Obvious-vs-ask rules for attaching

The skill MUST ask when:
- There's no current focus AND no parent named.
- More than one existing node matches the named parent.
- The user's phrasing is generic ("add this", "log that") with no semantic content the skill can match against.
- Previous additions in this conversation were ≥ ~3 turns ago without a focus update — context is stale.

The skill MAY attach silently when:
- A unique current focus exists AND the user said something like "add X" / "branch off into Y" / "new question: …" / "while we're here, capture Z".
- The user explicitly named a parent that disambiguates to exactly one node.
- The user said "and another one" / "another like that" / "a sibling of that" — attach to the SAME parent as the most recent addition in this conversation.

When asking, list ≤ 6 candidates as `{depth-indent}{emoji} {title}` and let the user pick by number or by re-typing a fragment.

## Validation (before every write)

Per JSON Canvas 1.0 plus this skill's invariants:

1. All `id`s unique across nodes AND edges; 16 lowercase hex chars.
2. Every edge `fromNode` / `toNode` resolves to an existing node id.
3. Type-required fields present (`text` for text, `file` for file, `url` for link).
4. `type` ∈ {`text`, `file`, `link`, `group`}.
5. `fromSide` / `toSide` ∈ {`top`, `right`, `bottom`, `left`} when present.
6. `fromEnd` / `toEnd` ∈ {`none`, `arrow`} when present.
7. `color` is preset `"1"`–`"6"` or a valid `#RRGGBB` hex.
8. JSON parses cleanly. Single `\n` for newlines in text.
9. Exactly one node has color `"5"`.
10. No cycles in the edge graph (unless the user explicitly opted in to a cross-link, in which case the edge gets a `label` so it's visually distinct).

If a check fails, don't write — explain which invariant would break and ask.

## Reporting style

One line per operation. Examples of the shape:

- `Added "❓ JWT vs session for SSO" under "🎯 Auth rewrite".`
- `Refocused 🎯 to "Decide cache layer" (prior focus "API rewrite" marked 🟢 resolved).`
- `Marked "JWT vs session for SSO" 🔴 blocker.`
- `Tidied 14 nodes across 4 depths.`
- `Working tree → /Users/.../uby_knowledge_vault/work-trees/new-skills.canvas`

Never dump the full canvas JSON in chat. If the user asks "what's in the canvas", use `show`.

## Files written by this skill

- `~/.config/work-tree-canvas/registry.json` — cwd → canvas mapping (machine-local, do not sync between machines)
- `<vault>/work-trees/<repo-basename>.canvas` — the actual canvas, by default

The user can edit either file manually; the skill re-reads them every invocation.

## Attribution

JSON Canvas 1.0 spec used here: <https://jsoncanvas.org/spec/1.0/>. The validation rules and field reference are derived from the [`json-canvas` skill](https://github.com/kepano/obsidian-skills/tree/main/skills/json-canvas) by Steph Ango (kepano), MIT-licensed. See <https://github.com/kepano/obsidian-skills/blob/main/LICENSE>.
