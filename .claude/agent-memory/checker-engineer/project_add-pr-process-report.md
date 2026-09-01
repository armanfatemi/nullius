---
name: add-pr-process-report-pre-review
description: 2026-08-31 pre-review iterations 1-4 of add-pr-process-report; field-only redaction still leaks removal via pass-1 rejected lines, --no-prompts, and report.findings shape
metadata:
  type: project
---

Pre-review (proposal-to-pr Stage 2) of `openspec/changes/add-pr-process-report/`
— `witness bundle` (kit) + `witness report` (kernel). Four iterations.

**The arc.** Iterations 1-3 killed record removal: `validateJournal` partitions
records by path (hash map advanced by `mutation` `witness.ts:1120`,
`verification` `:1036`, `append` `:1473`; read by `stale-verification` `:1077`,
raised on a `reliance` that carries no path) and by id (`byId`). Iteration 4
restated it as **redaction may empty a field, it may not remove a record.**

Open at iteration 4 (re-check at post-review):

1. **Removal returns through pass 1.** Five line classes never reach `records`
   (`witness.ts:761-841`): unparseable JSON, non-object, misplaced header,
   unknown kind, missing id, duplicate id. A bundler serialising `records`
   drops them and loses their `malformed`/`duplicate-id` verdicts. The
   prohibition is stated over *records*; it has to be stated over *lines*.
2. **`--no-prompts` blocker** (unchanged): `witness.ts:1447` breaks on non-empty
   text else requires `chars` AND non-empty `hash`; text-mode prompts carry
   `text`+`chars`, no hash (`packages/kit/src/record.ts:894-900`). Emptying
   manufactures `malformed`. Fix: rewrite to `{chars, hash}`.
3. **`report.findings` entries have no ids** — producer writes
   `findings: [clip(text, EXCERPT_LIMIT)]`, one plain string
   (`record.ts:479,639`). Every "preserve ids" clause is written against a
   shape that does not exist.
4. **`truncated`/`response_chars` on a report describe the clipped findings
   entry, not `statement`** (`record.ts:481`). Emptying the body while leaving
   them yields "5000-char response, empty excerpt".
5. **Renderer range-scoping has no predicate for pathless kinds** — only
   mutation/verification/append carry a path. And it collides with the SHALL
   that forbids the report a tiering rule of its own (`provenance` is
   whole-journal, `witness.ts:1615-1639`). Resolution: tier counts stay
   journal-wide; only mutation-derived tables and the flowchart scope.
6. Removal-era leftovers in tasks.md §0/§2/§3; `dropped-record count`
   structurally 0.

Settled (do not re-litigate): findings-body emptying is safe (`raw.findings`
read only at `:965`, arity + `Array.isArray`); capping keeps strings non-empty
so `silent-empty` (`:986`) and `finding.text` (`:1194`) are untouched;
`truncated` read by nothing (`:483`, `:1437`); extra keys ignored except `rev`
on a mutation (`:1109`); `provenance` is `ProvenanceCounts | null` on
`JournalReport` (`:222`), null below floor (`:1637`), returned (`:1656`).
All Decision 1/3/4 anchors verified byte-correct AND supported by enclosing
scope at `04cd9ac`.

**Why:** plan-stage; implementation had not started at iteration 4.
**How to apply:** at post-review check the diff for line-level bundling, the
hashed-prompt rewrite, the findings-entry shape, and journal-wide tier counts.

Earlier findings still worth checking in the diff: `describeCanary` is a
chokepoint not a guarantee (`canary.ts:72`); `witness report` renders and does
not gate (Decision 13); `kind: "run-report"` discriminator (Decision 14).

Related: [[add-run-ledger-producer-pre-review]].
