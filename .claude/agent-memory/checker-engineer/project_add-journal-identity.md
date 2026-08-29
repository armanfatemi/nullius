---
name: add-journal-identity
description: openspec/changes/add-journal-identity (0.4 schema bump) — pre-review iters 1-3 and the section-1 kernel implementation; both iter-3 blockers closed in the landed code
metadata:
  type: project
---

Pre-review iterations 1-3 (2026-08-29, branch `feat/add-journal-identity`, HEAD 2376b90).

Repaired across iterations: bump to `0.4` (iter 1); version predicate task 1.2a and
`nonEmptyString` over `optionalString` (iter 2, both accepted).

Iteration 3 findings at hand-off:

- **Spec text for the identity fields carries no version qualifier** while the
  `rev` rejections do (spec has a "0.3 keeps old semantics" scenario for those two
  only). Unqualified spec + version-gated tasks = the implementer picks. A `0.3`
  journal with `branch: ""` validates clean today because unknown header keys are
  ignored, so the unqualified reading is a tightening on `0.3`.
- **The mutation-`rev` asymmetry argument generalises**: as written ("a known key
  used wrongly is a producer bug") it would equally oblige rejecting `target` on a
  `dispatch`. The narrow criterion is the specific false belief, not misplacement.
- Ordering of `VERSIONS` (witness.ts:147) is load-bearing for the 1.11 floor but
  nothing pins it; the comment says "schemas this build can read", not ascending.
- Verified sound: gating the header check on the declared version is **not**
  circular — `scanHeader` validates `version` and returns `stop` for unknown ones
  *before* reading any other header field. Unknown versions can never reach the
  ledger gate, so an index floor is safe.
- Kit emits only <=0.2 kinds, so the 0.4 producer bump adds no kernel vocabulary
  obligation; `KIND_INTRODUCED` (derived, first-seen wins) stays correct.
- `packages/kit/src/doctor.ts:711` hardcodes a second `version: "0.2"` header the
  bump tasks (3.8) do not cover. Out of remit, flagged only.

**Why:** this kernel's two failure shapes are a verdict silently ungated by a bump
and a verdict whose condition can never fire; both were live here.
**How to apply:** on post-review, check the version predicate covers the *header*
site, and that the spec text's version qualifier matches the code's gate.

## Section 1 implemented (2026-08-29, from HEAD 8c71f46)

Both iteration-3 blockers closed by the implementation rather than deferred: the
spec delta and `spec/witness-journal.md` now version-qualify the identity-field
rejection, and the mutation-`rev` argument is written in the narrow form (the
false belief `rev` encodes, explicitly *not* "a known key on a record that
cannot carry it") with a test asserting `target` on a `dispatch` stays ignored.

Shapes worth reusing:

- One `versionAtLeast(version, floor)` predicate comparing by index into
  `VERSIONS`, four call sites — the three 0.4 rejections plus the ledger floor.
  A named per-version wrapper was rejected as a second place to get it wrong.
- Both `rev` rejections **report and fall through** to the hash map rather than
  `break`ing like every other `malformed` in that switch. Refusing to record a
  well-formed target over a bad extra key would trade a loud MALFORMED for a
  silenced STALE-VERIFICATION — the wrong direction in this validator. Tests
  pin it ("still lets the verification go stale").
- The compat pair (`v0.3-compat-run.jsonl` / `v0.4-broken-run.jsonl`) is byte
  identical apart from the declared version, and a test asserts that identity.
  Either fixture alone passes with the version predicate written backwards.

**Why:** these are the two calibration decisions a future diff to this file is
most likely to undo silently.
**How to apply:** if a later change makes a new rejection `break` in that switch,
ask which other verdict loses its evidence.

See [[add-wiring-malformed-input]] for the same PASSING-calibration shape.

## Section 2 implemented — `witness survey` (2026-08-29, from HEAD 554c3ac)

Shapes worth reusing:

- `surveyJournals(inputs: {path, content}[])` is pure and calls `validateJournal`
  once per journal inside its own loop, so "never merge records" is structural
  rather than a rule someone has to remember. Globbing and `readFileSync` stayed
  in `cli.ts`; `witness.ts` still has zero `node:fs`.
- **The Decision-1 test needs a second test to stay honest.** The no-STALE
  assertion passes trivially against a correct *and* an incorrect fixture, so a
  companion test asserts the merged timeline of the same three records (A's
  verification t1, B's mutation t2, A's reliance t3) *does* produce
  `stale-verification`. Without it the regression test goes decorative the day
  someone reorders the fixture. Same lesson as the 0.3/0.4 compat pair.
- No new `JournalVerdict`, no new PASSING member: a survey fails iff a journal
  in it fails, by the same `isJournalFailure` per finding. A survey-level verdict
  would have been a second place for pass and fail to disagree.
- `unsupported-version` journals are held apart from the zero-terminal list.
  Their counts are zero because nothing below the header was read, so filing
  them under "reached no terminal record" would be a summary standing in for
  work not done.
- `--expect-rules` on a survey is refused (exit 2), not ignored — silently
  dropping it reports a coverage check that never ran.
- Help-block gotcha: `cli.characterization.test.ts` counts exactly one
  `example:` line per command block (7 total). A second subcommand documents its
  invocation inline in its description, as `RULES_HELP` already does. The usage
  *error* string keeps the literal prefix `usage: nullius witness validate` on
  line 1 and adds the survey form on line 2, so three existing characterization
  tests keep passing unedited.
- `outcomes.noReport` counts a `report` record whose `outcome` is `"no-report"`.
  A dispatch with no terminal record earns `no-terminal` and contributes
  *nothing* to the outcome triple — easy to assume otherwise when writing tests.

**Why:** section 2's whole risk is an implementation that concatenates, and a
test that cannot detect one.
**How to apply:** on post-review, check the merged-timeline companion test still
trips, and that no survey-level verdict has appeared.

## Post-review (2026-08-29, HEAD 22d9625) — no blockers

Both pre-review shapes held. Confirmed structural, worth reusing:

- All four `versionAtLeast` call sites see only a version already in `VERSIONS`,
  because `scanHeader` returns `stop` for unknown ones *before* any of them run.
  So "unknown fails closed" is belt-and-braces, not the load-bearing guard.
- The two `rev` fall-throughs add **zero** state: `verified.set`/`hashes.set`
  were already there, unmoved. The only asymmetry is that a record malformed in
  both target *and* rev reports the target only (target check `break`s first).
- `unreadable ⇒ zero counts` is structural, not incidental: `unsupported-version`
  is pushed from exactly one place (the `scan.stop` path), and that path returns
  hard zeros. So `surveyJournals` can sum unreadable journals unconditionally.
- `STAMP_SHAPE` having no `g`/`y` flag became load-bearing when `witness.ts`
  started sharing it — a stateful regex would make `surveyJournals` order-dependent
  across journals in one process.

Open concerns handed to the human (none blocking): survey dedupes paths by raw
glob string not resolved path (two spellings double-count); `readFileSync` on a
glob match that is a directory throws EISDIR uncaught; explicit JSON `null` for
an identity field is MALFORMED at 0.4 but the spec only covers omitted vs `""`.

**Why:** post-review found nothing the pre-review missed in kernel semantics; the
residue is all CLI-edge, which is where the next defect in this area will live.
**How to apply:** if survey grows a second input source, check the dedupe key first.
