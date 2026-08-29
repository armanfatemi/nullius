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
      `MALFORMED` **on a `0.4` journal**. Reuse `STAMP_SHAPE` from
      `parseClaims.ts` rather than re-declaring the pattern — it is currently
      module-private, so export it from the module but **do not add it to
      `index.ts`**: the public barrel re-exports by explicit name list, and
      this is an internal constant. Do not reach for the anchor *marker*
      grammar: that one accepts mixed case and folds it, which is the wrong
      rule for a machine-written field
- [ ] 1.2a **Add the version predicate the record loop does not have.** Today
      the declared version selects behaviour in exactly three places —
      `VOCABULARY.get(scan.version)`, its `?? KINDS_V01` fallback, and the
      ledger gate — and none of them is reachable from the `verification`,
      `mutation` or header cases. So tasks 1.2, 1.3 and 1.5 as stated would
      fire on `0.3` journals too, which is the opposite of what 1.12 and the
      spec promise. Introduce one shared "declares 0.4 or later" predicate,
      derived from the same ordered `VERSIONS` list the ledger floor uses, and
      gate all three new rejections on it. One predicate, used four times —
      not four comparisons
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
      `MALFORMED` **on a `0.4` journal** (see 1.2a) and the finding names the
      offending field. Use `nonEmptyString`, **not** `optionalString`: the
      latter maps `""` to `null` and reports nothing, which is how `session`
      and `source` behave today — reuse it here and the new verdict is
      unreachable while fixture 1.7 still exits 1 on its other records, so the
      gap would never surface. This is the third new failure condition in this
      change and it gets the same treatment as the other two — see 1.7
- [ ] 1.5a Argue the resulting asymmetry in the spec text: `session` and
      `source` silently accept `""` while the three identity fields reject it.
      Either justify the split explicitly, or extend the rejection to
      `session`/`source` — in which case that is a fourth tightening and takes
      its own fixture and named test. Do not leave two empty-string policies in
      one record with no stated reason
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
- [ ] 1.8a Two lines in that file go false under this change and are easy to
      miss because neither mentions `0.4`: `:114` ("this build reads `0.1` and
      `0.2`", already stale before this change) and `:228` ("apply only to
      journals declaring `0.3`", contradicted by the ledger floor). Fix both,
      and re-read the fixture table at `:223` for the same class of error
- [ ] 1.9 Write the version-bump rule into `spec/witness-journal.md`: bump on
      the set of valid records — a new kind, a new member of a closed
      vocabulary, or a tightening that invalidates a previously-accepted
      record; not on additive optional metadata. State explicitly that
      optionality of a field does not exempt a change, and that a
      version-gated verdict uses a floor rather than an equality
- [ ] 1.10 Bump to `0.4`: `VERSIONS` gains `"0.4"`, and `VOCABULARY` maps
      it to the **unchanged** `KINDS_V03` — no kind is added, so no new kinds
      constant is created
- [ ] 1.11 Convert the ledger gate at `witness.ts:1077` from
      `scan.version === "0.3"` to a floor covering `0.3` and later. **This is
      the task the bump exists to make safe.** Without it every `0.4` journal is
      silently ungated while CI stays green and every fixture exits as its table
      says. Three things the test must do, because one of them is the whole
      point:
      - Assert **both** verdicts the gate guards — `SUPPRESSED-FINDING` and
        `SILENT-REVIEWER` — by name, in the same test. The gate wraps both
        loops, so pinning one leaves the other exactly as unprotected as it is
        today
      - Assert the **lower** boundary too: a `0.2` journal with an undischarged
        blocker earns *neither* verdict. A `0.3`-only test passes against a
        floor wrongly written as `!== "0.1"`, so the upper boundary alone does
        not prove the floor
      - Compare by **index into the ordered `VERSIONS` list**, never by string
        comparison. `"0.10" >= "0.3"` is false, and a floor that mis-orders a
        future version is the same silent-ungating defect this task exists to
        prevent, deferred
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
- [ ] 3.3a **Reconcile 3.3 with 3.4, which as first written contradict each
      other.** Whether a header is needed at all is decided under the lock, by
      testing the journal file's size — so "resolve before the lock" taken
      literally means resolving on *every* event, which 3.4 forbids. The
      reconciliation is an unsynchronised pre-check: outside the lock, cheaply
      test whether the journal already exists and is non-empty, and resolve
      identity only when it does not. The pre-check may race, and that is
      acceptable precisely because it is only an optimisation — the
      authoritative `needsHeader` decision stays under the lock, and a race
      costs at most one wasted resolution on a session's first appends, never a
      wrong header. Write that reasoning down; a future reader will otherwise
      "fix" the race and reintroduce the per-event git call
- [ ] 3.4 `headerRecord` gains `branch` / `head` / `worktree`; all three
      omitted when git cannot answer. One resolution per session — never per
      event; see 3.3a for how that is achieved without moving work under the
      lock
- [ ] 3.5 `worktree` is SHA-256 of the absolute worktree path, hex, truncated
      to 16 characters, salted with a random salt. Never the path itself, and
      never an unsalted digest — an absolute worktree path is low-entropy
      enough that an unsalted hash is confirmable by preimage guess, which is
      the disclosure the probe corpus redacted
- [ ] 3.5a **Add the salt file to `.gitignore` in the same commit that creates
      it.** `.gitignore` covers `.nullius/runs/` and `.nullius/probes/` and
      nothing else, so a salt written beside the runs directory is committed by
      default — and a committed salt makes the digest reproducible by anyone
      with the repository, voiding the entire preimage argument 3.5 rests on.
      The ignore rule is not a tidiness step; it is the load-bearing half of
      the redaction
- [ ] 3.5b **The salt is per-worktree, not per-clone — say so and check the
      consequence.** `.nullius/` lives in the working tree, so sibling
      worktrees of one clone get different salts and therefore different
      `worktree` values for genuinely different trees, which is correct. But it
      also means the field cannot answer "same tree?" across a re-clone, and
      the design's "per-clone" wording is wrong. Decide deliberately whether
      the salt belongs in the git common directory instead — shared across
      worktrees, which would make identical paths in sibling worktrees collide
      — and record the choice with its reason. Do not leave two different units
      named in two documents
- [ ] 3.6 Test: recording in a non-repository directory writes a valid journal
      with no identity fields and exits 0
- [ ] 3.7 Test: a git call that exceeds the identity timeout leaves the field
      absent, the append succeeds, and the hook exits 0
- [ ] 3.8 **Bump the producer.** `SCHEMA_VERSION` in `packages/kit/src/cli.ts`
      goes from `"0.2"` to `"0.4"`. Without this the hook pack keeps stamping
      `0.2` while writing `0.4`-era identity fields, and every gate this change
      adds fires on no real journal — a schema with no producer, shipped
      alongside the producer that should have emitted it
- [ ] 3.9 **Measure what the producer bump switches on before shipping it.**
      This is the task with the real risk in it. Today the kit writes `0.2`, so
      the ledger verdicts — gated at `0.3` and later — fire on **no journal the
      hook pack has ever produced**. Bumping the producer to `0.4` switches
      them on for live data for the first time. Run `witness validate` across
      the existing `.nullius/runs/*.jsonl` corpus with the header rewritten to
      `0.4`, count what newly fires, and read a sample. Three outcomes, and the
      task is not done until one is chosen in writing:
      - Nothing new fires → record the count and ship
      - `SUPPRESSED-FINDING` / `SILENT-REVIEWER` fire at a rate that reflects
        real recording gaps → ship, and say so in the PR body, because that is
        the verdict doing its job on data it never previously saw
      - They fire pervasively on well-formed runs → the verdicts were tuned
        against a corpus that excluded live hook output, and the bump must not
        land until that is understood. Pause rather than relaxing a verdict
- [ ] 3.10 Test: a journal written by the kit declares `0.4` and validates
      clean, so the producer bump is pinned by something other than a constant
      nobody reads

## 4. Close-out

- [ ] 4.1 `node packages/claims/dist/cli.js check 'openspec/**/*.md'` clean
- [ ] 4.2 `node packages/claims/dist/cli.js check 'README.md' 'spec/**/*.md' --require-markers` clean
- [ ] 4.3 Every fixture in `spec/witness-journal.md`'s table still exits as the
      table says, including the ones that must fail
- [ ] 4.3a Give `v0.4-identity-run.jsonl` its own must-pass line in
      `.github/workflows/ci.yml`, alongside the existing v0.3 pair. A fixture
      checked only by 4.3's manual re-read is a fixture that stops being
      checked the first time someone trusts the table instead of running it
- [ ] 4.4 CHANGELOG entry: the `0.4` bump and why it was required despite every
      new field being optional; the public-surface change to `JournalHeader`;
      and the ledger-gate conversion, which is the part a reader would
      otherwise not know to look for
- [ ] 4.5 Re-point `add-oracle-conservation`'s citation of the version-bump
      rule at `spec/witness-journal.md` rather than this change's `design.md`,
      and re-stamp it. Its current anchor names a file that moves under
      `openspec/changes/archive/` on archive, and the rule's wording has
      changed here besides
