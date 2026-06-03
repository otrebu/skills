---
name: work-tree-canvas
description: Maintain a persistent visual work tree in an Obsidian Canvas as you (and the agents you're driving) branch into sub-problems, decisions, and dead ends across sessions. Resolves which canvas to use per project, attaches new nodes to the current 🎯 focus (or asks when ambiguous), and keeps the layout tidy. Use when the user says "add to the tree/canvas", "branch off X", "focus on Y", "new topic X", "close / finish the X topic", "tidy the tree", "where was I", "what was I doing", "I lost my place", or otherwise wants to capture / navigate the shape of an ongoing investigation.
---

# work-tree-canvas

A persistent, visual graph of how your work branches as you (and any agents you're driving) traverse a problem space. Each node is a unit of attention — a problem, decision, question, insight. Edges mean "spawned from": a child exists because of its parent. The graph lives in an Obsidian Canvas so you can pan/zoom/edit it like any other note.

Built on top of the JSON Canvas 1.0 format used by [`kepano/obsidian-skills/json-canvas`](https://github.com/kepano/obsidian-skills/tree/main/skills/json-canvas) (MIT, © 2026 Steph Ango). See the **Attribution** section at the end.

## Mental model

- **Nodes are units of attention.** Anything you'd otherwise lose between sessions: an open question, a decision you punted on, an insight that came up while debugging something else.
- **Edges are "because of".** A child exists because the parent led you there. Direction matters — fromNode is the cause / context, toNode is the spawned branch.
- **Exactly one node is 🎯 the current focus.** That's "where I'm thinking from right now". New nodes attach there by default.
- **`add` does not move focus.** Focus only moves when the user says so. This is what lets you branch sideways without descending forever.
- **Groups are containers, not units of attention.** A group is a labeled rectangle that wraps a whole branch into one logical topic bucket (e.g. "Auth Server setup"). It carries a lightweight lifecycle of its own (color + emoji: 📌 active → ⏳ in progress → ⛔ blocked → ✅ done) but takes no edges — it just corrals the nodes whose boxes fall inside its rectangle. See the [Groups](#groups) section.
- **Doneness flows through the tree.** A *container* — a group, or any node that has children — is "done" only when everything inside it is settled (🟢 resolved or 💡 insight). That single rule runs **down** (you can't close a container over open work) and **up** (finishing the last open child offers to close its parents). See [Doneness & propagation](#doneness--propagation).

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

Groups have their own lightweight lifecycle — also color + emoji — described in the [Groups](#groups) section. Groups never use `"5"`: focus is always a text node.

**Open vs settled.** For doneness these six split in two: **open** nodes (❓ question · 🤔 decision · 🔴 blocker · the active 🎯 focus) keep a container from being done; **settled** nodes (🟢 resolved · 💡 insight) don't. An 💡 insight may be promoted to 🟢 once you act on it — either way it stays non-blocking. See [Doneness & propagation](#doneness--propagation).

## Node text format

```
{emoji} {title}
{YYYY-MM-DD HH:MM}
{optional one-line description}
{optional link or path}
```

- Title: one line, ≤ 80 chars
- Timestamp: local date and time to the minute, formatted `YYYY-MM-DD HH:MM`. Read it from the system clock — run `date "+%Y-%m-%d %H:%M"` — never guess or reuse a stale value from earlier in the conversation.
- Description: optional. One short line (≤ ~100 chars) saying what the node is about or what the next action is. Skip it when the title already carries the meaning — don't pad with an empty line.
- Link line: include only when there's a concrete file path, URL, PR, or issue worth jumping to. Skip if empty — don't pad with whitespace.

In JSON, newlines inside `text` are a single `\n`, NOT `\\n` (double-backslash renders the literal characters `\n` in Obsidian).

Existing canvases created before a format change aren't auto-migrated: new nodes use the current format; older nodes keep theirs until you next touch them.

## Edge labels

An edge already means one fixed thing — "spawned from / because of": fromNode is the cause, toNode the branch. Direction carries that meaning, so **the default edge has no label.** A bare arrow is correct and complete; a label that only restates the arrow is a tax, not information.

Add a label ONLY when it names a real relationship the arrow doesn't already imply — a verb that adds something the parent→child direction doesn't: `blocks`, `decides between`, `depends on`, `supersedes`, `duplicates`. When in doubt, leave it bare.

Never label an edge with:

- **The command you were given** — `new topic`, `branch off`, `sub-problem`, `sibling`, `add`. That's structural *intent*: it told the skill where to attach the node, and the structure already records it. Echoing it onto the arrow is the canonical "stupid comment."
- **A restatement of the default** — `because`, `spawned`, `leads to`, `child of`. The arrow says this already.
- **Filler** — `related`, `note`, `re:` slapped onto a tree edge.

Cross-links are the one edge that expects a label: a cross-link points sideways to a node that already has a parent, so unlabeled it reads as a second parent. Label it with the *actual* relationship (`shares root cause with`, `supersedes`, `same config as`); fall back to `related to` only when the tie really is just "these two are connected." A structural parent→child edge is never a cross-link and never takes one of these labels.

## Groups

A group is a `type: "group"` node — a labeled rectangle that wraps one logical topic bucket. Use groups to keep a maturing branch under control: once a branch off the root has become its own topic, wrap it so it reads as a single unit when zoomed out.

### How membership works (read this first)

JSON Canvas groups have **no member list**. A node belongs to a group purely because its box sits inside the group's rectangle — Obsidian computes this geometrically. Three consequences drive everything below:

- **Derive membership on read.** A node is a member of group G if its full box is inside G's rect. The skill recomputes this every invocation; it is never stored.
- **Snapshot before re-layout.** Because membership is geometric, a `tidy` that moves nodes would lose track of which node belongs to which group. So snapshot each group's member set (by enclosure) BEFORE moving anything, then redraw each rect around its members afterward.
- **One group per node.** Keep groups non-overlapping so membership stays unambiguous. If an operation would make two groups overlap, shift a neighbor or ASK — never leave them overlapping.

### Group node shape

- `id`: 16-hex-char lowercase, unique across nodes AND edges.
- `type`: `"group"`.
- `label`: the lifecycle emoji + the topic name, e.g. `⏳ Auth Server setup` (no timestamp). Groups have no `text` field, so the emoji lives on the `label`.
- `x` / `y` / `width` / `height`: the enclosing rectangle (see the fit rule).
- `color`: a preset reflecting the group's lifecycle state (table below). Never `"5"`.

Groups take no edges and are excluded from the one-focus invariant. Unlike the focus marker, any number of groups may share the same lifecycle color.

### Group lifecycle (color + emoji)

A group always carries a state — both a border `color` and a leading emoji on its `label`. New groups start **active**. Move a group along its lifecycle with `update` (e.g. "mark the auth group in progress / blocked / done").

| State         | Color        | Emoji | Meaning |
|---------------|--------------|-------|---------|
| active        | yellow `"3"` | 📌    | topic opened, not yet actively worked |
| in progress   | orange `"2"` | ⏳    | actively being worked right now |
| blocked       | red `"1"`    | ⛔    | stalled — needs unblocking before it can move |
| done          | green `"4"`  | ✅    | every member settled — 🟢 or 💡 (see [Doneness & propagation](#doneness--propagation)) |

The group emoji set (📌 ⏳ ⛔ ✅) is deliberately distinct from the node emoji set (🔴 💡 ❓ 🟢 🎯 🤔) so a glance tells you whether you're looking at a container or a unit of attention, even though both draw from the same six preset colors.

**Lifecycle changes are manual.** The skill never auto-advances a group — moving focus or adding nodes does not touch its state. The single exception is a *suggestion*, never an automatic change: the **auto-done hint** — when every member of a group is settled (🟢 or 💡), offer (don't force) to mark the group ✅ done. This is just the group-flavored case of the [done-up cascade](#doneness--propagation).

### When to create one (ask when unsure, create when obvious, start without)

- **Start ungrouped.** Early on, nodes hang off the focus/root with no group. Don't pre-wrap; the trunk/root normally stays ungrouped for good.
- **Create silently only when explicit and unambiguous:** "group these as X", "wrap the auth branch into a group called X", "start a group 'X' and add Y under it".
- **Propose (ASK) when a branch matures:** when a single child-of-root's subtree reaches ≥ 3 nodes and has a clear theme, offer to wrap it — e.g. `That auth branch has 5 nodes — wrap it as a group "Auth Server setup"?`
- **Never auto-wrap silently.**

### "Topic" means group — map the words to the ops

Users talk about **topics**, not "group nodes". A topic *is* a group (a topic bucket). Two phrasings carry structural intent the skill MUST honor over its own sense of how things relate:

- **"new topic X" / "X as a separate / independent / standalone topic" / "it can live on its own".** Create X as a new **top-level branch off the root** — parent = the root node, NOT the current focus and NOT whatever node you were just discussing, *even when X is obviously related to recent work*. Explicit independence beats inferred relatedness. Start it as a single ungrouped node (per "Start ungrouped"); offer to wrap it in a group once its subtree grows. If the relationship to existing work is worth recording, add one **labeled cross-link** edge from the related node, labeled with the *actual* relationship (`shares root cause with`, `supersedes`; `related to` only as a last resort) — but the structural parent stays the root. The structural root→topic edge itself stays **bare**: it's a plain branch, so labeling it `new topic` is exactly the filler to avoid (see [Edge labels](#edge-labels)). Never make a node a descendant of the related node when the user asked for a new/independent topic.

- **"closing / closed topic X" / "X topic is done" / "finished the X topic".** This is a **group action on X**, not a new node dangling outside it. Resolve X to a group (fuzzy-match the topic name against group labels; if the user named a node instead, take the group enclosing it), then:
  1. **All in-group nodes already settled (🟢 or 💡)** → mark the group ✅ done (group-lifecycle `update`). If the user handed you a concrete result (a configured hostname, a merged PR), you MAY add one closing node *inside* the group — as a child of the relevant in-group node, so the fit rule grows the rect to include it. A closing node never lands outside the group rect.
  2. **Group still has open nodes inside** (❓ / 🔴 / 🤔, or the 🎯 focus) → apply the [done-down guard](#doneness--propagation): **push back**, name them (`k/n settled`), and ask whether to (a) resolve them, (b) move them out of the group, or (c) mark it ✅ done anyway. Don't silently spawn a node somewhere else on the canvas.
  3. **No group matches, but the name resolves to an ungrouped branch** (a child-of-root node + its descendants) → the topic was never wrapped. Mark that branch's head node 🟢 resolved (and any open descendants the user means), and offer to `group` the branch so it reads as a closed topic bucket. Add any closing node as a child within that branch.
  4. **Nothing matches the named topic at all** → ASK which topic they mean (list group labels and depth-1 branch heads), or offer to treat it as a plain node `add`.

### The fit rule (always fit)

A group's rectangle MUST always enclose all its members with a uniform `PAD = 40` on every side. Recompute it on every add-into-group and every tidy:

```
minX = min(member.x)            ; minY = min(member.y)
maxX = max(member.x + member.w) ; maxY = max(member.y + member.h)
group.x      = minX - PAD       ; group.y      = minY - PAD
group.width  = (maxX - minX) + 2*PAD
group.height = (maxY - minY) + 2*PAD
```

Snap `group.x` / `group.y` to multiples of 20. A member's box never pokes outside its group.

## Doneness & propagation

The whole model is one idea: **a container is done only when its contents are settled.** A *container* is a group, or a text node that has children; its **contents** are the group's enclosed members (by the [fit rule](#the-fit-rule-always-fit)) or the node's children (follow edges).

**Open vs settled.** Open nodes keep a container from being done; settled ones don't.

- **Open:** ❓ open question · 🤔 decision · 🔴 blocker · the active 🎯 focus.
- **Settled:** 🟢 resolved · 💡 insight. An 💡 insight may be promoted to 🟢 when acted on / folded in — both are non-blocking, so "settled = 🟢 or 💡" either way.

**Down — the guard (hard).** Never mark a container done while it holds open nodes. If asked to, **block**: name the open ones (`k/n settled`, list them) and offer to (a) resolve them, (b) move them out of the container, or (c) override with an explicit *"do it anyway."* A deliberate override is respected — `show` later flags the result, but the skill never re-nags. This is the only place "done" is enforced.

**Up — the cascade (soft; suggest only).** Whenever a node becomes 🟢 and that leaves **all** of its parent's children settled, proactively offer to resolve the parent too — climbing as far up as it stays true, in **one combined prompt**. Never auto-change. **Stop** the climb at:

- a 🤔 decision or 🔴 blocker ancestor — present it as an explicit *"ready to decide / unblock?"* step, never rolled past; on yes, flip it 🟢 and keep climbing;
- the first ancestor that still has an open child; or
- the 🎯 focus — resolving the focus is a focus move, so ASK where focus goes instead of demoting it silently.

A group that becomes all-settled folds into the same offer — this is the group's **auto-done hint**.

**Open work inside a *done* container.** If an open node lands in a done container later — you `add` one, or a settled node is reopened — don't let it sit silently, and don't auto-decide. Surface the call and let the user pick: **move the node out** of the container (it's a separate thread) **or reopen** the container (it wasn't finished). "Move out" means reposition outside a group's rect (then re-fit), or re-parent a child node elsewhere (e.g. to the root); "reopen" sets a group ✅ → active/in-progress, or a node 🟢 → its open state.

**Decisions** transition to 🟢 *in place* when made — there is no separate "supersede" record.

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
- `text`: `"🎯 <repo-basename>\n<YYYY-MM-DD HH:MM>\nroot"`
- `color`: `"5"` (current focus)
- `x`: 0, `y`: 0, `width`: 320, `height`: 120

The root starts as the focus. The user can move focus later.

## Operations

Map natural-language intent to one of these. Always: read the canvas → mutate in memory → validate (see Validation) → write back → report in one line.

### `add` — append a child node

Input: a title; optional explicit parent; optional status (emoji or color).

1. Resolve the parent:
   - **New/independent topic?** If the user framed this as a "new topic" or said it's separate / independent / standalone / "can live on its own", set the parent to the **root** — not the focus, not the last-discussed node. See ["Topic" means group](#topic-means-group--map-the-words-to-the-ops). (And if the phrasing was instead "*closing* a topic", this isn't an `add` at all — route to the group-close flow there.)
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
   - `label`: omit by default — see [Edge labels](#edge-labels). Add one only when it names a real relationship the arrow doesn't already imply (`blocks`, `decides between`, `depends on`). Never the command intent (`new topic`, `branch off`) and never a restatement of the default (`because`, `leads to`).
5. Do NOT move the focus marker. Only `focus` does that.
6. **Open node into a done container?** If the parent (or its enclosing group) is already done and this new node is open, don't let open work sit silently inside it — surface the [move-out-or-reopen call](#doneness--propagation).
7. Report: `Added "{emoji} {title}" under "{parent emoji} {parent title}".`

### `focus` — move the 🎯 marker

Input: target node (fuzzy match on title).

1. Disambiguate as in `add`.
2. Old focus: strip the leading `🎯 ` from its first line, prepend the emoji matching its semantic state. Default: if it has children → `🟢` / color `"4"` (resolved). Otherwise → `❓` / color `"3"`. ASK if the user might want something else (e.g. blocker). If the old focus becomes 🟢 and that settles all of its parent's children, run the [done-up cascade](#doneness--propagation).
3. New focus: set color `"5"`. Replace the leading emoji on its first line with `🎯 `.
4. Report: `Refocused 🎯 to "{title}" (was "{old title}", marked {emoji}).`

### `update` — change a node's or group's status

Input: target (node or group) + new status.

1. Disambiguate.
2. **Text node:** swap the emoji on the first line and set `color` to match the node taxonomy (promoting a 💡 insight to 🟢 is just this). **Group:** swap the lifecycle emoji prefix on the `label` and set `color` to match the group lifecycle.
3. If the user is changing a node TO 🎯, run `focus` instead (uniqueness).
4. **Set a node to 🟢:** after the swap, run the [done-up cascade](#doneness--propagation) — if it settled all of its parent's children, offer to resolve the parent too, climbing in one prompt.
5. **Mark a container done** (a node with children, or a group — including "topic X is done / closed / finished", a group action; see ["Topic" means group](#topic-means-group--map-the-words-to-the-ops)): apply the [done-down guard](#doneness--propagation). Mark it done only when every content node is settled; if open nodes remain, push back (`k/n settled`) and offer resolve / move-out / override rather than marking done or spawning an outside node. Add any closing node *inside* the group.
6. **Reopen a settled node inside a done container:** surface the [move-out-or-reopen call](#doneness--propagation).
7. Report: `"{title}" → {new emoji}.`

### `group` — wrap a branch / create or extend a topic bucket

Input: a set of nodes (named, or "this branch" / "the auth branch" = a node and its descendants) plus a label.

1. Resolve the member set:
   - "the X branch" / "wrap this": fuzzy-match X to a node; members = that node and all its descendants (follow edges).
   - "group these": the named nodes (disambiguate each as in `add`).
2. If a group with that label already exists, extend it (fold the new members in) rather than creating a second one.
3. Create the group node: fresh 16-hex `id`, `type: "group"`, the `label` prefixed with 📌, and `color: "3"` — i.e. start in the **active** state (see the group lifecycle).
4. Compute its rectangle via the fit rule around the member set.
5. If the new rect overlaps an existing group, shift the smaller neighbor group (and its members) clear; ASK if that isn't clean.
6. Do NOT add edges to/from the group, and do NOT move focus.
7. Report: `Grouped {N} nodes into "{label}".`

### `ungroup` — remove a topic bucket

Input: target group (fuzzy-match on label).

1. Delete the group node only. Its members are untouched — they keep their positions, edges, and status; they're simply no longer enclosed.
2. Report: `Ungrouped "{label}" ({N} nodes released).`

### `tidy` — full re-layout

Snapshot each group's members (by enclosure) first, run **full tidy** layout (below) on every text node, then redraw every group rect via the fit rule. WARN that this overwrites manual position tweaks before doing it; require a yes from the user.

### `show` — describe current state

Don't try to open the canvas; you can't render it. Instead, report:
- Canvas path
- Current focus title
- Depth-1 branches (root's direct children) with their child counts
- Groups (topic buckets) with their state emoji and member counts
- All **open** nodes — ❓ open questions, 🔴 blockers, 🤔 undecided forks — these are the "loose ends" worth resurfacing
- Any **done container holding open work** (a ✅ group or 🟢 parent with an open node still inside) — flag it so an overridden or reopened close doesn't hide a thread

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
7. **Groups:** if the parent sits inside a group G, the new child is a member too — after positioning it, grow G via the fit rule to enclose it. If that growth makes G overlap a neighbor group, don't fight it locally: warn and recommend `tidy`, which re-separates groups cleanly.

This keeps a single sibling row centered under its parent without disturbing the rest of the tree.

### Full tidy layout (on demand only)

Use the classic layered tidy-tree:

1. Snapshot each group's members by enclosure, then set the group nodes aside — they aren't tree nodes and don't get a depth.
2. Identify the root: the text node with no incoming edges. If multiple, pick the oldest (lowest id sort order is fine as a tiebreaker, since ids are random). If there are real cycles, abort and report — don't mangle.
3. BFS to assign each node a depth `d`. Set `y = d * 200`.
4. Recursively compute subtree widths: a leaf's width = 360; an internal node's width = `max(360, sum of children's subtree widths)`.
5. For each parent, place children left-to-right consuming their own subtree widths; horizontally center the parent over its children's combined extent.
6. Snap final x values to multiples of 20.
7. Redraw each group: recompute its rect via the fit rule around its snapshotted members' new positions. Subtree packing keeps a branch contiguous, so the rect stays clean. If two groups still overlap, push them apart along x — shift the smaller group and all its members — until clear.

Edges and node contents are preserved; only x/y (and group rects) change.

## Self-healing on read

Detect and offer to fix these on every read, before any mutation:

- **Zero focus nodes:** ASK which existing node should be focus.
- **Multiple focus nodes:** ASK which to keep; the others get demoted (default `❓` / color `"3"`).
- **Edge with missing `fromNode` or `toNode`:** report orphan edge; ask to delete or rewire.
- **Cycles:** report cycle path; ask to delete one edge.
- **Duplicate ids:** regenerate ids in place, keeping the rest of the data; report what changed.
- **`\\n` in node text:** replace with `\n`.
- **Group no longer encloses a member (or now captures a stranger):** a node drifted out of, or into, a group rect. Re-fit the rect to its intended members; if intent is ambiguous, ASK.
- **Empty group:** a group encloses zero nodes — offer to delete it.
- **Overlapping groups:** report the overlap; offer to push them apart (shift the smaller group and its members).

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

**Explicit independence overrides inferred relatedness.** If the user calls something a "new topic" or says it's separate / independent / standalone / "can live on its own", attach it to the **root** as a new top-level branch — not to the focus, and not to the related node — *even when the new thing clearly grew out of what you were just discussing.* The agent's sense that "B follows from A" is not a reason to make B a child of A once the user has framed B as independent. Capture the relationship, if it's worth keeping, with a single cross-link edge labeled with the actual relationship (never `new topic` — see [Edge labels](#edge-labels)); the structural parent stays the root. When torn between "child of the related node" and "new top-level branch" and the user used any independence wording, choose top-level.

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
9. Exactly one text node has color `"5"` (groups never use it).
10. No cycles in the edge graph (unless the user explicitly opted in to a cross-link, in which case the edge gets a `label` naming the relationship so it's visually distinct — see [Edge labels](#edge-labels)).
11. Group nodes have a `label` (leading lifecycle emoji + topic) and no `text` / `file` / `url`. Their `color` follows the group lifecycle, not the node taxonomy; they're excluded from rules 3 and 9 (never `"5"`). Groups don't overlap each other.
12. Every group encloses ≥ 1 node (an empty group is a self-heal target below, not a hard write-block).

The [done-down guard](#doneness--propagation) is a **mark-time check, not a write invariant**: a deliberate "do it anyway" override (or a later reopen) can leave a done container holding an open node, and that's legal — `show` surfaces it; the write isn't blocked here.

If a check fails, don't write — explain which invariant would break and ask.

## Reporting style

One line per operation. Examples of the shape:

- `Added "❓ JWT vs session for SSO" under "🎯 Auth rewrite".`
- `Added "❓ End-to-end connectivity" as a new top-level topic (independent of the "Get domain for dev-2" group).`
- `Marked group "Get domain for dev-2" ✅ done and added "🟢 host configured" inside it.`
- `"Get domain for dev-2": 2/3 settled — ❓ "Needs to be tested" still open. Resolve it, move it out, or mark the group done anyway?`
- `Resolving "DNS configured" also settles "Get domain for dev-2" — mark the parent and its group ✅ done?`
- `Added "❓ New regression" into the done group "Auth Server setup" — move it out, or reopen the group?`
- `Refocused 🎯 to "Decide cache layer" (prior focus "API rewrite" marked 🟢 resolved).`
- `Marked "JWT vs session for SSO" 🔴 blocker.`
- `Tidied 14 nodes across 4 depths.`
- `Grouped 5 nodes into "📌 Auth Server setup".`
- `Marked group "Auth Server setup" ✅ done.`
- `Ungrouped "Get domain for dev-2" (9 nodes released).`
- `Working tree → /Users/.../uby_knowledge_vault/work-trees/new-skills.canvas`

Never dump the full canvas JSON in chat. If the user asks "what's in the canvas", use `show`.

## Files written by this skill

- `~/.config/work-tree-canvas/registry.json` — cwd → canvas mapping (machine-local, do not sync between machines)
- `<vault>/work-trees/<repo-basename>.canvas` — the actual canvas, by default

The user can edit either file manually; the skill re-reads them every invocation.

## Attribution

JSON Canvas 1.0 spec used here: <https://jsoncanvas.org/spec/1.0/>. The validation rules and field reference are derived from the [`json-canvas` skill](https://github.com/kepano/obsidian-skills/tree/main/skills/json-canvas) by Steph Ango (kepano), MIT-licensed. See <https://github.com/kepano/obsidian-skills/blob/main/LICENSE>.
