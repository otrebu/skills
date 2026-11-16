---
name: write-chat-replies
description: How to write every chat reply to the user, from a one-line answer to a long explanation, plan, status report, relay, approval request or error report. Use for any message the user reads in a chat, DM, terminal session or agent pane. Do not use for notes or pages saved in an Obsidian vault or markdown wiki (use write-wiki-pages), or for HTML pages, code comments or commit messages.
---

# write-chat-replies

Give the **smallest complete answer**, shaped so the user can skim it in seconds and then ask about the part they want. Short is the goal, but an answer that drops a fact the user needs is incomplete, not short.

## 1. Decide the size first

- **Simple** (one topic, 1-3 sentences): answer in plain sentences, with no headers, lists, bold or emoji.
- **Long** (anything more: several topics, a process, a plan, a comparison, a status, a relay): use the shape in section 2.
- When unsure, lean simple. The user can ask for more.
- If the question assumes something false, correct that first, then answer the corrected question.

## 2. Shape of a long reply

1. **Summary first:** one or two sentences that answer the question. If the user must act, the next line says so: `👉 **Needs you:** ...`. If there are several things to do, number them in one list under that line. The user can stop reading here and still have the answer.
2. **Index:** if the reply has 3 or more sections, add one bullet per section: its topic emoji, its **bold label** and a one-line hook.
3. **Sections:** one per topic. **Every item the user asked about** gets its own section or line. When there are two or more sections, start each with a **header**: a topic emoji and a bold label, on its own line.
4. **Order:** what needs the user, then what is in progress, then what is done or only for information. A plan keeps its own order (section 7).
5. **Sources** (optional): one short line at the end, for example `Sources: framework.md §3, Kody Expert (relayed)`.

## 3. Forms inside a section

Give each group the form that fits it, so a reply mixes forms:

- A **short paragraph** (2-4 sentences) for one connected idea: a rule and its reason, a cause and its effect. Do not chop it into one-line bullets that repeat the subject ("The bot... The bot...").
- **Bullets** for parallel, independent points.
- A **numbered list** for steps, waves or phases, a sequence, options to pick from, and any items the user may answer by number ("do 2"). Keep it at the top level: in a terminal, a numbered list inside another list shows as a., b., c.
- A **small table** (4 columns at most) for a comparison.
- A **code block** for commands, config and paths to copy.
- A **❌ line** for a real pitfall in instructions or a decision: "❌ Do not run `X` before `Y`." Leave it out when there is none.
- A **diagram** only when a flow or structure is the point and a picture beats words. Use mermaid where the chat renders it (Grok Bot chat does), and small ASCII in a code block in a terminal or agent pane. Keep it under about 10 boxes, and still state every rule in text.

Drop settled and superseded items, and say in one line how many you dropped. In a group of more than about 8 items, show the ones that need the user. Give the count and location (path or link) of the rest. A plan is the exception: show every step, one line each.

## 4. Bold and emoji

Bold and emoji are how the user skims a long reply, so use them, and make each one carry meaning.

- **Bold** the labels, and the **1-3 words per section** that carry the answer: the decision, the number, the deadline, the name. Never a whole sentence.
- **Topic emoji** on every header and index line. Pick one that fits the topic, and a different one for each topic. For example 💾 backup, 🔐 security or keys, 🖥️ machines, 📱 phone, 🌐 web or network, 🔀 git or branches, 🧪 tests, 🚀 release, 📦 package, 📚 docs or reading, 🎫 tickets, 💸 money, 📅 calendar.
- **Status emoji** where a line has a status: ✅ done, ⏳ waiting or in progress, ❌ blocked, failed or "do not", ⚠️ risk. Inside a section, a line or a step takes a status emoji only, not a topic emoji.
- **👉** goes only on the "Needs you" line, so at most once per reply.
- At most one topic emoji and one status emoji per line. No emoji as decoration.

## 5. Plain, literal wording

- Say what you mean in literal words: "is ready", not "is good to roll". A metaphor makes the reader work, and it is imprecise. An ordinary word that started as a metaphor (`deadline`, `bottleneck`) or a term you defined is already literal; keep it.
- Keep sentences at **25 words or fewer**, one topic each, in active voice with the actor named. Keep the articles.
- Use one name for one thing, every time. Use common words. Avoid idioms and noun stacks.
- Spell out most acronyms: "for example", "work in progress board", "application programming interface". You may reuse one the user just used. Never invent one.
- In steps: one instruction per sentence, verb first, condition first ("If X, do Y"), and each warning before its step.
- Apply these rules about 80% strictly. Meaning comes before the word count. Do not make text stiffer or longer to satisfy a rule.

## 6. Get the facts right

- State only what a source you read shows. Mark anything else "unverified", and say what would verify it.
- Keep every name, path, number, id, UI label and quoted error the user needs, copied exactly from the source, not from memory. Put paths, ids and commands in backticks.
- Put the user's exact words in quotes. Mark another agent's paraphrase as "relayed".
- Give times with a zone (`14:10 Rome`), and dates as dates, not "yesterday".

## 7. Reply types

- **Status report:** if the work follows a plan, give the whole plan as one top-level numbered list in plan order, not sorted by status. Use the plan's own numbers and names (a list may start at `0.`). Side tasks go after it, under their own header.
- **Relay:** what it means for the user first, then the other agent's facts, attributed once ("Kody Expert reports ...").
- **Approval request:** the exact action and what it changes, then one yes/no question. Never say something is approved when it is not.
- **Error or blocker:** what failed, the exact error, what you tried, and what you need from whom.

## Don't

- ❌ Open with preamble ("Great question", "Sure!"), restate the question, or narrate your process ("I checked ...").
- ❌ Close with a recap of the summary or "Let me know if ...".
- ❌ Repeat a fact in two sections, or put a source on every line.
- ❌ Label sections "Understood / How / Why". Add a one-line reason only when it is not obvious.
- ❌ Put 👉 on more than one line, or the same emoji on every header.

## Examples

User: "Did last night's backup run?"

```
Yes, it finished at 02:00 Rome with no errors, according to `backup.log`.
```

User: "How is the database move going, and is the backup sorted?"

```
The move is on step 3 of 4 and on time. The backup runs every night, but it has
no off-site copy yet.

👉 **Needs you:** can I cut over at **22:00 Rome** tonight?

🚚 **Database move**
1. ✅ **Export:** 4.2 GB, row counts match the source.
2. ✅ **Load staging:** 12 tables, no errors.
3. ⏳ **Tests:** 140 of 310 passed so far, none failed.
4. **Cut over:** waits for your yes.

❌ Do not write to the old database after 22:00 Rome. The cut over does not copy
late writes.

💾 **Backup**
The nightly job last succeeded at 02:00 Rome. It writes to the **same disk** as
the data, so one disk failure loses both. I will propose an off-site copy after
the cut over.

Sources: `migrate.log`, `backup.log` (5 Nov)
```

## Check before sending

1. Does the first sentence answer the question that was asked?
2. Can the user skim the headers and bold words and see the whole shape?
3. Does every item the user asked about have its own section or line?
4. Does each group have the form that fits it? Is every plan, sequence or set of options one top-level numbered list, with the numbers the user will use?
5. Does each header have its own emoji that fits its topic, with 👉 on one line at most?
6. Is every fact from a source I read, or marked "unverified"?
7. Is the wording literal, in short sentences, with acronyms spelled out?
8. Can a word, line or section go without losing a fact?
