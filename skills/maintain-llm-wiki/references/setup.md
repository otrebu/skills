# Set up the wiki

Use this branch to establish a new wiki or reshape an existing one before ingest, query, or lint.

## 1. Establish the human-agent agreement

Inspect the project and any existing knowledge files. Resolve:

- the read-only source roots, source formats, and snapshot intake process;
- the agent-owned wiki root;
- the intended audience, recurring questions, and analysis priorities;
- existing naming, linking, citation, metadata, and agent-instruction conventions;
- the query-filing policy and the desired level of human review.

Ask the human to select and record an ingest workflow when no preference exists:

- **Interactive:** discuss each source's identity, takeaways, impact plan, uncertainty, and proposed emphasis before changing knowledge pages. Require approval for material schema changes.
- **Batch:** process the approved source set sequentially, checkpoint each source version, and review the integrated result at the end. Pause when a missing choice changes ownership, evidence boundaries, or the knowledge model.

Ask focused follow-up questions until every material choice is resolved. Use reversible defaults for non-material choices and record them. Preserve the human's role in curating sources and directing analysis in either mode.

Complete this step when boundaries, review mode, filing policy, and approval rules are explicit.

## 2. Create or reshape the smallest useful structure

Prefer existing conventions. Use this shape only as a reversible default:

```text
<source roots>/         # human-curated immutable snapshots
wiki/
  AGENTS.md             # governing schema by default
  index.md              # content map
  log.md                # chronological operations
  sources/              # default evidence records
  <domain directories>  # create only for page types the domain needs
```

Keep an existing source collection in place and record its actual roots. Use lowercase kebab-case filenames and relative Markdown links only when the project establishes no other convention. Create concepts, entities, timelines, cases, chapters, syntheses, or other page types only when they fit the domain.

Before reshaping an existing wiki, inventory every page and inbound link. Propose the directory, rename, metadata, and link migrations; obtain human approval for material page-model or write-boundary changes; then migrate and validate without discarding history.

Complete this step when every directory has an immediate use and every moved page remains reachable.

## 3. Write or evolve the schema

Put the schema in `wiki/AGENTS.md` by default so it governs the generated tree. Record:

- exact source and wiki roots, ownership, and authorized snapshot-capture workflow;
- interactive or batch ingest mode, review checkpoints, query-filing policy, and schema-change approval rules;
- the enabled domain page types, directory and merge rules, filenames, links, and required metadata;
- a stable `source_id`, immutable `version_id` (SHA-256 by default), snapshot path, origin and aliases, integration status and page dispositions, and relevant publication, effective, or retrieval dates;
- source-identity rules that treat revisions or editions as versions only when provenance establishes the relationship, and keep related studies or ambiguous documents as separate sources until the human resolves them;
- the evidence-record shape and exact raw locator format for each source type, such as page/figure, section/line, timestamp, or table/row;
- impact-discovery tools, alias handling, and the threshold for full-text or indexed search when `index.md` alone no longer gives credible coverage;
- batch ordering, checkpoint, retry, and source-version supersession rules;
- the representation for contradictions, uncertainty, superseded claims, and open questions.

Use only metadata that operations or domain queries need. Keep source identity, version, snapshot, provenance, locator, integration status, and page dispositions mandatory for evidence records; keep other metadata domain-specific. Refer to the shared `index.md` and `log.md` contract in `SKILL.md` instead of redefining it.

After each operation, compare observed patterns and human corrections with the schema. Propose the smallest useful schema revision when a rule repeatedly fails, the page model no longer fits, or search has crossed its recorded scale threshold. Obtain approval according to the recorded mode and log the decision; do not silently change material governance.

Complete this step when a fresh agent can identify sources, trace evidence, resume work, and run each branch without inventing ownership rules.

## 4. Seed and validate

Create `index.md` and `log.md` according to the shared record contract. Add index sections only for enabled page types and list every real seed page with a one-line description. Avoid placeholder pages and empty directories.

Complete setup when all seed links resolve, the index accounts for the in-scope wiki, the schema captures the human-agent agreement, and the shared terminal log records the setup or reshape decisions.
