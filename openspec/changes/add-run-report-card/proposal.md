# Proposal — add-run-report-card

> **Depends on:** `fix-run-report-duplication`

## Problem

The run report answers no question in the order a reviewer asks it. Its
top-level structure is the four provenance tiers, and a reader who wants to
know whether this pull request was reviewed has to assemble that from sections
spread across three of them. Nothing in the document states a verdict: the
title is the commit range, and the first line is a count of commits.

That is the wrong axis for the reader, and it is the axis the renderer is
built on. Sections are grouped under a tier and each one carries only its own
status:

**Evidence:** `packages/claims/src/witnessReport.ts:396@80f862d` — `  status: "data" | "not-recorded";`

A reviewer looking at a diff too large to read wants one thing: evidence that
the work went through a process, and a pointer to where their attention is
worth spending. Most of that data already exists and is already computed. Six
of the seven questions such a reviewer asks are answered somewhere in the
document today — including the two that no other tool produces, and that are
currently the least visible.

The first is a review that was launched and never came back. The validator
counts it apart from the other two terminal states precisely because a summary
cannot surface it on its own — the missing record is missing:

**Evidence:** `packages/claims/src/witness.ts:204@80f862d` — `  /** Terminal outcomes, counted apart — the point of invariant 1 is that`

On the range this proposal was written against, that number is 2. It appears
nowhere a reader would find it.

The second is the review probe. Every other signal measures attendance; the
canary measures whether review found something. It is rendered as a note at
the bottom of the longest tier.

## Why now

`fix-run-report-duplication` took the document from 21,254 bytes to 7,378 by
removing restatement. That was the whole of the size problem and none of the
legibility problem: what remains is 7 KB correctly organised for a consumer
that does not exist and wrongly organised for the reader who does. The
reordering is worth doing now, while the document has one consumer and its
JSON schema is at version 1.

## What changes

- The renderer gains a **card**: a fixed set of rows, one per question a
  reviewer asks, each carrying a tri-state mark, a short result, and the tier
  the answer came from. It is rendered above the existing document.
- The card is a **projection of sections that already exist**. It reads the
  built `RunReport`, adds no input, runs no command, and holds no value the
  tiers do not.
- Every row names its provenance, because rows differ in what they are worth.
  A loop count is the coordinator describing its own run; an anchor verdict is
  code re-reading a file. The kernel already partitions them, and the card
  must not flatten that:

**Evidence:** `packages/claims/src/witness.ts:368@80f862d` — `const SELF_REPORTED_KINDS: ReadonlySet<Kind> = new Set<Kind>([`

- **No derived metrics.** Active time, operator characters and loop depth were
  in the first draft and are removed: each needs a `ReportSection` that carries
  more than one figure, a validator-computed loop depth, and a `RecordView` that
  carries `origin`. They are filed as `add-run-report-metrics`.
- The agents dispatched are listed by name and count, with **no role
  judgment**. Naming which agent counts as a critique agent would require this
  renderer to hold a vocabulary of another repository's conventions, and a row
  that reports a green critique check because a name matched a glob is worse
  than no row.
- The PR comment carries the card, with the existing document collapsed
  beneath it in a `<details>` block, under the marker the upsert already
  matches on:

**Evidence:** `action/action.yml:280@80f862d` — `          marker='<!-- nullius-run-report -->'`

## Non-goals

- **A process score.** No composite number, no weighting, no 0–100. A weighted
  aggregate of these rows is a judgment presented as a measurement, and this is
  the one repository where that cannot ship. Rows are shown; the reader
  concludes.
- **Automation ratio as a single figure.** Same objection. The components are
  printed and left as components.
- **Detecting attachments, images or design references.** The prompt recorder
  reads text keys only, and has no attachment field to read:

**Evidence:** `packages/kit/src/record.ts:854@80f862d` — `const PROMPT_TEXT_KEYS = ["prompt", "prompt_text", "user_prompt", "text"] as const;`

  The same function already declines to record a prompt when the payload shape
  is unprobed. Adding a reference row would mean rendering "no references" for
  a repository where nothing ever looked — an absence reported as a finding,
  which is the failure this document class exists to prevent.
- **Gating.** The report renders and does not gate. The card does not change
  that; `nullius check` remains the gate.
- **Workflow annotations.** `add-maintainer-card` proposes those for the
  grounding comment. One delivery mechanism per artefact.
- **Any change to the four tiers, their order, or their contents.** The card
  is additive; deleting the tiered document is a separate decision made after
  the card has been read in anger.

## Dependencies

### Hard (must be merged before this starts)

- `fix-run-report-duplication` — the card sits above a document whose absent
  sections restate one cause up to thirty times. Landing the card first would
  put a legible summary on top of the thing it summarises badly.

### Soft

- `add-maintainer-card` — the sibling card on the grounding comment. If it
  lands first, this one matches its table vocabulary rather than inventing a
  second.

## Size estimate

Medium. One new exported renderer in `witnessReport.ts`, one new field on the
JSON document, and a `<details>` wrapper in `action/action.yml`. No kernel
verdict changes, no config keys, no new inputs.
