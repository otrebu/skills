---
name: write-wiki-pages
description: How to write a page or note saved in an Obsidian vault or an LLM-maintained markdown wiki (Karpathy-style second brain), such as a wiki page, how-to, reference, decision note, log page or hardware page. Use whenever you create or rewrite such a page. Do not use for chat replies, even when the reply talks about the vault (use write-chat-replies), or for the ingest, index and log workflow of a wiki (use maintain-llm-wiki for that, and this skill for the page text).
---

# write-wiki-pages

A wiki page is read days or weeks later, by the user and by other agents, often after a search lands on it. It must say what it is in the first lines, be short, be true, and link to the pages it depends on instead of copying them.

If the vault has its own schema or agent instructions (for example `AGENTS.md`), follow them where they differ from this skill, with one exception: sources always go at the end in `## Sources`, even when the schema (or `maintain-llm-wiki`) asks for inline evidence on each claim.

## 1. Shape

```
---              frontmatter: copy the fields of a sibling page
# Title          names the subject
Opening          2-3 sentences, no heading: what it is + the key rule
## Sections      one topic each, in the order a reader needs them
## Don't         when the page sets rules (optional)
## Sources       [[wikilinks]] to source notes, one per line
```

1. **Frontmatter:** copy the fields that a sibling page in the same folder uses (for example `title`, `type`, `updated`). Never guess a value. If no source gives it, leave the field out.
2. **Title** (`# ...`) that names the subject in plain words.
3. **Opening paragraph**, right under the title, with no heading. It is the page's summary: say **what the thing is** and **the one rule or fact a reader most needs**, in 2-3 well-written sentences. Do not write "This note tells a bot how to ...", and do not pack dates and attributions into it.
4. **Sections** with `##` headings, one topic each. Cover **every item** the page names: if it lists eight checks, each check gets an explanation (one line each in a list or table, or its own short section). Never explain some and leave the rest as bare names. If the source gives no detail for an item, keep its row and say "not specified in the source". A table works well for this.
5. **Don't** (`## Don't`): on a how-to, rule or decision page, list what the reader must not do, one line each. Leave it out on a page that sets no rules.
6. **Sources** (`## Sources`) at the end, one per line, as `[[wikilinks]]` to the source notes, with the section when it helps (`[[framework]] §3`). Write a file outside the vault as a backticked path. Do not cite on each line. Cite inline only for an exact quote.

Decision pages: the decision and how it works first, then `## What it replaced` with each superseded rule and its date. A superseded rule appears only there.

## 2. Keep it short

- Aim for **150-350 words** below the frontmatter. Go over only when every line is needed.
- If a page grows past about 400 words or covers two subjects, split it into two pages that link each other. One page, one subject.
- Each fact has **one home**. Link the page that owns it with a `[[wikilink]]` instead of copying it. Link the first mention of any page, agent or concept that has its own page.
- If a section restates rules that another page owns (for example the backup rules on a page about the server), cut it to one line and a link: "The server is backed up nightly, see [[nightly_backup]]."
- Give provenance once, in Sources. Keep a date or an attribution in the text only when the reader needs it to act (for example, which rule is newer).

## 3. Paragraphs, bullets, numbers

Each section mixes forms. Do not write only bullets:

- A **short paragraph** (2-4 sentences) for one connected idea: a rule and its reason, a cause and its effect.
- **Bullets** for parallel, independent items. Do not chop a paragraph into one-sentence bullets that repeat the same subject ("The bot... The bot...").
- A **numbered list** for steps, a sequence or a ranked order.
- A **table** for a comparison or for items that share the same fields.

## 4. Diagrams, bold and emoji

- When a flow, a sequence or a set of states is the point, add one small **mermaid** diagram (flowchart or sequence, about 10 nodes at most) in the section it explains. The text still states every rule.
- Bold the **1-3 key words** per section: the term, the number, the deadline, the owner. Never a whole sentence.
- Use emoji only as markers in status lists and open items: ✅ done, ⏳ open, ❌ blocked, ⚠️ risk. At most one per line. Never as decoration.

## 5. Plain, literal wording

- Use the literal wording, not a metaphor, idiom or flourish.
- Keep sentences at **25 words or fewer**, one topic each, active voice, the actor named.
- In steps: one instruction per sentence, start with the verb, put the condition first, put a warning before the step it applies to.
- Use one name for one thing, every time. Use display names in text, and `snake_case` only in file names, paths and ids.
- Keep product names, ids and quoted errors exactly as they are. Put paths, ids and commands in backticks.
- Write in English unless the vault folder or the user asks for another language.

## 6. Get the facts right

- State only what a source you read shows. Mark anything else "unverified" and say what would verify it.
- Copy every path, id, number and quote from the source, never from memory.
- Put the user's exact words in quotes. Mark another agent's paraphrase as "relayed".
- Write absolute dates and times with a zone (`3 Nov 2026, 22:30 Jersey`).

## 7. File names

- Name files in lowercase with underscores: `weekly_board_check.md`, not `Weekly Board Check.md` or `weekly-board-check.md`.
- Put the page in the folder its siblings use. Do not create a new folder for one page.

## Don't

- ❌ Open with "Overview" or "Introduction", or with a sentence about the note itself.
- ❌ Write chat phrasing ("I'll", "let me know", "great call"), process narration or a closing summary.
- ❌ Copy the content of another page instead of linking it.
- ❌ Add frontmatter fields, owners or rules that no source gives.
- ❌ Repeat a fact in two sections, or put a source on every line.
- ❌ Go past about 400 words instead of splitting the page.

## Example opening

Weak:

> This note explains the backup setup for bots. Uby asked for it on 3 Nov 2026, 13:52 Rome, in a chat with another bot.

Better:

> The **nightly backup** copies the vault and the bot configs to a second disk at 02:00 every night. A bot checks `backup.log` before it changes either, and never deletes a snapshot by hand.

## Check before saving

1. Do the title and opening tell a reader what this is and the key rule, in under 15 seconds?
2. Does every item the page names have its explanation?
3. Is the body under about 350 words, with a mix of paragraphs and bullets?
4. Are the sources at the end as `[[wikilinks]]`, and is every fact sourced?
5. Is any fact repeated, stale, guessed or copied from another page?
