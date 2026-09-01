---
name: project-add-run-ledger-producer
description: Coverage-review state for openspec change add-run-ledger-producer, iteration 5 (post-review, implementation complete)
metadata:
  type: project
---

Implementation landed (uncommitted at HEAD 7968594). Both gaps flagged in
iteration 4 (pre-review) are closed and verified in the actual diff, not just
claimed in tasks.md:
- `agent_definition`'s four values (`read`/`missing`/`unreadable`/`unsafe-name`)
  each get a named `record.test.ts` assertion (~line 656-703), plus the
  containment refusal is asserted as "no read attempted" via a call-recording
  stub.
- The coordinator-kind `origin: "hooks"` wrong-value case and the fallback
  `prompt` id hash shape are both present as named tests in `witness.test.ts`
  and `record.test.ts` respectively.

**Iteration 5 findings, all clean:**
- Every rejection named in tasks.md §1's unit-test line has both a tripping
  fixture line (`v0.6-broken-run.jsonl`, verified 9 records, one rejection
  each) and a named unit test in `witness.test.ts`. Checked by decoding the
  fixture and grepping the test file — not by trusting the task checkbox.
- `hookScript.test.ts`'s hang-bound case skips cleanly via a `command -v
  timeout || command -v gtimeout` probe with a `console.warn`, not a bare
  `it.skip`; GNU `timeout` ships on ubuntu so it genuinely runs on CI. Not a
  test that silently never runs anywhere.
- CI's new `witness ledger` round-trip step proves `SUPPRESSED-FINDING` fires
  in BOTH polarities: validates with the resolution omitted first (asserting
  the verdict by name via `grep -q 'SUPPRESSED-FINDING'` on redirected
  output, separately from the exit-code assertion — the two are intentionally
  decoupled since an unreadable journal also exits non-zero), then adds the
  resolution and asserts `3 self-reported` in the provenance line. This is
  the strongest instance of `verdict-needs-fixture-and-test.md`-style rigor
  seen in this repo's CI to date — the step's own comment names the rule.
- The `PROMPT_TEXT_KEYS` assumption (blocked on an unrun human capture step,
  see tasks.md §0) is isolated correctly: a real payload missing all
  candidate keys produces a loud stderr message naming the assumed keys and
  records nothing, rather than silently misrecording. Confirmed via reading
  `record.ts:845-869`.
- `hookScript.test.ts`'s two stdout-redirect tests are real regression tests
  — confirmed the pre-change `witness-record.sh` line
  (`if ! $runner witness record --root "$root"; then`) carried no `>&2`
  redirect at all, so both would have failed against the parent commit.
- The two "regression test" comments in the diff's file set
  (`identity.test.ts:474`, `witness.test.ts:1160`) both predate this change
  (from `b80f20c` and earlier respectively) — neither is a new claim
  introduced by this diff, so no false-regression-framing risk here.
- ugrep baseline unchanged: exactly 6 `flagConformance.test.ts` failures,
  948 passed elsewhere in claims.

No blockers, no concerns raised this iteration. See
[[verdict-needs-fixture-and-test-is-my-domain]] for the general pattern this
change repeatedly satisfies well.
