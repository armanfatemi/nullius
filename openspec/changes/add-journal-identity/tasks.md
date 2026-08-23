# Tasks — add-journal-identity

Two parts, each standing alone: the schema (section 1) and the roll-up
(section 2). Section 3 is the kit's share of the schema half — writing the
identity fields it now knows how to read. Ref-backed sealing was section 3's
other half and is now `add-journal-sealing`.

## 1. Kernel — schema

- [ ] 1.1 Header scan reads optional `branch`, `head`, `worktree`; unknown
      header keys stay ignored (they already are — add the regression test that
      pins it)
- [ ] 1.2 `verification` accepts optional `rev`, validated against the same
      7–40 lower-case-hex grammar `parseClaims` uses for anchors; a ref name is
      `MALFORMED`
- [ ] 1.3 `mutation` rejects `rev` — its hash is the identity of what changed
- [ ] 1.4 `JournalHeader` gains the three fields; `JournalReport` surfaces them
      so `survey` can group without re-parsing
- [ ] 1.5 Fixture: `v0.3-identity-run.jsonl` — a sealed-shape journal carrying
      all three header fields and a rev-stamped verification, exit 0
- [ ] 1.6 Fixture: extend `v0.3-broken-run.jsonl` with a `rev: "main"`
      verification and a `mutation` carrying `rev`; assert both verdicts in a
      unit test, because CI only checks the broken fixture's exit code
- [ ] 1.7 Update `spec/witness-journal.md`: the three fields, `verification.rev`,
      and the definition of `head` as *where the run began* — in the spec text,
      not a comment
- [ ] 1.8 Write the version-bump rule into the spec (bump on the set of valid
      records; not on additive optional metadata)

## 2. Kernel — survey

- [ ] 2.1 `witness survey <glob>`: validate each journal independently, collect
      reports, never concatenate records
- [ ] 2.2 Output — three outcome counts kept three, journal count in the same
      block as the totals, per-journal pass/fail, journals with zero terminals
      listed by name
- [ ] 2.3 Exit code: non-zero when any surveyed journal fails, so it is usable
      as a CI gate
- [ ] 2.4 Per-command `--help` with one example invocation, matching the funnel
      convention in `add-authoring-ergonomics`
- [ ] 2.5 Test: journal A verifies and relies on `src/parser.rs`, journal B
      mutates it; surveying both reports no `STALE-VERIFICATION`. This is the
      regression test for Decision 1 and the reason `survey` exists as its own
      verb
- [ ] 2.6 Characterization test: `witness validate` still takes exactly one path

## 3. Kit — identity

- [ ] 3.1 A git helper with one rule: every call best-effort, bounded by a
      timeout, never throws into the append path. Decide first whether to reuse
      the kernel's bounded-git reader rather than build a second one — the
      dependency direction is already kit → kernel, and two implementations of
      one discipline is what the single-delivery-mechanism rule exists to stop
- [ ] 3.2 `headerRecord` gains `branch` / `head` / `worktree`; all three omitted
      when git cannot answer. One `rev-parse` per session, at first append —
      never per event
- [ ] 3.3 `worktree` is a short hash of the absolute worktree path, never the
      path itself
- [ ] 3.4 Test: recording in a non-repository directory writes a valid
      headerless-of-identity journal and exits 0

## 4. Close-out

- [ ] 4.1 `node packages/claims/dist/cli.js check 'openspec/**/*.md'` clean
- [ ] 4.2 `node packages/claims/dist/cli.js check 'README.md' 'spec/**/*.md' --require-markers` clean
- [ ] 4.3 Every fixture in `spec/witness-journal.md`'s table still exits as the
      table says, including the ones that must fail
- [ ] 4.4 CHANGELOG entry: additive, no schema version bump, and why — and
      note the public-surface change separately, since `JournalHeader` and
      `JournalReport` are both exported and gaining fields
- [ ] 4.5 Confirm `add-oracle-conservation`'s anchor into this change's
      `design.md:115` still verifies; it cites the version-bump rule this
      change writes down
