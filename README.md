# skills

My agent skills, distributable via [`npx skills`](https://github.com/vercel-labs/skills).

Each subfolder is one skill — a `SKILL.md` with YAML frontmatter and a markdown body. Once installed, the skill lives in `~/.agents/skills/<name>/`, the canonical pool that Claude Code, Codex, Cursor, and 50+ other agents read from.

## Skills

| Skill | What it does |
|---|---|
| [`structured-replies`](./structured-replies) | Shapes every reply: simple questions get a terse direct answer; complex ones get headlines + an optional ASCII visual + brief detail sections. |
| [`theory-vs-reality`](./theory-vs-reality) | Audits a plan vs the built code by producing an interactive HTML checklist with per-item verdicts pre-filled by parallel subagents. |
| [`tmp-snapshot`](./tmp-snapshot) | Saves slices of the current conversation to `/tmp/<name>.md` and returns the path plus an outline of every header. |

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

Run from a clone of this repo:

```bash
npx -y skills add ./<skill-name> -g -a '*' -y
```

Example:

```bash
npx -y skills add ./theory-vs-reality -g -a '*' -y
```

## Add a new skill

1. Create `./<skill-name>/SKILL.md`:
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
