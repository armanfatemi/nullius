## Context

`add-witness-recording` shipped a two-tier journal: a hooks tier the harness
attests, and a self-reported tier for claims no tool call can make. The
self-reported tier has five kinds and, as the spec says plainly, no producer.

This change adds the vocabulary a run's *account* needs — what was raised, by
whom, whether anyone answered it — as schema v0.3. It adds no producer. That is
deliberate and is Decision 8.

Every decision below is derived from the 91-file corpus, not reasoned out.
[`corpus-derivation.md`](./corpus-derivation.md) is the evidence; the derivation
overturned four claims in the original proposal, which is the argument for
having done it first.

The constraint that shapes everything: **kinds are a closed list per version.**

**Evidence:** `packages/claims/src/witness.ts:133@d2b3423` — `const KINDS_V02 = [...KINDS_V01, "mutation"] as const;`

A field forgotten now costs a version bump later, so the shape has to be right
before a producer exists — which is also why no producer exists yet.

## Goals / Non-Goals

**Goals:**

- Five kinds — `stage`, `finding`, `resolution`, `check`, `decision` — that can
  carry what the corpus carries, prose included.
- Two verdicts that are mechanically checkable and currently unaskable:
  `SUPPRESSED-FINDING`, `SILENT-REVIEWER`.
- v0.2 and v0.1 journals validate exactly as they do today, including their
  verdicts. No existing journal acquires a new finding.

**Non-Goals:**

- A producer. No skill, no `witness record` mode, no `packages/kit` change.
- `witness harvest` and the rendered projections.
- Deciding whether `verification`/`reliance` are subsumed by `check`/`finding`.
  Nothing can be subsumed before either has a producer.
- Reproducing the corpus's prose conventions. Structure goes *around* prose.

## Decisions

### 1. Severity is a closed three-value enum

`blocker` / `concern` / `looks-good`. Not a numeric scale, not open.

The corpus uses exactly three, and the distribution is not lopsided: `concern`
248, `looks-good` 238, `blocker` 136.

`looks-good` at a third of all tags is the load-bearing one. A schema that only
accepted problems would discard the 80-of-91 files that record explicit
nothing-found results — and would make `SILENT-REVIEWER` unanswerable, since an
explicit "I looked, nothing here" is precisely how a reviewer proves it wasn't
silent. **Alternative rejected:** severity 1–5, as most trackers do. Nothing in
the corpus grades that finely, and an invented scale would be filled in
arbitrarily.

### 2. `stage.phase` is an open string; `severity` and `outcome` are closed

Phase frequency: `verify` 222, `pre-review` 193, `post-review` 105, `address`
17, `refine` 11 — then a tail of roughly 35 one-off names (`Polish`, `Docker`,
`Section`, bare agent names).

**A closed phase enum would reject about 5% of the corpus.** So phase is a
non-empty string, with those five documented as the conventional set.

This is the one place the schema declines to close a list, and the asymmetry is
the point: closing severity costs nothing because the corpus already agrees;
closing phase would throw away real records to enforce a tidiness nobody
practised.

### 3. `finding.author` is a free string

Corpus authors include `graphql-engineer` (148), `kubernetes-architect` (74),
`incident-extraction-engineer` (189). These are one project's stack, not a
general vocabulary. Enumerating agent names in a kernel schema would hard-code
somebody's org chart into a tool meant to outlive it.

### 4. Two identifiers, because the corpus has two

The corpus's finding ids (`B1`, `C3`, `F2`, and sub-findings like `B1b`) are
**stage-scoped** — every stage restarts at `B1`. The journal's `id` field is
journal-wide and already policed:

**Evidence:** `packages/claims/src/witness.ts:386@d2b3423` — `        verdict: "duplicate-id",`

Collapsing the two would make `B1` a duplicate id the moment a run reaches its
second stage. So a `finding` carries both: `id` (journal-unique, as every
record does) and optional `ref` (the human label, unique only within its stage).

### 5. The resolution vocabulary, and the two that redirect

Closed: `resolved`, `fixed`, `dropped`, `duplicate`, `deferred`, `folded-in`,
`accepted`, `rejected`, `out-of-scope`, `deviation-accepted`.

Derived, not guessed — the original proposal's enum missed five of the six most
common outcomes and included `withdrawn` (15) and `escalated` (12) among the
rarest.

`duplicate` and `folded-in` are structurally different from the other eight:
they do not close a finding on its merits, they **merge it into another**. Both
therefore require `merges_into`, naming the surviving finding. Without that,
"folded in" is indistinguishable from "dropped", which is exactly the
disappearance this change exists to catch. **Alternative rejected:** a free-text
outcome. It makes `SUPPRESSED-FINDING` unanswerable, since "was this finding
answered?" stops being a question code can ask.

### 6. `SUPPRESSED-FINDING` is gated to `blocker`

A `finding` with severity `blocker` that no `resolution` references.

Measured on the corpus, 60.8% of identified findings (59 of 97) are never
mentioned again. Ungated, this verdict fires on three findings in five — and a
verdict that fires everywhere is one people learn to scroll past. Gating to
`blocker` is where demanding a close-out is defensible; `concern` and
`looks-good` go unpoliced.

Honest limit: the 60.8% is a *proxy*. "Never mentioned again in the same file"
is not the same as "never resolved" — a finding may be answered in a commit or
a PR thread. The number justifies the verdict's existence; it does not predict
its rate under a producer that knows the rule.

### 7. `SILENT-REVIEWER` needs the finding-to-dispatch link

Definition: a `dispatch` whose terminal `report` says `found`, and which no
`finding` record references.

`found` already means "I have something to say":

**Evidence:** `packages/claims/src/witness.ts:464@d2b3423` — `          if (!Array.isArray(record.raw.findings) || record.raw.findings.length === 0) {`

So a `found` report with no structured finding is a reviewer whose content went
nowhere. Reports saying `empty` or `no-report` are untouched — invariant 1
already covers those, and `SILENT-EMPTY` already demands they say something.

This requires `finding.dispatch`, an optional reference to the dispatch that
produced it. Optional because a finding may come from a human or from the
implementing agent, with no dispatch behind it; but a dispatch cannot be
answered without it.

### 8. New invariants are version-gated, not merely the new kinds

The existing code gates the *vocabulary* by version. The new **rules** must be
gated too:

**Evidence:** `packages/claims/src/witness.ts:307@d2b3423` — `  const vocabulary: readonly Kind[] = scan.version === IMPLIED_VERSION ? KINDS_V01 : KINDS_V02;`

Without this, every v0.2 journal in existence acquires `SILENT-REVIEWER` on its
next validation, because none of them can carry a `finding`. `SUPPRESSED-FINDING`
and `SILENT-REVIEWER` are evaluated only when the journal declares `0.3`.

That ternary also stops scaling at three versions and becomes a lookup.

### 9. `change` binds to `stage`, not to the header

The proposal requires records to carry the change they belong to, because
sessions and changes are many-to-many.

That rules out the header: a journal is a session, and a session touches
several changes. It rules out every record: noise. `stage` is the grouping
record and the natural carrier, and findings reach it through `stage`.

Carried now despite harvest being deferred — adding a field to a
closed-per-version schema later means another version bump, which is the whole
reason this change precedes its producer.

## Risks / Trade-offs

- **A schema with no producer is a schema nobody has stress-tested.** → The
  same was true of v0.2's `verification`/`reliance`, and they are still
  unproduced, which is evidence this risk is real rather than theoretical.
  Mitigation: fixtures exercise every kind and both verdicts, and the follow-up
  producer is expected to find shape problems — that is what a v0.4 is for.
- **`SUPPRESSED-FINDING` may still be noisy even gated.** → Blocker-only is a
  judgement, not a measurement; the corpus does not separate blocker close-out
  rates from concern close-out rates cleanly enough to predict. Revisit once a
  producer emits real records.
- **Structure discards prose.** → Every ledger kind carries a required free
  `text`. Structure is added around the prose, never instead of it.
- **Ten resolution outcomes is a lot to ask an agent to choose between.** →
  They are the corpus's own words, so an agent writing in that idiom is
  choosing among terms it would have used anyway. If real use shows three of
  them never appear, narrowing in v0.4 is cheap; guessing narrow now is not.

## Migration Plan

Additive, and each step is independently valid:

1. `KINDS_V03 = [...KINDS_V02, "stage", "finding", "resolution", "check", "decision"]`,
   `VERSIONS` gains `"0.3"`, and the version→vocabulary ternary becomes a map.
2. Record parsers and the two verdicts, evaluated only under `0.3`.
3. Spec and fixtures: a valid v0.3 run, and a broken one that trips both new
   verdicts.

Rollback is deleting `"0.3"` from `VERSIONS`; journals declaring it then get
`UNSUPPORTED-VERSION`, which is the designed behaviour for a schema this build
cannot read, not a crash.

**No existing journal changes verdict.** The v0.1, v0.2, and hooks fixtures are
the regression test for that claim.

## Open Questions

- Whether `check` subsumes `verification`, and `finding` subsumes `reliance`.
  Deferred with the producer — neither pair can be compared before either has
  one.
- Whether `ref` should be validated as stage-unique, or left free. Leaning
  free for now: the corpus reuses `B1` across stages by design, and policing it
  adds a verdict before anything produces the field.
- Whether `check.counts` should be structured (`{passed, failed}`) or free
  text. The corpus is free text ("860 tests pass", "12 files passed"), so this
  design takes optional structured counts *plus* required prose, and lets the
  producer show which one gets used.
- **Whether two resolutions for one finding is a contradiction or a history.**
  Nothing currently flags `fixed` followed by `dropped` on the same finding.
  There is no safe default: the journal is append-only and time-ordered, so a
  finding legitimately deferred and later fixed is a *progression*, and
  rejecting a second resolution would refuse it. Deliberately left open — it
  needs the producer to show which pattern actually occurs. Note this is not a
  hole in `SUPPRESSED-FINDING`: every non-merge outcome discharges, including
  `dropped`, because a drop recorded with its reason is dissent conserved, not
  dissent suppressed.
- **Whether `JournalReport` should count ledger records.** It exposes
  `dispatches`, `verifications`, and `mutations`, and none of the five new
  kinds. The summary line for a journal that is mostly ledger reads "N
  record(s) read: 3 dispatch(es), 0 verification(s), 0 mutation(s)", which
  undersells what the journal contains. Adding counters changes a public
  interface, so it is deferred to the change that gives these records a
  producer worth counting.
