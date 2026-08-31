# Tasks — add-stamp-failopen-control

Behavioural change to `checkStamped`'s fail-open branch, gated on a new
repository-level probe. Two existing tests are rewritten. See `design.md`.

## Code this change reasons about

**Evidence:** `packages/claims/src/checkClaims.ts:408@8211685` — `// checked, and only its FAILING verdicts are softened: a checker that`

**Evidence:** `packages/claims/src/checkClaims.ts:412@8211685` — `if (!isFailure(fallback.verdict)) {`

**Evidence:** `packages/claims/src/checkClaims.ts:424@8211685` — `verdict: "unverifiable-rev",`

**Evidence:** `packages/claims/src/checkClaims.ts:185@8211685` — `"unverifiable-rev",`

**Evidence:** `packages/claims/src/runners.ts:149@8211685` — `export function revFileReader(root?: string, timeoutMs = DEFAULT_GIT_TIMEOUT_MS) {`

**Evidence:** `packages/claims/src/revAnchors.test.ts:150@8211685` — `it("does not call an author a fabricator when the commit is not in the clone", () => {`

## Tasks

- [x] 1.1 Add a cached `isShallowRepository` probe to `runners.ts`, spawning
      `git rev-parse --is-shallow-repository` under the existing git timeout.
      Return `null` — not `false` — when git cannot be run, so "cannot probe" is
      distinguishable from "not shallow".
- [x] 1.2 Thread the probe into `CheckDeps` as an optional dependency, so a
      caller that supplies no git reader also supplies no probe and the
      existing fail-open path is what runs.
- [x] 2.1 In `checkStamped`'s `atRev.status !== "ok"` branch: when the fallback
      verdict passes, keep today's behaviour. When it fails, soften to
      `unverifiable-rev` ONLY if the probe reports shallow or cannot answer;
      otherwise return the fallback's failing verdict, with a detail naming
      the unresolvable commit and pointing at the re-pin remedy.
- [x] 2.2 Count stamps that could not be honoured and surface the total in the
      report summary. It is advisory and never changes an exit code.
- [x] 3.1 Fixture: a document whose every claim is invented and stamped
      `@0000000`. It must FAIL on a full-history clone.
- [x] 3.2 Unit tests asserting by name — the bypass document returns
      `fabricated` on a full clone, and `unverifiable-rev` on a shallow one.
      An exit code alone cannot tell these apart
      (`.claude/rules/verdict-needs-fixture-and-test.md`).
- [x] 3.3 Rewrite the two `revAnchors.test.ts` cases that pin the old
      behaviour, preserving what they protected as the shallow-clone scenario.
- [x] 4.1 Correct the forgery paragraph in `spec/evidence-anchors.md` per
      Decision 5, and add the new verdict semantics to its verdict table.
- [x] 4.2 CHANGELOG entry recording this as a security fix, with the bypass
      spelled out — it is already public, so describing it costs nothing and
      omitting it would misrepresent the release.
