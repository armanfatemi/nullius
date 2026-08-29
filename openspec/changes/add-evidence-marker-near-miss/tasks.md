# Tasks — add-evidence-marker-near-miss

No new `Verdict` member; this routes previously-invisible lines into the
existing `malformed` path. See `design.md` Decision 1 for the detection
approach and its false-positive constraint.

## Code this change reasons about

**Evidence:** `packages/claims/src/parseClaims.ts:110@2792fa1` — `const EVIDENCE_PREFIX = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?\*\*Evidence:\*\*/;`

**Evidence:** `packages/claims/src/parseClaims.ts:397@2792fa1` — `    if (!EVIDENCE_PREFIX.test(raw)) continue;`

**Evidence:** `packages/claims/src/parseClaims.ts:453@2792fa1` — `    claims.push({ kind: "malformed", raw: raw.trim(), source });`

**Evidence:** `packages/claims/src/checkClaims.ts:178@2792fa1` — `const PASSING: ReadonlySet<Verdict> = new Set<Verdict>([`

## 0. Prerequisites / setup

<!-- Tasks to be filled during Stage 2 refinement or before Stage 4 implementation -->

- [ ] 0.1 `pnpm build` and confirm the baseline (765 kernel tests passing, 6
      known ugrep-baseline `flagConformance` failures, per `CLAUDE.md`).

## 1. Near-miss detection

- [ ] 1.1 Add `EVIDENCE_NEAR_MISS` in `parseClaims.ts`, checked only when
      `EVIDENCE_PREFIX.test(raw)` is false, at line 397's `continue`. On a
      match, push `{ kind: "malformed", raw: raw.trim(), source }` instead of
      `continue`-ing.
- [ ] 1.2 Resolve the exact pattern per `design.md` Decision 1 — start with
      the parenthetical-label case, extend to the other two hypothesized
      variants only if the false-positive test set (below) stays clean.
      Write the false-positive test cases FIRST (ordinary prose containing
      "evidence" with no adjacent emphasis), before the near-miss cases —
      the failure mode this proposal exists to avoid is a detector that is
      too eager, and a test suite written catch-cases-first is more likely
      to under-test the "must NOT fire" side.

## 2. Unit tests

- [ ] 2.1 `parseClaims.test.ts`: the parenthetical-label near-miss
      (`**Evidence (Decision 4):**`) produces a `malformed` claim, matching
      the existing pattern at lines ~124, ~300, ~475 for other malformed
      shapes.
- [ ] 2.2 `parseClaims.test.ts`: if 1.2 extends coverage, one case per
      additional variant (`**Evidence**:`, `*Evidence:*`).
- [ ] 2.3 `parseClaims.test.ts`: false-positive guard — a line of ordinary
      prose containing the word "evidence" (lowercase, and capitalized) with
      no adjacent `*` or unexpected `:` produces no claim at all (not even
      `malformed`), same as today.
- [ ] 2.4 `checkClaims.test.ts`: a document containing only a near-miss
      marker line produces `isFailure(...) === true` end to end (extraction
      through to verdict), not just at the parser layer.

## 3. Fixtures and CI gate

- [ ] 3.1 Add a case to `spec/fixtures/broken-run.jsonl`'s sibling document
      fixtures (or the nearest equivalent under `spec/fixtures/`) carrying a
      near-miss marker, so `nullius check` on that fixture reports
      `malformed` — confirm which existing fixture family this belongs to
      before adding a new one (`add-rules-compliance`'s and
      `add-silent-rule-check`'s `tasks.md` are the most recent precedent for
      fixture placement in this repo).
- [ ] 3.2 Confirm the CI dogfood gate (`.github/workflows/ci.yml`'s
      `nullius check (self)` step) would have failed on the real incident's
      exact line, as a regression check.

## 4. Documentation

- [ ] 4.1 `spec/evidence-anchors.md`: note that a near-miss marker is
      reported as `malformed`, in the section documenting the `malformed`
      verdict, so the spec's own description of the grammar stays accurate.
- [ ] 4.2 CHANGELOG.md: an entry stating this is a deliberate strictness
      increase (see `design.md` Decision 1's "Behavior consequence"), not a
      regression — a document that silently passed with an accidental
      near-miss marker will now fail loudly.

## 5. Verification

- [ ] 5.1 Full test suite, type-check, both anchor gates
      (`check 'README.md' 'spec/**/*.md' --require-markers`,
      `check 'openspec/**/*.md'`), per `CLAUDE.md`.
- [ ] 5.2 Re-run `check` against this proposal's own `design.md` and
      `tasks.md` to confirm none of the `**Evidence:**` markers written
      above are themselves near-misses (dogfooding the fix on the document
      that describes it).
