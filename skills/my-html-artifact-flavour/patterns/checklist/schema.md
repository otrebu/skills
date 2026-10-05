# Checklist content schema

One UTF-8 JSON file holds all content; `template.html` holds none. `render.py` validates it and
embeds it with the fonts, the foundation CSS and behaviours, and any PNG screenshots.
`example-content.json` is a complete file that uses every feature.

Text fields accept `**bold**` and inline backticks; HTML is escaped. Procedures are structured
lists, not Markdown lists. "Required" means the renderer refuses content without the field.

## Root object

| Field | Required | Purpose | Example |
|---|---|---|---|
| title | Yes | Visible `h1` and the results heading | `"Move the static site to the new host"` |
| outcomes | Yes | Ordered array of areas, defined below | `[{"key":"Area A","…":"…"}]` |
| pageTitle | No | Browser `<title>` of two to four words; defaults to title | `"Static site move"` |
| eyebrow | No | Small label above the title | `"Example runbook"` |
| intro | No | One or two sentences under the title | `"Copy the site, then switch its name."` |
| before | No | Prerequisites, each with a bold lead-in; hidden when empty | `["**Use a terminal.** It needs ssh."]` |
| riskLegend | No | Legend text for `high`, `med`, `low`; defaults are generic | `{"high":"a mistake takes the site offline"}` |
| indexNote | No | Count and duration above the index | `"6 checks · 20 minutes"` |
| baseUrl | No | HTTPS origin for check links; needed when a check has `route` | `"https://example.invalid"` |
| date, product, env | No | Separate saved walks in the storage key | `"2026-10-05"` |
| storageVersion | No | Saved-state discriminator; change it to drop old saved results | `"example-1"` |
| detailsNote | No | One line at the top of Walk details | `"Old host: a · New host: b"` |
| walkNotes | No | Procedure items at the top of Walk details | `[{"lead":"Record the ticket.","text":"Enter it below."}]` |
| placeholders | No | Walk inputs; `hint` is the input placeholder | `[{"key":"ticket","label":"Change ticket","hint":"CHANGE-12"}]` |
| requiredFields | No | Placeholder keys needed for a green verdict | `["ticket"]` |
| missingFieldsVerdict | No | Verdict when a required field is empty | `"no verdict (enter the ticket)"` |
| successVerdict | No | Green verdict text | `"green for this runbook"` |
| files | No | Downloadable text fixtures; `<key>` takes a walk value | `[{"name":"rows.csv","content":"id\n<ticket>\n"}]` |
| helpers | No | Shared copy boxes in their own panel | `[{"label":"Show the host","code":"dig +short www.example.org"}]` |
| helperTitle, helperIntro, helperReminder | No | Panel title (default `Commands`), intro and a bold reminder | `"Shared commands"` |
| noteLabel | No | Label before each area note; default `About this area` | `"What changed"` |
| carried | No | Check ID → reason for an earlier pass; the check becomes an optional repeat | `{"A2":"Passed on 1 October"}` |
| out, displayOut | No | Evidence limits: full text for results, short text for the page | `["This walk does not test email."]` |
| screenshots | No | Key → screenshot object, defined below | `{"home":{"…":"…"}}` |

## Area (`outcomes[]`)

| Field | Required | Purpose | Example |
|---|---|---|---|
| key | Yes | Short ID in results and under the area note | `"Area B"` |
| heading | Yes | Area title | `"Copy and switch"` |
| risk | Yes | `high`, `med` or `low` | `"high"` |
| steps | Yes | Nonempty array of checks | `[{"n":"B1","…":"…"}]` |
| shortTitle | No | Index title; defaults to heading | `"Copy and switch"` |
| hook | No | One-line reason in the index | `"Copy the files, then switch the name."` |
| note | No | Short description at the top of the area | `"Both checks change something."` |
| setupPoints | No | Procedure items under Setup and put back | `[{"lead":"Check area A.","text":"Do A1 and A2 first."}]` |
| setupWarnings | No | Warnings before setup | `["Use the deploy account."]` |
| diagrams | No | At most one diagram on the page | `[{"title":"Move order","boxes":[["Copy"],["Switch"]],"caption":"…"}]` |

## Check (`outcomes[].steps[]`)

| Field | Required | Purpose | Example |
|---|---|---|---|
| n | Yes | Unique ID: letters, digits and hyphens | `"B2"` |
| displayAction | Yes | Do line; starts with a bold lead-in | `"**Switch the name.** Point it at the new host."` |
| displayMust | Yes | Check line: what proves success | `"The command prints 198.51.100.20."` |
| route | No | Path after baseUrl; adds a Link button | `"/dns/www"` |
| detail | No | More fields, defined below | `{"how":[…],"cleanup":[…]}` |
| changes | No | `true` for the tag "Changes something", or a short label | `"Changes DNS"` |
| later | No | When the check can run instead; adds a Later result and tag | `"on the next certificate renewal"` |
| optional | No | Not required for progress or the verdict | `true` |
| must | No | Full expected result for Fails in results; defaults to displayMust | `"rsync ends with no error."` |
| screenshot | No | Key in `screenshots` | `"home"` |
| coverage, displayCoverage | No | Earlier evidence for this check | `"Passed on 1 October"` |

`detail` fields appear in More in this order; omit the ones that do not apply. Text fields need
at least 20 characters.

| Field | Purpose |
|---|---|
| data | Accounts, records and exact values |
| how | Procedure items to do the check |
| expect | What a pass looks like |
| failure | What a fail or a blocked check looks like |
| why | What the check proves |
| cleanup | Procedure items that put things back; their commands show as undo boxes |
| warnings | Warnings shown before `how` |

## Procedure item

Used by `walkNotes`, `setupPoints`, `detail.how`, `detail.cleanup` and nested `steps`. Top-level
items are numbered; children are lettered.

| Field | Required | Purpose | Example |
|---|---|---|---|
| lead | Yes | Short bold purpose label | `"Change the record."` |
| text | One of text, command, steps | One instruction | `"Select **Link**."` |
| command | One of text, command, steps | Literal command shown in a copy box under the item | `"dig +short www.example.org"` |
| steps | One of text, command, steps | Child items for multiple actions | `[{"lead":"Read the title.","text":"…"}]` |
| commandLabel | No | Copy box label; defaults to `Command`, or `Undo command` in cleanup | `"Rollback"` |

Put each command in `command`, not in backticks inside `text`: the box keeps line breaks,
copies the exact string, and the language checks skip it. Keep inline backticks for short
values such as a path or an output.

## Screenshot (`screenshots.<key>`)

| Field | Required | Purpose |
|---|---|---|
| source | Yes | Where the image came from |
| date | Yes | Capture date, `YYYY-MM-DD` |
| caption | Yes | What the image proves, and any difference from the check |
| alt | Yes | Accessible description |
| path or data | Yes | PNG path relative to the content file, or a PNG data URI |

Each image is embedded once and can support several checks. A reference image never marks a
check passed.

## Diagram (`outcomes[].diagrams[]`)

| Field | Required | Purpose |
|---|---|---|
| title | Yes | Visible title and accessible name |
| boxes | Yes | Ordered boxes; each box is an array of text lines |
| caption | Yes | What the sequence shows |
| accent | No | Zero-based index of the emphasized box |

## Results and verdict

Each check records Works, Broken, Can't test, or Later (only where `later` is set). The verdict
is `not green` after any Broken; `no verdict` while a required check is unmarked, blocked, or a
required field is empty; otherwise the success verdict. Later never blocks it: the verdict names
the deferred checks, and Copy results lists them under `## Later`.

## Extending the pattern

A layer passes a script to `render.build(…, extension=…)`. The script appends a function to
`window.checklistExtensions`; the function receives `{G, steps, state, rules, result, final,
flat, cell, stamp, F}` and may replace any entry of `rules` (storage key, optional, carried,
accepted, tags, legend and labels, verdict, markdown, exposeAs). The layer validates its own
fields before `render.validate` runs, and its verifier imports `verify.mjs` and calls
`verifyChecklist` before adding its own checks.
