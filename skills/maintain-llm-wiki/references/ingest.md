# Ingest sources

Compile each approved immutable source version into the existing wiki. Follow the schema's interactive or batch workflow and process batches sequentially so every later source sees earlier integration.

## 1. Identify and de-duplicate each source

Resolve the exact source set before reading outside it. Treat embedded assets needed to understand a snapshot as part of that source. Treat external links as candidate sources only; do not use their claims as evidence or interpretive context until the human adds them to the source set.

For each source:

1. Require an immutable local snapshot. For a URL or mutable remote object, use only an authorized captured version; otherwise pause and request one.
2. Resolve a stable logical `source_id`. Prefer a durable identifier such as a DOI or document ID; use a schema-assigned key, or the content hash when no logical identity exists. Treat a revision or edition as a new version only when provenance establishes that relationship. Keep related studies, reports, or ambiguous documents under separate identities and ask the human before merging them.
3. Compute or verify the snapshot's `version_id`, using SHA-256 by default. Record its path, aliases, and publication, effective, or retrieval dates when available.
4. Search evidence records and relevant log entries by both `source_id` and `version_id`.
5. Handle prior state:
   - For the same identity and version with complete integration, verify it against the current schema and skip recompilation only when it still conforms.
   - For incomplete integration, resume from its recorded status and impact.
   - For the same logical source with a new version, preserve the prior version, create or update a versioned evidence record, and integrate the delta.
   - For the same version under another path with the same provenance, record an alias and reuse the existing evidence record.
   - For the same bytes with distinct or uncertain provenance, preserve separate source identities that reference the shared content hash; avoid duplicating the compiled claim.

Read each new or incomplete snapshot in full, including meaningful figures and tables. Use chunks when needed without dropping coverage. Record unread or inaccessible portions and treat claims that depend on them as unverified.

Complete this step when every source has an immutable identity, a known prior state, and explicit coverage limits.

## 2. Discover and review the impact

Read `index.md`, relevant overview or synthesis pages, and evidence records already connected to the source's subjects. Search the whole wiki for names, aliases, concepts, claims, and related sources; follow useful inbound and outbound links. Use the schema's full-text or indexed search once the index alone cannot give credible coverage. State the coverage limit instead of claiming completeness when required search is unavailable.

Build a working impact plan that maps:

- each material observation to an exact raw locator in the immutable snapshot;
- agent inference or interpretation separately from source observation;
- agreements, extensions, contradictions, and temporal scope against existing claims;
- every page to create, revise, merge, cross-link, or leave unchanged with a reason;
- at least one non-source durable integration target for reusable knowledge, or an `accession-only` disposition with a reason.

In interactive mode, discuss the identity, takeaways, impact plan, uncertainty, and proposed emphasis with the human before changing knowledge pages. Apply their direction and record unresolved disagreements. In batch mode, continue within the approved boundaries and defer non-blocking review until the batch result.

Complete this step when search coverage is credible, every material claim has a durable destination and locator, and the required review has occurred.

## 3. Integrate and checkpoint each version

Create or update the schema-defined evidence record for the immutable version. Include `source_id`, `version_id`, snapshot path, origin and aliases, dates, coverage limits, integration status and page dispositions, a faithful summary, and key claims with exact raw locators.

Update the full impact plan:

- add a claim-local link from every material durable claim to the evidence-record anchor that carries its raw locator;
- strengthen, qualify, or correct existing pages where the evidence changes the synthesis;
- keep source observation distinct from agent inference;
- keep conflicting claims together with scope, relevant dates, and evidence;
- revise or merge existing pages before creating near-duplicates;
- create only page types enabled by the domain schema;
- add reciprocal links only when they improve navigation or explain a meaningful relation.

For each source that contributes reusable knowledge, create or update at least one non-source durable page. Use `accession-only` only for a duplicate, administrative record, out-of-scope source, or source with no reusable claim; record the reason and a future promotion trigger in its evidence record and operation outcome.

Refresh affected index entries, validate the version's links and raw locators, and mark its evidence record `complete` before continuing to the next source. Treat that state as the resumable checkpoint. Use publication or effective dates—not batch order alone—to represent supersession.

On failure, stop before the next source, preserve completed checkpoints, mark the current version partial when possible, and finish the attempt with a shared `partial` or `blocked` log entry that lists completed and pending versions. Resume later by reusing the operation ID and prior identity checks.

Complete ingest when every requested version is skipped as an identical completed duplicate, integrated with a non-source durable effect, or explicitly accession-only; every checkpoint and evidence chain validates; source snapshots remain unchanged; and the shared index and terminal log describe the outcome.
