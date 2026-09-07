# Tasks — report-unhonoured-stamps

## 1. Carry the fact out of the checker

- [x] 1.1 In `checkStamped`, mark the result when the stamped commit could not
      be read, on **both** paths — the borrowed-passing return and the failing
      one. Today only the failing path records it, in prose inside a detail
      string, which is the asymmetry this change exists to remove.
- [x] 1.2 Carry the clone state (`shallow` / `full` / `undeterminable`)
      alongside it, from the probe `cli.ts` already caches once per run. Do not
      add a second git call, and do not ask when no stamp went unhonoured.
- [x] 1.3 Do not add a verdict. The anchor's verdict stays whatever the
      working-tree fallback returned — see Decision 1.

## 2. Surface it

- [x] 2.1 Add the total, and the clone state, to the shared summary in
      `checkReport.ts` that the card and JSON both render from.
- [x] 2.2 Card: state the total, and name the remedy that fits the clone —
      `fetch-depth: 0` when shallow, re-pinning when not, and neither when
      shallowness could not be determined.
- [x] 2.3 JSON: add the field. Keep it additive; the document is version-tagged
      and consumers must not break.
- [x] 2.4 Plain report: correct the closing line so a run with unhonoured stamps
      does not assert that all grounding markers were verified, and print the
      total and remedy beneath it.
- [x] 2.5 Say nothing at all when no stamp went unhonoured. A project with no
      stamps must not gain a line.

## 3. Prove it

- [x] 3.1 Unit test asserting the total **by name** for the passing case: an
      unreadable stamp whose quote matches the working tree yields verdict `ok`,
      exit 0, and a reported total of 1. An exit code cannot distinguish this
      from an honoured stamp, which is the whole defect
      (`.claude/rules/verdict-needs-fixture-and-test.md`).
- [x] 3.2 Unit tests for each clone state, asserting which remedy is named —
      including that the undeterminable state names neither.
- [x] 3.3 Unit test that a run with no stamped anchors reports no total.
- [x] 3.4 Unit test that the total never changes the exit code.
- [x] 3.5 Tighten the existing CI step for `spec/fixtures/.rev-lane/short-sha.md`
      to grep for the reported total rather than only checking its exit status.
      Leave the fixture itself unchanged — it is already the right fixture.

## 4. Write it down

- [x] 4.1 Update `spec/evidence-anchors.md` where it describes what a run reports
      about stamps, so the spec and the output agree.
- [x] 4.2 Note the reported total in `action/README.md`, next to the checkout-depth
      guidance it makes actionable — a shallow adopter now has a way to notice.
- [x] 4.3 Re-run every dogfooding gate. The repo's own `openspec/**` check
      carries 105 `stale` verdicts today; confirm the new line reports 0
      unhonoured stamps there, since those commits all resolve.
