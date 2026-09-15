# Replayable automation

Reference for step 5 of the parent skill. Read only when the user asked for
Chrome Recorder or scripted replay, or a demonstrated sequence is stable,
repetitive and worth maintaining. Judgment and recovery stay in the skill;
the automation covers the stable middle.

## Choosing a form

- **Chrome Recorder JSON** when the user wants to import and replay in Chrome
  DevTools. agent-browser has no Recorder export: its `record` command
  produces video. Write the JSON by hand from the observed UI, and check the
  current Recorder schema before generating it.
- **Puppeteer or Playwright script** when parameters, assertions or branching
  justify code.

## Selectors

Ground every selector in observed UI: roles, labels, test ids, stable text.
agent-browser snapshot refs (`@e3`) are assigned per snapshot and mean nothing
outside it, so a script uses its own selectors.

Parameterize inputs. End with an assertion on completion evidence the
application shows, not on the last click succeeding.

## Sharing authentication with agent-browser

A script and agent-browser are separate browsers unless you arrange otherwise.
Two working arrangements:

- **Sequential profile use**: both point at the same `--profile <dir>` and the
  previous owner is closed first.
- **Attach to one browser**: the script connects to the CDP endpoint of the
  agent-browser session (`agent-browser get cdp-url`), bound to localhost.

Verify whichever you choose by reading the logged-in marker from the script.

## Replay safety

A sequence that includes a modifying action is not idempotent. On timeout or
partial failure, the running agent inspects the application state before any
replay. Write this next to the automation's invocation in the generated skill.
