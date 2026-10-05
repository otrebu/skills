# Foundation reference

Tokens, type, spacing and component markup for hand-written flavour pages. `flavour.css` is the
single source of truth; this file explains how to use it. `example-body.html` shows every
component on one page; `page.py` turns it into `example.html`.

## Colour tokens

Use role tokens only. Each pair below reaches 4.5:1 in Light and Dark; `page.py` and the
checklist verifier report the ratios.

| Token | Role |
|---|---|
| `--bg` | Page background; also text on `--accent` (primary button) |
| `--surface` | Inputs, copy boxes, dialogs, thumbnails |
| `--text` | Body text and headings |
| `--muted` | Secondary text: intros, hooks, captions, instructions after a lead-in |
| `--line` | Borders and row separators |
| `--accent` | Links, numbers, markers, disclosure titles, the primary action |
| `--soft` | Hover, selected and highlighted backgrounds |
| `--risk-high` / `--risk-high-bg` | High risk chip, warnings, Broken |
| `--risk-med` / `--risk-med-bg` | Med risk chip, Changes tag, Can't test, undo copy boxes |
| `--risk-low` / `--risk-low-bg` | Low risk chip, Works |
| `--focus` | Focus outline |

A new colour is a new token with a value in `:root`, in `:root[data-theme="dark"]`, and in the
`prefers-color-scheme: dark` block; add its text/background pair to `CONTRAST_PAIRS` in
`flavour.py` and to the verifier's pair list.

## Type and spacing

- IBM Plex Sans for body (16px / 1.65), IBM Plex Serif 400 for the one `h1`, IBM Plex Mono for
  code, IDs, counts and figures. Weights 400 and 600 only; `font-synthesis:none` blocks fake bold.
- Measure: `.wrap` is at most 52rem; prose blocks stay near 69ch.
- Rhythm: 44px above the header, 24–30px between sections, 12–20px between list items,
  8px between buttons. Small labels are uppercase with letter spacing (`.eyebrow`, `.section-label`).
- Phone width (600px and below): 16px side gutter, the top bar wraps, grids become one column.

## Components

**Top bar** (`page.py` adds it): `.bar > .wrap` with `.bar-title` or `.progress`, the theme
switch, then page actions. One action may be `.primary`.

```html
<label class="theme-control">Theme <select id="theme" aria-label="Theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
```

**Header**

```html
<section class="overview"><p class="eyebrow">Weekly report</p><h1>Build health</h1><p class="intro">One sentence on what this page shows.</p></section>
```

**Disclosures**: every `details[data-persist]` gets the 225 ms animation and joins Expand all /
Collapse all. They start closed; add `data-open` to start one open.

```html
<details class="tools" data-persist><summary>Panel title</summary><div class="tool-body">…</div></details>
<details class="nested" data-persist><summary>Inline title</summary><div class="nested-content">…</div></details>
```

**Chips and tags**: `.chip.chip-high|chip-med|chip-low|chip-accent` for short uppercase status;
`.tag` for a muted label.

**Callouts**: `.callout` for context, `.callout.callout-warning` for a risk. Put a warning before
the step it affects.

**Copy box**: literal commands or text. The box grows with its content and scrolls after about
twenty lines. `data-copy` sets the label; `data-kind="undo"` marks a reversal.

```html
<pre data-copy="Command">git status --short</pre>
<pre data-copy="Undo command" data-kind="undo">git checkout -- .</pre>
```

**Tables**: wrap in `.table-wrap` so only the table scrolls at phone width. Use `.num` for figures.

```html
<div class="table-wrap"><table class="table"><thead><tr><th>Job</th><th class="num">Minutes</th></tr></thead><tbody><tr><td>Build</td><td class="num">4.2</td></tr></tbody></table></div>
```

**Procedures**: numbered steps with a bold lead-in; multiple actions become lettered substeps.

```html
<ol class="procedure-list">
 <li class="procedure-item"><strong class="lead">Open the page.</strong><span class="instruction"> Select <strong>Settings</strong>.</span></li>
 <li class="procedure-item"><strong class="lead">Change two values.</strong>
  <ol class="procedure-list substeps" type="a"><li class="procedure-item"><strong class="lead">Set the name.</strong><span class="instruction"> Enter the new name.</span></li></ol></li>
</ol>
```

**Figures**: at most one diagram per page, drawn with the `.flow` SVG classes so strokes and
fills follow the theme; give it `<title>` and `<desc>`. Images are PNG data URIs with alt text
and a `figcaption` that says what the image proves.

## Behaviours

- Theme: System follows the OS; Light and Dark override it. The choice is saved under
  `<storage prefix>:theme` when storage works; the head script restores it before first paint.
- Motion: `prefers-reduced-motion` makes disclosures, jumps and highlights instant.
- Offline: the CSP blocks every network load (`connect-src 'none'`, `font-src data:`,
  `img-src data:`). Links open only when a person follows them.
- Accessibility: one `h1`, real buttons for actions, `aria-label` on icon-only controls,
  `:focus-visible` outline in `--focus`, 38–42px touch targets, status text in `role="status"`.
