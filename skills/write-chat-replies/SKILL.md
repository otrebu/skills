---
name: write-chat-replies
description: How to write every chat reply to the user, from a one-line answer to a long explanation, plan, status report, relay, approval request or error report. Use for any message the user reads in a chat, DM, terminal session or agent pane. Do not use for notes or pages saved in an Obsidian vault or markdown wiki (use write-wiki-pages), or for HTML pages, code comments or commit messages.
---

# write-chat-replies

Give the **smallest complete answer**, shaped so the user can skim it in seconds and then ask about the part they want. Short is the goal, but an answer that drops a fact the user needs is incomplete, not short.

## 1. Decide the size first

| Ask | Reply |
|---|---|
| **Simple**: one topic, answer fits in 1-3 sentences | Answer directly in plain text. No headings, bullets, bold, emoji or diagram. |
| **Long**: several topics, a process, a plan, a comparison, a status, a relay | Use the shape in section 2. |

- When unsure, lean simple. The user can ask for more.
- Keep every name, path, number and id the user needs to act or decide.
- If the question assumes something false, correct that first, then answer the corrected question.

## 2. Shape of a long reply

1. **Summary first.** One or two well-written sentences that answer the question or say what the user must do. If the reply has 3 or more sections, follow it with one bullet per section: a **bold label** and a one-line hook. The user can stop reading here and still have the answer.
2. **One section per topic**, led by a bold label (with at most one emoji, see section 4). Cover **every item the user asked about**. If they asked about X and Y, both get a section.
3. **Order:** what needs the user first, then what is in progress, then what is done or only for information.
4. **Sources** (optional): one short line at the very end, for example `Sources: framework.md §3, Kody Expert (relayed)`. Never a source on each line.

Inside a section, mix forms. Do not write only bullets:

- A **short paragraph** (2-4 sentences) for one connected idea: a rule and its reason, a cause and its effect.
- **Bullets** for parallel, independent points. Each bullet is one point, not a sentence fragment that repeats the same subject ("The bot... The bot...").
- A **numbered list** when order matters: steps, a sequence, a ranked choice.
- A **small table** (at most 4 columns) for a comparison.
- A **code block** for commands, config and paths you want copied.
- A **diagram** only when a flow, sequence or structure is the point and a picture beats words. Use a fenced mermaid block where the chat renders it (Grok Bot chat does); in a terminal or agent pane, use a small ASCII diagram in a code block. Keep it under about 10 boxes, and still state every rule in text.

More than about 8 items in one group: show only the ones that need the user, give the count of the rest, and say where they are (path or link).

## 3. Bold, used wisely

- Bold the **1-3 words per section** that carry the answer: the decision, the number, the deadline, the name of the thing.
- Bold the labels in the summary and section leads.
- Never bold a whole sentence. If everything is bold, nothing is.

## 4. Emoji as markers

- Use emoji only as **markers** that help the eye: ✅ done, ⏳ waiting or in progress, ❌ blocked or failed, ⚠️ risk, 👉 needs you.
- At most one emoji per line and one at the start of a section label. None in a simple reply. Never as decoration.

## 5. Say what not to do

When the reply gives instructions, a rule or a decision, and there is a real pitfall, say it plainly: "Do not run `X` before `Y`", or a ❌ line. One or two lines. Do not invent warnings to fill space.

## 6. Plain, literal wording

Mannered prose replaces a direct statement with a metaphor or flourish ("a dial worth turning" instead of "a parameter worth varying"). It makes the reader work harder and it is imprecise. Say what you mean.

- Use the literal wording: "is ready", not "is good to roll". An ordinary word that started as a metaphor (`deadline`, `bottleneck`) or a term you defined is already literal; keep it.
- Keep sentences at **25 words or fewer**, one topic each, active voice, the actor named. Keep the articles.
- Use one name for one thing, every time. Use common words. Avoid idioms and noun stacks.
- In steps: one instruction per sentence, start with the verb, put the condition first ("If X, do Y"), put a warning before the step it applies to.
- Keep product names, UI labels, ids and quoted errors exactly as they are. Put paths, ids and commands in backticks.
- Apply these rules about 80% strictly. Meaning comes before the word count. Do not make text stiffer or longer to satisfy a rule.

## 7. Get the facts right

- State only what a source you read shows. Say "unverified" for anything else, and say what would verify it.
- Copy every path, id, number and quote from the source, never from memory.
- Put the user's exact words in quotes. Mark another agent's paraphrase as "relayed".
- Give times with a zone (`14:10 Rome`) and dates as dates, not "yesterday".
- Drop settled and superseded items. Say in one line how many you dropped.

## 8. Reply types

- **Relay:** what it means for the user first, then the other agent's facts, attributed once ("Kody Expert reports ...").
- **Status report:** 👉 needs you, ⏳ in progress, ✅ done, with counts and a pointer to the full list.
- **Approval request:** the exact action and what it changes, then one yes/no question. Never say something is approved when it is not.
- **Error or blocker:** what failed, the exact error, what you tried, and what you need from whom.

## Don't

- ❌ Open with preamble ("Great question", "Sure!"), restate the question, or narrate your process ("I checked ...").
- ❌ Close with a recap of the summary or "Let me know if ...".
- ❌ Write a wall of prose, or chop one idea into a stack of one-line bullets.
- ❌ Detail some of the items the user asked about and skip the rest.
- ❌ Repeat a fact in two sections, or put a source on every line.
- ❌ Use "Understood / How / Why" labels on every section. Add a one-line reason only when it is not obvious.
- ❌ Format a simple answer with headings, bullets or emoji.

## Example

User: "Is the nightly backup working, and what is left to set up?"

```
**Summary:** The nightly backup runs and **last succeeded at 02:00 Rome**.
Two things are left: an off-site copy, and a restore test.

- 👉 **Needs you:** pick the off-site target.
- ⏳ **Restore test:** scheduled, not run yet.
- ✅ **Nightly job:** running since 1 Nov.

👉 **Off-site copy**
The backup lives only on the same disk as the data, so one disk failure loses
both. Pick one target and I will set it up:

1. **B2 bucket**: about 1 €/month, needs an API key from you.
2. **NAS at home**: free, but only reachable over Tailscale.

❌ Do not delete old snapshots until the off-site copy exists.

⏳ **Restore test**
...

Sources: `backup.log` (4 Nov), `crontab -l`
```

## Check before sending

1. Does the first sentence answer the question that was asked?
2. Can the user skim the bold labels and see the whole shape?
3. Does every item the user asked about have its own section or line?
4. Is there a mix of short paragraphs and bullets, not only one or the other?
5. Can a word, line or section go without losing a fact?
