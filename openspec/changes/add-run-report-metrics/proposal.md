# Proposal — add-run-report-metrics

> **Depends on:** `add-run-report-card`

## Problem

A reviewer reading a run report can see what happened and not how it was
steered. Three figures are missing, and each answers a question the tiers
already have the records for but no section computes:

- **Active time**, and the idle threshold that produced it. Wall-clock span is
  the wrong number by a large factor — on a real journal from this repository
  the span is 26.8 hours and the active time is 3.1 hours across ten windows.
  The difference is a night's sleep, and a report that prints the span as a
  duration is misleading rather than merely imprecise.
- **Operator volume** — how many turns the operator took and how much they
  typed, against how many dispatches and file mutations the run produced. This
  is the closest available answer to "was this steered or autonomous", and it
  is deliberately left as components rather than a ratio.
- **Loop depth** — how many times the pipeline re-entered a phase. A run whose
  pre-review reached iteration 5 and a run that passed first time are different
  facts that the report currently renders identically.

`add-run-report-card` set out to include these and could not. Three rounds of
review established that they are not a rendering change, and the reasons are
structural rather than incidental.

**A section cannot carry them.** `ReportSection` has exactly one numeric field:

**Evidence:** `packages/claims/src/witnessReport.ts:407@7e807ba` — `  count?: number;`

and the builder accepts only that, a table, and notes:

**Evidence:** `packages/claims/src/witnessReport.ts:507@7e807ba` — `  extra: { count?: number; table?: ReportTable; notes?: string[] } = {},`

Active time needs four figures — active, windows, threshold, span — and the
operator row needs two. With one numeric field, the only remaining home is the
rendered `table`, which makes a card's mark depend on parsing presentation.

**The renderer may not decide which tier a figure belongs to.** Every existing
self-reported section takes its number from a validator-computed count rather
than classifying records itself:

**Evidence:** `packages/claims/src/witnessReport.ts:1361@7e807ba` — `        ? dataSection(id, title, statement, { count: sumLedger(input, field) })`

and the classification it would otherwise have to copy is not exported:

**Evidence:** `packages/claims/src/witness.ts:368@7e807ba` — `const SELF_REPORTED_KINDS: ReadonlySet<Kind> = new Set<Kind>([`

A loop depth read by the renderer from `stage.iteration` would be the renderer
classifying by kind — the map the module header says three earlier drafts each
invented.

**Attribution needs a field the record view does not carry.** Tiers mix inside
a single journal, so the gap between two consecutive records may span both. The
view the renderer reads has no `origin`:

**Evidence:** `packages/claims/src/witnessReport.ts:257@7e807ba` — `export interface RecordView {`

so "active time over the records the hooks wrote" is not expressible today.

## Why now

The analysis above cost three review rounds and is the expensive part. Filing
it while the reasoning is intact is the point of this document; the
implementation is comparatively small once the three structural questions are
answered.

## What changes

- **Loop depth becomes a validator-computed figure**, alongside the existing
  ledger counts, so the renderer reads a number rather than a record kind.
- **`RecordView` carries `origin`**, so a figure derived from a span of records
  can state which tier's records it was derived from — or decline to, in which
  case it belongs in the unattributed tier rather than in a flattering one.
- **`ReportSection` carries more than one figure**, as named typed fields, so a
  section with four numbers does not have to smuggle three of them through a
  rendered table.
- Only then: `session-span`, an extended `prompts` section, and a `loop-depth`
  section, each placed in the tier its records belong to, and each projected by
  the card exactly like every other row.

## Non-goals

- **An autonomy score or steering ratio.** The components are printed; the
  reader weighs them. A weighted aggregate over these figures is a judgment
  presented as a measurement, which `add-run-report-card` already refused.
- **Wall-clock span as the headline duration.** It is reported, labelled, and
  second.
- **Detecting attachments, images or design references.** The prompt recorder
  reads text keys only and has no attachment field; a row reading "no
  references" would mean "nothing ever looked."
- **Changing the card's row model.** These arrive as sections and are projected
  by the existing mechanism.

## Dependencies

### Hard

- `add-run-report-card` — the card is what renders these, and its row model,
  tier-reading and typed-figure rules are the contract this change fills in.

**The direction was wrong in the first draft and is worth stating.** This change
originally held the multi-figure `ReportSection` work, while the card needed a
second numeric field for two of its own rows — so the card depended on a change
that declared it as a prerequisite, and neither could go first. The card now
carries the two **named** fields it needs, and this change carries the
**general** capability: a section able to hold four figures at once, which
`session-span` needs and no card row does.

## Size estimate

Medium to large, and larger than it looks. Three of the four bullets under
"What changes" are kernel or kernel-type changes with their own review surface;
the metrics themselves are the small part.
