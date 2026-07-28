# Lint the wiki

Separate health reporting from repair. Default to `report` mode unless the human explicitly requests repair or the schema records standing repair authorization.

In `report` mode, leave knowledge pages, the index, and the schema unchanged; append only the shared audit log unless the human requests a zero-write report. In `repair` mode, change only the authorized scope.

## 1. Set scope and inventory

Define the pass as full or incremental. Use a full pass when requested and feasible. For a large wiki, use the schema's search or graph tooling, divide work into explicit bounded passes when needed, and never describe unscanned pages as checked.

Within scope, enumerate:

- every wiki page and index entry;
- every local link, evidence-record anchor, raw locator, and source snapshot;
- every `source_id`, `version_id`, alias, hash, and integration status;
- relevant terminal log entries and incomplete operations;
- inbound and outbound link counts.

Recompute source hashes when feasible and compare them with recorded immutable versions. Treat a mismatch as source drift; do not silently accept it as the same version.

Complete this step when the inventory identifies its exact coverage and includes pages missing from the index.

## 2. Check the invariants

Inspect the scoped inventory for:

- material claims without a claim-local evidence link, exact raw locator, or available immutable snapshot;
- evidence records with missing identity, version, provenance, coverage, or integration status;
- unexplained duplicate identities or hashes, conflicting versions, source drift, and incomplete batch checkpoints;
- contradictory claims kept apart, missing evidence, or collapsed into false certainty;
- claims presented as current after a later effective source supersedes them;
- source-summary islands without a non-source durable effect or justified accession-only disposition;
- near-duplicate pages, fragmented syntheses, and reusable knowledge filed in parallel rather than reconciled;
- orphan pages, missing meaningful cross-references, and important recurring concepts without a durable home;
- broken or ambiguous local links, evidence anchors, raw locators, and source paths;
- index entries or one-line descriptions that are missing, stale, or dangling;
- page metadata or structure that violates the active schema;
- evidence gaps, questions, and candidate sources that could improve the wiki.

Attach a page path and evidence to every finding. Distinguish confirmed defects from judgment calls such as page granularity or link usefulness.

Complete this step when every applicable invariant has been checked within the declared scope and the report states all coverage limits.

## 3. Report or repair

In `report` mode, return the ranked findings without changing wiki content. Suggest schema changes or new sources, but leave them for human review.

In `repair` mode:

- apply unambiguous structural repairs, such as a known moved relative path or a missing index entry;
- add reciprocal links only when the relation is meaningful, not merely because one direction exists;
- make semantic repairs only when exact raw evidence is decisive and the repair is authorized;
- preserve unresolved contradictions and uncertainty on the pages where readers encounter the claims;
- propose material schema changes through the recorded human-approval workflow.

After repair, rerun the affected checks. Use the shared terminal log to record mode, scope, coverage, findings, repairs, unresolved items, and candidate sources.

Complete a report when all scoped findings and limits are recorded. Complete a repair when every authorized finding is fixed or explicitly unresolved, all changed links and evidence chains validate, and the shared index reflects the repaired graph.
