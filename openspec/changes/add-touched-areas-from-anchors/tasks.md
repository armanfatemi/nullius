# Tasks — add-touched-areas-from-anchors

No new command, no new verdict, no `routeAgents` signature change. See
`design.md` Decision 1.

## Code this change reasons about

**Evidence:** `packages/kit/src/pipeline.ts:129@2792fa1` — `` const PATH_TOKEN = /`([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(?:ts|md|json|jsonl|ya?ml|sh))`/g; ``

**Evidence:** `packages/kit/src/pipeline.ts:131@2792fa1` — `export function touchedPaths(text: string): string[] {`

**Evidence:** `packages/kit/src/pipeline.ts:15@2792fa1` — `import { scanRules, selectRules } from "@nullius-inverba/claims";`

**Evidence:** `packages/claims/src/parseClaims.ts:319@2792fa1` — `export function parseClaims(doc: string, content: string): Claim[] {`

## 0. Prerequisites / setup

- [ ] 0.1 `pnpm build` and confirm the baseline (kit: 258/258 tests passing,
      per `CLAUDE.md`).

## 1. touchedPaths union

- [ ] 1.1 Import `parseClaims` from `@nullius-inverba/claims` in
      `pipeline.ts`, alongside the existing `scanRules`/`selectRules`
      import. Union `PATH_TOKEN` matches with `presence`-kind claims'
      `.path` field, per `design.md` Decision 1's illustrative sketch.
      Confirm this does not require a new `packages/kit/package.json`
      dependency (the import already exists at line 15; `parseClaims` is
      exported from the same package root).

## 2. Tests

- [ ] 2.1 `pipeline.test.ts`: `touchedPaths` extracts a path from a
      canonical `**Evidence:**` citation (`path:LINE@rev` and bare
      `path:LINE` forms) that today produces zero matches — pin the
      before/after behavior explicitly, quoting the exact citation string
      the proposal's own `design.md` used to demonstrate the gap.
- [ ] 2.2 `pipeline.test.ts`: `touchedPaths` still extracts a bare
      backticked filename with no `**Evidence:**` marker (regression guard
      for the existing `PATH_TOKEN` scan — must not be dropped or narrowed).
- [ ] 2.3 `pipeline.test.ts`: a path cited both ways (bare filename
      elsewhere in prose, and again inside an `**Evidence:**` marker)
      appears exactly once in the result (de-duplication across the two
      sources).
- [ ] 2.4 `pipeline.test.ts`: re-run (or add, if absent) a `routeAgents`
      end-to-end case using this repository's real
      `openspec/changes/*/tasks.md` "Code this change reasons about"
      sections as input, confirming a reviewer that was previously dropped
      because its only cited path lived inside an Evidence Anchor is now
      routed. `add-rules-compliance`'s `pipeline.test.ts` rewrite against
      this repo's real `.claude/rules/*.md` is the precedent for testing
      against real repository content rather than synthetic fixtures.

## 3. Documentation

- [ ] 3.1 `.claude/skills/proposal-to-pr/SKILL.md`'s description of
      `touched-areas`/`route` (the "two command lines" section) — confirm
      no wording change is needed; if the doc currently implies "prose
      mentions" without qualifying which citation forms count, tighten it.

## 4. Verification

- [ ] 4.1 Full kit test suite, type-check, both anchor gates, per
      `CLAUDE.md`.
- [ ] 4.2 Manually run `node packages/kit/dist/cli.js pipeline touched-areas
      <an-existing-change>` before and after, on a real change whose
      `tasks.md` cites files only through Evidence Anchors, to confirm the
      output set grows and does not shrink.
