---
name: schema-decisions-lag-noun-changes
description: When a rewrite changes the storage noun (records to lines), the decision that literally declares the schema is the one left stale
metadata:
  type: feedback
---

When a revision changes *what an artefact stores*, go straight to the decision
that writes the schema out as a literal shape — it is usually a different,
earlier decision than the one being rewritten, and prose sweeps miss it because
it contains no argument, only a type.

**Why:** in `add-pr-process-report`, Decisions 3 and 4 were rewritten to store
source *lines*; Decision 2 still declared `journals: [{ session, header,
records }]`. An implementer reads the schema decision, not the rationale ones.

**How to apply:** grep the change dir for `{ ` shapes, tables and field lists
after any rewrite, and check heading text too — headings ("what it empties")
outlive the body that abandoned the verb. Related:
[[reread-spec-after-design-rewrite]], [[enumerate-against-declared-boundary]].
