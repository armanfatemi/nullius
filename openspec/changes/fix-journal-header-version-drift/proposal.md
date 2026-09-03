# Proposal — fix-journal-header-version-drift

> **Depends on:** None

## Problem

A journal declares its schema version once, in a header written the first time
anything is appended to it, and never again. The header is written if and only
if the file is empty:

**Evidence:** `packages/kit/src/journalFile.ts:270@80f862d` — `    const needsHeader = !existsSync(file) || statSync(file).size === 0;`

**Evidence:** `packages/kit/src/journalFile.ts:272@80f862d` — `      ...(needsHeader ? [headerRecord(header)] : []),`

A journal therefore outlives the kit version that created it. A session started
under a kit that wrote `0.2` keeps that header for its whole life, while every
later append comes from whatever kit is installed at the time — and the current
one writes record kinds that arrived at 0.3 and 0.6:

**Evidence:** `packages/kit/src/journalFile.ts:77@80f862d` — `export const SCHEMA_VERSION = "0.6";`

The validator is right to reject the result, and does: a record whose kind
postdates the declared version is MALFORMED, once per record.

The consequence is that the run record most worth reading is the one most
likely to be unreadable. A long-running session is exactly the one that spans a
kit upgrade, and a single stale header invalidates the whole journal — so every
bundle-derived count in the run report goes to *not recorded* on the basis of a
version string, not on the basis of anything wrong with the records themselves.

This is observed, not hypothetical. The bundle committed for this repository's
own pull request #80 fails validation this way: 57 findings, all of them the
same defect, over records that are otherwise well-formed. It is the fixture
committed by `fix-run-report-duplication` at
`spec/fixtures/report/stale-header-bundle.json`.

## Why now

`fix-run-report-duplication` made the symptom cheap to read rather than
expensive, which removes the pressure that would otherwise have hidden the
cause. The cause is still there, and it silently empties three of the four
tiers of every report over an upgraded session.

## What changes

The kit stops treating the header as write-once and starts treating a version
mismatch as a thing to correct. The specific mechanism is deliberately left to
design, because two of the three obvious options are wrong:

- **Rewriting the existing header** is not available. The journal is
  append-only, and rewriting history to make a check pass is the shape of
  defect this project exists to detect.
- **Reading the journal to learn its version on every append** is not
  available either, and the reason is written where the current behaviour is
  decided:

**Evidence:** `packages/kit/src/journalFile.ts:267@80f862d` — `    // reading a growing journal end to end each time is O(N²) across a session`

  That cost is paid while holding the append lock, which is when every other
  hook is counting down to being refused.

- **Appending a version declaration** is the direction design should explore: a
  bounded read of the first line only, and a correction record when the
  declared version is below the running one. That keeps the journal
  append-only, keeps the hot path off the whole file, and leaves the correction
  visible rather than silent — which the schema's own append discipline already
  requires.

## Non-goals

- **Changing the validator.** Its verdict is correct. A journal that declares
  0.2 and carries 0.6 kinds is malformed, and relaxing that to accommodate a
  producer bug would disarm the check for real tampering too.
- **Retroactively repairing committed journals.** Out of scope; a repair tool
  is a separate decision.
- **Anything in the run report renderer.** It renders the absence honestly
  today.

## A note on how this can be verified

Per this repository's own documentation, the witness hooks run the **published**
kit rather than this working tree, so a change to `packages/kit/src/**` is not
exercised by this repository's own recording until it is published. This change
must therefore carry its proof in unit tests over `writeRecords` and in a
fixture, and must not be signed off on the basis of a green local run.

## Size estimate

Small to medium. One function's contract in `journalFile.ts`, a bounded
first-line read, a correction record kind or reuse of the existing append
record, and tests. No renderer change, no validator change.
