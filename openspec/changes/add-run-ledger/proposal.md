# Add the run ledger — structured records, and rendered evidence files

## Why

`add-witness-recording` built a capture layer: harness hooks record which
agents were dispatched, whether each came back, and what changed on disk. That
is the skeleton of a run. It is not an account of one.

The account already exists, maintained by hand. Files like
`openspec/changes/<change>/review-evidence.md` record staged reviewer rounds,
findings with severities, dedup across reviewers, conflicts resolved against
code, verification runs with counts, and accepted deviations.

There are 109 such files in one sibling project as of 2026-08-21 — counted
outside this repo, so stated here as an observation rather than an anchored
claim. The number matters only for one reason: it is a corpus large enough to
derive a vocabulary from instead of inventing one.

None of that content can enter a journal today, because the schema has no
vocabulary for it. All it asks of a report's findings is that they be a
non-empty array:

**Evidence:** `packages/claims/src/witness.ts:460` — `          if (!Array.isArray(record.raw.findings) || record.raw.findings.length === 0) {`

No id, no severity, no author, nothing a later query could group by — and the
recorder fills that array with one clipped blob of the subagent's reply.

So a journal can say *that* `rule-auditor` reported, never *what it raised*,
*whether anyone answered it*, or *whether the synthesis quietly dropped it* —
which is the question a run ledger exists to answer, and the one thing a
hand-written evidence file cannot be trusted on, since the agent that wrote the
synthesis also wrote the file.

The schema addition must land before producers exist, for the reason the last
change proved: kinds are a closed list per version, so every addition is loud.

**Evidence:** `packages/claims/src/witness.ts:132` — `const KINDS_V02 = [...KINDS_V01, "mutation"] as const;`

## What Changes

- **Schema v0.3** (kernel): five record kinds covering what any agent in a run
  contributes, not only reviewers.
  - `stage` — pipeline phase and iteration, so a journal groups the way a run
    actually ran.
  - `finding` — id, severity, author agent, subject, and free text. Covers a
    reviewer's blocker, a devil's advocate's refutation, an implementer's flag.
  - `resolution` — a finding's fate, from a closed vocabulary
    (`accepted` / `rejected` / `escalated` / `fixed` / `withdrawn` /
    `deviation-accepted`), naming the finding it answers and why.
  - `check` — a command ran, its outcome and counts. Distinct from
    `verification`: "860 tests pass" is not a claim about a file's hash.
  - `decision` — an implementing agent chose an approach, with its reason and
    what it departed from. The most common section in the existing corpus.
- **Two new verdicts**, both mechanical and both currently unaskable:
  `SUPPRESSED-FINDING` (a finding no resolution ever answers — IDEAS.md's
  dissent conservation) and `SILENT-REVIEWER` (a dispatch the harness saw
  return, which filed neither a finding nor an explicit "none").
- **Scope binding**: records carry the change they belong to. Sessions and
  changes are many-to-many — one session touches several changes, one change
  spans days of sessions — so harvest reads across journals, never one file.
- **The self-reported producer**: a skill instructing pipeline agents to emit
  these records, plus a `witness record` mode that accepts a structured record
  from an agent rather than a hook payload. Hooks cannot do this job: no tool
  call states that something was checked, relied upon, or corrected.
- **`witness harvest`** (kit): renders projections — `review-evidence.md`,
  `implementation-log.md` — into the change folder, deterministically and with
  no model in the path, like every other verdict surface here. Success is when
  those files are generated output that nobody edits by hand.

## Impact

- Affected specs: `witness` (schema v0.3, ledger records, two verdicts).
- Affected code: `packages/claims/src/witness.ts`, `packages/kit`
  (`witness harvest`, structured `record`), a new plugin skill,
  `spec/witness-journal.md`.
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
- **Method, carried over from the last change**: derive the vocabulary from the
  109-file corpus before designing it, the way the hook pack was built from
  recorded payloads rather than documentation. Reasoning about a system you do
  not own was wrong three times out of three there.
- **Possible split.** If deriving the vocabulary shows the schema is larger
  than the projections, this splits: kernel records first, producer and harvest
  second. Deciding that before the corpus is read would be guessing.
- Open: whether `verification`/`reliance` (v0.2, still with no producer) are
  subsumed by `check` and `finding`, or remain the narrower claim-hygiene pair.
