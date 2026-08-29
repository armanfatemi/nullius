# Tasks — add-journal-identity

Two parts, each standing alone: the schema (section 1) and the roll-up
(section 2). Section 3 is the kit's share of the schema half — writing the
identity fields it now knows how to read. Ref-backed sealing was section 3's
other half and is now `add-journal-sealing`.

**Section 1 grew after pre-review.** The change tightens record validity, so it
bumps the schema to `0.4`, and the bump drags in a version gate written as
exact string equality. Tasks 1.9–1.11 are that bump; 1.11 is the one that stops
it going wrong silently.

## 1. Kernel — schema

- [ ] 1.1 Header scan reads optional `branch`, `head`, `worktree`; unknown
      header keys stay ignored (they already are — add the regression test that
      pins it)
- [ ] 1.2 `verification` accepts optional `rev`, validated against the
      lower-case-hex 7–40 stamp shape; a ref name such as `main` is
      `MALFORMED`. Reuse `STAMP_SHAPE` from `parseClaims.ts` rather than
      re-declaring the pattern — it is currently module-private, so export it
      first. Do not reach for the anchor *marker* grammar: that one accepts
      mixed case and folds it, which is the wrong rule for a machine-written
      field
- [ ] 1.3 `mutation` rejects `rev` — its hash is the identity of what changed.
      Note this is a new failure *condition*, not a reuse: every existing
      `malformed` fires on a missing or ill-shaped declared field, and none
      rejects a well-formed extra key. Argue the asymmetry with 1.1's
      ignore-unknown-header-keys rule in the spec text, since a reader will
      otherwise read it as an inconsistency
- [ ] 1.4 `JournalHeader` gains the three fields. **Do not add them to
      `JournalReport`** — it already carries `header`, so `survey` can group
      without re-parsing today; a second copy at report level could diverge
      from the first
- [ ] 1.5 A present identity field must be a non-empty string; `branch: ""` is
      `MALFORMED` and the finding names the offending field. This is the third
      new failure condition in this change and it gets the same treatment as
      the other two — see 1.6
- [ ] 1.6 Fixture: `v0.4-identity-run.jsonl` — a journal carrying all three
      header fields and a rev-stamped verification, exit 0. Pair it with a unit
      test that asserts the three fields are parsed and reach
      `JournalReport.header`; exit 0 alone is also what an empty file scores
- [ ] 1.7 Fixture: extend the broken-run corpus with a `rev: "main"`
      verification, a `mutation` carrying `rev`, and a header with `branch: ""`.
      Assert **all three** verdicts by name in a unit test — CI only checks the
      broken fixture's exit code, which stays 1 while any one of them fires.
      Scope note: this closes the gap for the records added here and not for
      the twenty-six pre-existing findings, which stay exit-code-only
- [ ] 1.8 Update `spec/witness-journal.md`: the three fields,
      `verification.rev`, and the definition of `head` as *where the run began*
      — in the spec text, not a comment. This file is the canonical home of the
      version-bump rule (see 1.9), because `design.md` moves under
      `openspec/changes/archive/` and any cross-change citation into it rots
- [ ] 1.9 Write the version-bump rule into `spec/witness-journal.md`: bump on
      the set of valid records — a new kind, a new member of a closed
      vocabulary, or a tightening that invalidates a previously-accepted
      record; not on additive optional metadata. State explicitly that
      optionality of a field does not exempt a change, and that a
      version-gated verdict uses a floor rather than an equality
- [ ] 1.10 Bump to `0.4`: `VERSIONS` gains `"0.4"`, and `KINDS_BY_VERSION` maps
      it to the **unchanged** `KINDS_V03` — no kind is added, so no new kinds
      constant is created
- [ ] 1.11 Convert the ledger gate at `witness.ts:1077` from
      `scan.version === "0.3"` to a floor covering `0.3` and later, and assert
      with a named unit test that a `0.4` journal still earns a ledger verdict.
      **This is the task the bump exists to make safe.** Without it every `0.4`
      journal is silently ungated for `SILENT-REVIEWER` and `SUPPRESSED-FINDING`
      while CI stays green and every fixture exits as its table says
- [ ] 1.12 Confirm the `0.3` fixtures still validate identically — a `0.3`
      journal carrying `rev` keeps passing, because the new rejections are
      `0.4` semantics

## 2. Kernel — survey

- [ ] 2.1 `witness survey <glob>`: validate each journal independently, collect
      reports, never concatenate records. Glob expansion and file reads live in
      `cli.ts`, as `validate`'s do — `witness.ts` has no `node:fs` today and
      keeps none
- [ ] 2.2 Output — three outcome counts kept three, journal count in the same
      block as the totals, per-journal pass/fail, journals with zero terminals
      listed by name
- [ ] 2.3 Exit code: non-zero when any surveyed journal fails, so it is usable
      as a CI gate. `runWitness` already derives this from `isJournalFailure`
      per finding; reuse it per journal rather than inventing a second rule
- [ ] 2.4 Per-command `--help` with one example invocation, matching the
      `options:` / `example:` funnel convention already in `WITNESS_HELP`
- [ ] 2.5 Test: journal A verifies `src/parser.rs` **and relies on it**; journal
      B mutates it. Surveying both reports no `STALE-VERIFICATION`. Two things
      make this test real rather than decorative: `STALE-VERIFICATION` is only
      reachable from the `reliance` branch, so A needs both records; and B's
      mutation must fall **chronologically between** A's verification and A's
      reliance, or a naive concatenation that preserves per-journal order would
      pass without being correct. This is the regression test for Decision 1
- [ ] 2.6 Characterization test: `witness validate` still takes exactly one
      path. Use the existing `cli.characterization.test.ts` pattern, which
      already spawns `dist/cli.js`; no CLI refactor is needed

## 3. Kit — identity

- [ ] 3.1 A git helper with one rule: every call best-effort, bounded, and
      never able to throw into the append path. The kernel's `revFileReader` is
      **not** the reuse candidate — it reads a file at a rev and cannot answer
      branch, head or worktree; `headRev` covers `head` only, and `branch` and
      `worktree` need new calls. Reuse the kernel's bounded-spawn discipline,
      not that function, and give this helper its own budget (see 3.2)
- [ ] 3.2 The identity timeout is in the hundreds of milliseconds, strictly
      below the lock's `DEFAULT_WAIT_MS` of 2 000 — **not** the kernel's
      `DEFAULT_GIT_TIMEOUT_MS` of 10 000, which is five times the deadline at
      which a waiting hook's append is refused outright
- [ ] 3.3 Resolve identity **before** the append lock is acquired and pass it
      to `headerRecord` as data. `headerRecord` stays a pure function of its
      draft and never spawns a process. Test that no git invocation occurs
      while the lock is held
- [ ] 3.4 `headerRecord` gains `branch` / `head` / `worktree`; all three
      omitted when git cannot answer. One resolution per session, at first
      append — never per event
- [ ] 3.5 `worktree` is SHA-256 of the absolute worktree path, hex, truncated
      to 16 characters, salted with a per-clone random salt stored beside the
      runs directory and never committed. Never the path itself, and never an
      unsalted digest — an absolute worktree path is low-entropy enough that an
      unsalted hash is confirmable by preimage guess, which is the disclosure
      the probe corpus redacted
- [ ] 3.6 Test: recording in a non-repository directory writes a valid journal
      with no identity fields and exits 0
- [ ] 3.7 Test: a git call that exceeds the identity timeout leaves the field
      absent, the append succeeds, and the hook exits 0

## 4. Close-out

- [ ] 4.1 `node packages/claims/dist/cli.js check 'openspec/**/*.md'` clean
- [ ] 4.2 `node packages/claims/dist/cli.js check 'README.md' 'spec/**/*.md' --require-markers` clean
- [ ] 4.3 Every fixture in `spec/witness-journal.md`'s table still exits as the
      table says, including the ones that must fail
- [ ] 4.4 CHANGELOG entry: the `0.4` bump and why it was required despite every
      new field being optional; the public-surface change to `JournalHeader`;
      and the ledger-gate conversion, which is the part a reader would
      otherwise not know to look for
- [ ] 4.5 Re-point `add-oracle-conservation`'s citation of the version-bump
      rule at `spec/witness-journal.md` rather than this change's `design.md`,
      and re-stamp it. Its current anchor names a file that moves under
      `openspec/changes/archive/` on archive, and the rule's wording has
      changed here besides
