# Add the run ledger — schema v0.3, the kernel records

## Why

`add-witness-recording` built a capture layer: harness hooks record which
agents were dispatched, whether each came back, and what changed on disk. That
is the skeleton of a run. It is not an account of one.

The account already exists, maintained by hand. Files like
`openspec/changes/<change>/review-evidence.md` record staged reviewer rounds,
findings with severities, dedup across reviewers, conflicts resolved against
code, verification runs with counts, and accepted deviations.

There are 91 such files in one sibling project as of 2026-08-21 — counted
outside this repo, so stated here as an observation rather than an anchored
claim. The number matters only for one reason: it is a corpus large enough to
derive a vocabulary from instead of inventing one.

That derivation has since been done, and it is recorded in
[`corpus-derivation.md`](./corpus-derivation.md). It corrected this proposal on
four points; the corrections are folded in below and listed at the end.

None of that content can enter a journal today, because the schema has no
vocabulary for it. All it asks of a report's findings is that they be a
non-empty array:

**Evidence:** `packages/claims/src/witness.ts:464@d2b3423` — `          if (!Array.isArray(record.raw.findings) || record.raw.findings.length === 0) {`

No id, no severity, no author, nothing a later query could group by — and the
recorder fills that array with one clipped blob of the subagent's reply.

So a journal can say *that* `rule-auditor` reported, never *what it raised*,
*whether anyone answered it*, or *whether the synthesis quietly dropped it* —
which is the question a run ledger exists to answer, and the one thing a
hand-written evidence file cannot be trusted on, since the agent that wrote the
synthesis also wrote the file.

The schema addition must land before producers exist, for the reason the last
change proved: kinds are a closed list per version, so every addition is loud.

**Evidence:** `packages/claims/src/witness.ts:133@d2b3423` — `const KINDS_V02 = [...KINDS_V01, "mutation"] as const;`

## What Changes

- **Schema v0.3** (kernel): five record kinds covering what any agent in a run
  contributes, not only reviewers.
  - `stage` — pipeline phase and iteration, so a journal groups the way a run
    actually ran.
  - `finding` — id, severity, author agent, subject, free text, and the
    agents who independently corroborated it. Covers a reviewer's blocker, a
    devil's advocate's refutation, an implementer's flag. Severity is exactly
    three values — `blocker` / `concern` / `looks-good` — because the corpus
    uses exactly three, and because `looks-good` is what makes
    `SILENT-REVIEWER` answerable rather than merely accusatory.
  - `resolution` — a finding's fate, from a closed vocabulary derived from the
    corpus rather than guessed: `resolved` / `fixed` / `dropped` /
    `duplicate` / `deferred` / `folded-in` / `accepted` / `rejected` /
    `out-of-scope` / `deviation-accepted`. Names the finding it answers and
    why. `duplicate` and `folded-in` additionally name the finding they merge
    into — they do not close a finding on its merits, they redirect it.
  - `check` — a command ran, its outcome and counts. Distinct from
    `verification`: "860 tests pass" is not a claim about a file's hash.
  - `decision` — an implementing agent chose an approach, with its reason,
    what it departed from, and optionally the numbered design decision it
    resolves. Recorded because the reasoning is pervasive in the corpus as
    prose, not because the section is common — `## Decision` is in 11% of
    files, and 21% counting any heading level. See the derivation.
- **Two new verdicts**, both mechanical and both currently unaskable:
  `SUPPRESSED-FINDING` (a finding no resolution ever answers — IDEAS.md's
  dissent conservation) and `SILENT-REVIEWER` (a dispatch the harness saw
  return, which filed neither a finding nor an explicit "none").
- **Scope binding**: records carry the change they belong to. Sessions and
  changes are many-to-many — one session touches several changes, one change
  spans days of sessions — so harvest reads across journals, never one file.
### Deferred to a follow-up change

The split this proposal left open has been taken, on the derivation's
recommendation. **Out of scope here:**

- **The self-reported producer** — a skill instructing pipeline agents to emit
  these records, plus a `witness record` mode accepting a structured record
  rather than a hook payload. Hooks cannot do this job: no tool call states
  that something was checked, relied upon, or corrected.
- **`witness harvest`** (kit) — renders `review-evidence.md` and
  `implementation-log.md` into the change folder, deterministically.

The reason is the derivation's finding that the projections, not the schema,
are the hard half: 91 files produced roughly 40 heading variants for the same
handful of concepts, only 19% carry identified findings, and only 11% have a
decision section. There is no house style to render back to, so "reads no worse
than a hand-written one" has no fixed target yet. Rendering is far easier to
design against real v0.3 records than against 91 files that disagree.

## Impact

- Affected specs: `witness` (schema v0.3, ledger records, two verdicts).
- Affected code: `packages/claims/src/witness.ts`, `spec/witness-journal.md`,
  and the fixtures beside it. No `packages/kit` change, and no new skill — both
  moved to the follow-up.
- Non-breaking: v0.2 journals stay valid, and headerless ones stay v0.1.
- **The two tiers become a cross-check, which is the point.** Ledger records
  are self-reported by construction; the attested skeleton from
  `add-witness-recording` is what audits them. A reviewer the harness recorded
  as dispatched and returned, which filed nothing, is now a finding rather than
  an absence nobody notices. Neither tier alone supports that.
- **Risk — structure loses what prose carried.** The existing corpus is dense,
  and a schema that only accepts fields will quietly discard the reasoning that
  makes those files worth reading. Mitigation: every ledger record carries free
  text, and structure is added around the prose rather than instead of it. The
  test is that a rendered file reads no worse than a hand-written one.
- **Risk — agents may not comply.** Mitigation: non-compliance is detectable
  against the attested skeleton, which is exactly `SILENT-REVIEWER`. An
  undetectable convention would not be worth shipping.
- **Risk — `SUPPRESSED-FINDING` fires too often to be heard.** Measured on the
  corpus, 60.8% of identified findings are never mentioned again (59 of 97). A
  verdict that fires on three findings in five is one people learn to ignore.
  Mitigation: gate it on `blocker` severity, where demanding a close-out is
  defensible, and leave `concern` and `looks-good` unpoliced.
- **Method, carried over from the last change**: derive the vocabulary from the
  corpus before designing it, the way the hook pack was built from recorded
  payloads rather than documentation. Reasoning about a system you do not own
  was wrong three times out of three there — and it was wrong four more times
  here, which is the best argument available that the method is worth its cost.
- **Split: taken.** Kernel records here; producer and harvest in a follow-up.
- Open: whether `verification`/`reliance` (v0.2, still with no producer) are
  subsumed by `check` and `finding`, or remain the narrower claim-hygiene pair.
  Deferred with the producer — nothing can be subsumed before either has one.

## Corrected after the corpus derivation

Four claims in the original draft did not survive contact with the corpus. They
are corrected above; recorded here so the record shows what was believed.

| Was | Is |
| --- | --- |
| 109 evidence files | **91** — the larger count double-counted `.claude/worktrees/` copies |
| `resolution` enum: `accepted`/`rejected`/`escalated`/`fixed`/`withdrawn`/`deviation-accepted` | Missed five of the six most common outcomes; the two rarest terms it included were `withdrawn` and `escalated` |
| `decision` is "the most common section in the existing corpus" | It is **rare** — `## Decision` in 10 of 91 files (11%), 19 (21%) counting any heading level. Either way, not the most common |
| `finding` carries id, severity, author, subject, text | Also needs **convergence** — who independently corroborated. It is how the corpus dedups across reviewers, which this proposal's own Why section requires to survive |
