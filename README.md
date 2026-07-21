# skills

My agent skills, distributable via [`npx skills`](https://github.com/vercel-labs/skills).

Each subfolder is one skill — a `SKILL.md` with YAML frontmatter and a markdown body. Once installed, the skill lives in `~/.agents/skills/<name>/`, the canonical pool that Claude Code, Codex, Cursor, and 50+ other agents read from.

## Skills

| Skill | What it does |
|---|---|
| [`concise-replies`](./skills/concise-replies) | Shapes every reply to be the smallest complete answer: right-size to the question, gate a leading index behind ~4+ sections, draw an ASCII diagram only when flow/order/architecture beats words, and correct false premises first. A tournament-tuned variant of `structured-replies` — enable one at a time. |
| [`fable-herdr-orchestration`](./skills/fable-herdr-orchestration) | Uses a Fable control-tower session to route and supervise Codex GPT-5.6 and Fable workers in Herdr panes, escalating from xhigh to max for the hardest work. |
| [`fable-orchestration`](./skills/fable-orchestration) | Lets Fable 5, xhigh choose how to combine ultracode with Fable, Opus, and Sonnet subagents, escalating to max only when needed. |
| [`handoff-that-to-agent-pane`](./skills/handoff-that-to-agent-pane) | Hands off a bounded task to Codex, Claude, Cursor Agent, or pi in a right-hand Herdr pane using a focused conversation snapshot. |
| [`publish-artifacts`](./skills/publish-artifacts) | Publishes a local HTML artifact tree to `ubuilt.dev` (Cloudflare R2 + Worker), mapping folders to URL paths, with per-folder access — public, or gated to named collaborators by email one-time-PIN. Additive and multi-machine safe. |
| [`structured-replies`](./skills/structured-replies) | Shapes every reply: simple questions get a terse direct answer; complex ones get headlines + an optional ASCII visual + brief detail sections. (See also `concise-replies`, a tournament-tuned variant.) |
| [`theory-vs-reality`](./skills/theory-vs-reality) | Audits a plan vs the built code by producing an interactive HTML checklist with per-item verdicts pre-filled by parallel subagents. |
| [`tmp-snapshot`](./skills/tmp-snapshot) | Saves slices of the current conversation to `/tmp/<name>.md` and returns the path plus an outline of every header. |
| [`topic-to-issue`](./skills/topic-to-issue) | Investigates a topic against the codebase, docs, and web; opens a lean GitHub issue via `gh` only when the work leaves a concrete deferred action. |
| [`walkthrough`](./skills/walkthrough) | Presents a list — findings, tasks, options, or a file of items — one at a time for focused interactive review, with `next / back / discuss / edit / skip / goto / find / list / done` controls and a running progress header. |
| [`work-tree-canvas`](./skills/work-tree-canvas) | Maintains a persistent Obsidian Canvas of your work tree across sessions — adds nodes for new branches, tracks the current 🎯 focus, keeps the layout tidy. |

## Install from GitHub

Install everything in this repo into `~/.agents/skills/` for every detected agent:

```bash
npx -y skills add otrebu/skills -g -a '*' -y
```

Install just one skill:

```bash
npx -y skills add otrebu/skills --skill theory-vs-reality -g -a '*' -y
```

Preview what's available without installing:

```bash
npx -y skills add otrebu/skills --list
```

Flags:
- `-g` — install globally (user-level, not project)
- `-a '*'` — install to every detected agent
- `--skill <name>` — pick a single skill out of the repo
- `-y` — skip confirmation prompts

## Install locally (when iterating on a skill)

Run from a clone of this repo.

Install **all** skills (pass the repo root — `skills add` takes one source, so `./skills/*` only installs the first folder):

```bash
npx -y skills add . -g -a '*' -y
```

Install **one** skill:

```bash
npx -y skills add ./skills/<skill-name> -g -a '*' -y
```

Example:

```bash
npx -y skills add ./skills/theory-vs-reality -g -a '*' -y
```

PromptScript does not support global (`-g`) installs; you may see a failure line for it even when the other agents succeed.

## Add a new skill

1. Create `./skills/<skill-name>/SKILL.md`:
   ```markdown
   ---
   name: <skill-name>
   description: One-line hook agents use to decide when to invoke this skill.
   ---

   # Instructions for the agent
   ```
2. Run the install command above.

## Remove a skill

```bash
npx -y skills remove <skill-name> -g -y
```

## License

[MIT](./LICENSE)
