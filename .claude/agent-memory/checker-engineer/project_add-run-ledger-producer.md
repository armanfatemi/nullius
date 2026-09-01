---
name: add-run-ledger-producer
description: openspec/changes/add-run-ledger-producer (0.6 schema bump) — pre-review iteration 1; the JournalReport.findings collision, the expects fail-open, and the loosening-direction bump argument
metadata:
  type: project
---

Pre-review iteration 1 (2026-08-30, HEAD c8305b1). Plan-phase; no kernel code yet.

Blockers raised:

- **`JournalReport` already has `findings: JournalFinding[]`** (witness.ts:~131),
  so Decision 6's proposed `findings` *counter* is a redefinition, not an
  additive field. Consumed as an array at `packages/claims/src/cli.ts:440`,
  `packages/kit/src/cli.ts:603`, `packages/kit/src/doctor.ts:714`. Name the
  counters `ledger: {...}` or `findingRecords`.
- **`expects` fails open on a typo.** Task 1.3's `raw.expects !== "findings"`
  means any unrecognised value silences SILENT-REVIEWER with no MALFORMED —
  unlike every other closed vocabulary in this validator (`asSeverity`,
  `asResolutionOutcome`, `asOutcome` all report). A loosening keyed on an
  unvalidated field is the one place a producer typo disarms a verdict repo-wide.
- **Open question 1's premise "no tightening" is false.** Decision 7 (header
  `user.name`/`user.email` non-empty at >=0.6) is trigger 3 by the spec's own
  0.4 precedent (`spec/witness-journal.md:396-401`), and `prompt` is trigger 1.
  0.6 is owed twice over independent of the `expects` question.

The `expects` bump argument, settled: a **loosening** fires no numbered trigger,
but the rule's headline is "the set of valid records changes" — direction-neutral
— while clause 3 names only one direction. A journal that failed now passes.
Ungated it would retroactively silence SILENT-REVIEWER on every existing 0.3-0.5
journal. Gating requires a version to gate on, so bump either way. The spec's own
warning that restatements decay by dropping clauses applies here: the enumeration
is missing clause 3's mirror.

**Why:** this kernel's recurring defect is a verdict silently ungated by a bump;
this is the first change where the gate direction is *looser* at the newer version,
which inverts the 0.4 compat-pair fixture trick.
**How to apply:** for a loosening, the discriminating pair is a fixture that PASSES
at 0.6 and FAILS at 0.5 (identical bytes). Task 1.6's "twin of the broken file,
must exit 1" has zero discriminating power — the broken file trips the verdict at
both versions. Check this got inverted before post-review.

Also noted: `type Kind` derives from `KINDS_V03` and must move to `KINDS_V06`;
`expects` and the prompt fields must join `JournalRecord.raw`'s explicit key list;
`JournalSurvey` sums six counters and Decision 6 never says whether it gains the
ledger ones.

See [[add-journal-identity]] for the 0.4 compat-pair shape this inverts.

## Iteration 3 (2026-08-31, HEAD 7968594)

Iteration 2's two blockers are answered (cli.ts:681 sentence rescoped; `user.name`
gets its own scanHeader branch). New blockers raised:

- **`versionAtLeast` is module-private to witness.ts**, and its JSDoc (witness.ts:193-196)
  names "four call sites" as the anti-ungating invariant. 0.6 adds ~four more plus a
  gate in `cli.ts`, which cannot reach the predicate — a second hand-rolled comparison
  in a second module is the shape that comment exists to forbid.
- **Ledger counters ungated vs. `specs/witness/spec.md`'s "an older journal → summary
  unchanged from today"** — tasks §1.7 prints `ledger` unconditionally, §1.8 gates only
  `provenance`. One characterization test cannot pin both.
- **The bump rule's fifth clause needs a MODIFIED requirement.** `openspec/specs/witness/spec.md:514-525`
  calls the four triggers canonical and mandates restatements carry all four; task §1.13
  adds the loosening mirror to `spec/witness-journal.md` only, and the delta is ADDED-only.

False premise: "IDENTITY_FIELDS … gated at 0.4" (design.md:284-285, tasks §1.4). The loop
*records* at every declared version; only the rejection is gated (witness.ts:474-477, 490).
Matters because it decides whether `user.name` is recorded on a 0.5 header.

**Why:** recurring shape in this change — the fix lands in the one place the reviewer
pointed at, and its twin (the JSDoc at witness.ts:31/98, the other three `provenance()`
branches) is left saying the old thing.
**How to apply:** at post-review, diff for *every* site that repeats a claim the change
falsifies, not just the cited one.

## Post-review (2026-08-31, uncommitted tree on HEAD 7968594)

Iteration 3's blockers all landed fixed: `versionAtLeast` stayed private and grew to
nine documented call sites (no equality gate anywhere), the ledger/provenance blocks
are `null` below 0.6 so sub-0.6 summaries render byte-identically, and the compat pair
is genuinely inverted (`v0.5-compat-run.jsonl` differs from `v0.6-run.jsonl` in the
version string only, and fails at 0.5 for `prompt`-unknown-kind + unscoped
SILENT-REVIEWER on the `expects`-less dispatch).

New post-review findings:

- **Blocker: the provenance partition is off by the header.** The loop walks `records`
  (witness.ts:1595ff), but `report.records` is `records.length + 1` when a header
  exists (witness.ts:1625) — and every 0.6 journal has one. The exported JSDoc
  (witness.ts:165) and the CLI sentence (cli.ts:725) both claim the three tiers total
  the records read, printed three lines under "N record(s) read".
- **Concern: a MALFORMED coordinator record with `origin` ABSENT under a `hooks` header
  counts hook-tier** (witness.ts:1608-1610), while the same record with an unreadable
  origin counts unattributed — the comment one line up refuses exactly that fold.
  Surfaces via `survey`, which aggregates failing journals.
- **Concern: SILENT-REVIEWER's 0.6 scope hardcodes `"findings"`** (witness.ts:1558)
  instead of the `EXPECTATIONS` constant it validates against (witness.ts:892).
- **Concern: `expects` OMITTED silently exempts a dispatch** — the typo case is now
  MALFORMED, the omission case is not counted anywhere.

**Why:** the recurring shape held again — the partition invariant is stated in three
places and true in one.
**How to apply:** when a change adds a *counter* that claims to partition or total
something the summary already prints, check it against the existing printed number,
not just against itself.
