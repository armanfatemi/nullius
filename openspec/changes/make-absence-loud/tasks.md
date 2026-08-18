# Tasks — make-absence-loud

## 1. Convention specs

- [x] 1.1 Write `spec/attestation-ledger.md` — opens with a canonical
      copy-paste ledger block; pinned grammar; verdicts; the `None` rule;
      advertised limits (dead vs. silent vs. withheld is out of scope;
      counted multiplicity)
- [x] 1.2 Write `spec/canary.md` — plant/verify/clear/status; the
      reviewer-jurisdiction rule; verify-outcome table (CAUGHT / MISSED /
      TAINTED, exit codes 0/1/3); merge-guard limits (local-plus-hook only,
      not adversarial-proof; lexical matching; detectability)
- [x] 1.3 Add the new check verdicts (`UNDELIVERED`, `EMPTY-DELIVERY`,
      `UNDECLARED`, `UNKNOWN-REVIEWER`, `CANARY-PRESENT`) to the verdict
      table in `spec/evidence-anchors.md`; the README gets the lane
      description only
- [x] 1.4 Extend the plugin's evidence-anchors authoring skill with a ledger
      authoring section — the skill, not the README, is the delivery vehicle
      for first-try-correct blocks

## 2. Checker — attestation ledger

- [x] 2.1 Opener-gated ledger-block parser in `parseClaims` (reusing the
      fenced-block exclusion; new block-state machinery), `MALFORMED` for
      structurally invalid content inside an activated block, tests
- [x] 2.2 Verdicts `UNDELIVERED`, `EMPTY-DELIVERY`, `UNDECLARED` in
      `checkClaims` with counted multiplicity and the near-match detail on
      `UNDELIVERED`, tests per scenario
- [x] 2.3 `reviewers` vocabulary in config, `UNKNOWN-REVIEWER` with the
      vocabulary quoted in the detail, tests
- [x] 2.4 Findings-path validation through the existing path-safety guard,
      tests
- [x] 2.5 Ledger blocks count as grounding markers (`--require-markers`,
      density report) — a ledger claim is a parsed claim, so the existing
      results-based counting covers it; parse tests assert a ledger-only
      document yields claims

## 3. Checker — canary

- [x] 3.1 Registry module under `.git/nullius/` — single active canary,
      untrusted-content rules (path safety before any use), tests
- [x] 3.2 `canary plant`: claim templates + lexical fact harvesting,
      CI-caught moments excluded, diff-is-only-the-claim property, refusal
      when a canary is active, tests
- [x] 3.3 `canary verify`: taint-before-caught ordering, literal substring
      matching only, exit codes 0/1/3, tests
- [x] 3.4 `canary clear`: byte-exact restore, stale-line refusal, tests
- [x] 3.5 `canary status`: listing and exit semantics, tests
- [x] 3.6 `CANARY-PRESENT` merge guard: synthetic document-level result
      through the existing report path, registry consulted before the
      zero-claim skip, `--probing` suppression, warning for registry entries
      outside the matched set, tests

## 4. Docs and release

- [x] 4.1 README: "make absence loud" lane
- [x] 4.2 `demo`: one sandbox claim per new check verdict (ledger verdicts +
      `CANARY-PRESENT`), output grouped by capability
- [x] 4.3 Widen the report's verdict column (`padEnd(9)` already overflows on
      `COUNT-MISMATCH`; the new names are longer)
- [x] 4.4 Release notes: strict-mode Action users and the unpinned-latest
      policy; `reviewers` config key rejected by older pinned checkers
- [ ] 4.5 Version bump and publish — bump to 0.5.0 done (both packages, alias dep range fixed to ^0.5.0); npm publish awaits the maintainer
