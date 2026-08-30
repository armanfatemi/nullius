# Tasks — add-oracle-conservation

Kernel work, plus one `doctor` line in the kit and one Action input. Independent
of `add-journal-identity` and `add-rules-compliance`. It reads a journal and adds
no verdict to `witness`, but it does bump the journal schema to `0.5` — the
new-verdict trigger fires because `MALFORMED-JUSTIFICATION` reads `justifies` and
fails a `decision` record on it. See design Decision 3.

## 1. Config

- [ ] 1.1 `oracles` key: array of `{glob, weakening?, skipMarker?}`. Config
      plumbing is **four hops, not two**: the interface declaration, `KNOWN_KEYS`,
      the `parseConfig` assignment branch, and the forwarding at the `cli.ts`
      layer. `configVersion` is the cautionary case — present in `KNOWN_KEYS` and
      on the interface, with no assignment branch, and silently dropped. A key
      that clears the first three hops still never reaches the command
- [ ] 1.2 Per-entry sub-key validation is **new machinery**: `config.ts` today
      checks top-level keys only, and every existing value is a string or string
      array. `oracles` is the first array-of-objects value; write the nested
      validator and reject unknown sub-keys with the same loud error shape
- [ ] 1.3 Absent `oracles` is a reported state, never an empty result set —
      wire it into the command's output and into `doctor` as `??`
- [ ] 1.4 A glob with no `weakening` states that `weakened` went unchecked for
      it; a silent two-thirds check is the failure this repo is named after

## 2. Classification

- [ ] 2.1 Range diff against declared globs — name-status, so renames and
      deletions are distinguishable from edits
- [ ] 2.2 `deleted` — present at base, absent at head
- [ ] 2.3 `skipped` — declared skip marker count increased across the range
- [ ] 2.4 `weakened` — declared `weakening` count decreased across the range;
      message names the pattern and both counts so a false positive is
      dismissible in seconds
- [ ] 2.5 Advisory listing for every other change to a declared oracle
- [ ] 2.6 The core is pure and takes an injected deps object (design Decision 8):
      name-status entries, file-at-rev contents, and the config in;
      classifications out. No git spawn inside the core
- [ ] 2.7 New git plumbing in the binding layer — `runners.ts` has `git show` and
      `headRev` only, no name-status diff, and its revision guard is hex-only so a
      `base..head` range string cannot pass it as written. Same timeout and cache
      discipline as the anchor path
- [ ] 2.8 Output states the classes it detects, never the reductions that are
      possible — a rename out of a glob and a glob removed from `oracles` both
      reduce detection and are unclassified (design Decision 5)

## 3. Justification matching

- [ ] 3.1 `decision.justifies` reader lives in the **oracle** module, not in
      `witness.ts`: `{path, change}`, `change` closed to the three classes
- [ ] 3.2 Match hard changes against decisions on the derived `(path, change)`
      pair — never on a record id
- [ ] 3.3 Two hard classes on one path need two decisions
- [ ] 3.4 A blank `path` or an unrecognised `change` discharges nothing and is
      reported `MALFORMED-JUSTIFICATION` — a mistyped class must be visible,
      not inert
- [ ] 3.5 `OracleVerdict` union with `UNJUSTIFIED-ORACLE-CHANGE` **and**
      `MALFORMED-JUSTIFICATION`, plus its own `PASSING` set carrying a written
      argument for each member's placement; the exported `Verdict` is untouched
- [ ] 3.6 `isOracleFailure` answers from `PASSING` membership, and `PASSING` must
      have a complement: `MALFORMED-JUSTIFICATION` is excluded and fails with no
      flag set. A set containing every member makes the predicate constant-false
      and hands the decision back to `--strict`
- [ ] 3.8 `MALFORMED-JUSTIFICATION` is raised by reading the journal, not by
      matching a diff entry — a verdict conditional on a match is unreachable in
      the case the typo caused
- [ ] 3.9 Name the result carrier. The union's two members attach to different
      subjects — `UNJUSTIFIED-ORACLE-CHANGE` to a changed path,
      `MALFORMED-JUSTIFICATION` to a journal record — and `isOracleFailure` needs
      one type to range over. The precedent is `WiringFinding` in
      `packages/claims/src/wiring.ts`, which already unifies agents, paths, globs
      and hook commands under one artifact/line/subject shape — a heterogeneous
      subject is normal in this kernel, not a departure from it. An earlier draft
      of this task cited `rules.ts`'s single-subject union as the norm, which was
      wrong
- [ ] 3.7 Regression test: `witness validate` output is byte-identical for a
      journal carrying `justifies` and one without it, including the malformed
      case — the journal must not read the field at all

## 4. Command and output

- [ ] 4.1 `nullius oracle <range> [--journal <path>] [--config <path>] [--strict]`.
      `--config` is required, not optional polish: config resolution is
      `explicitPath ?? DEFAULT_CONFIG_PATH` where the default is the bare
      cwd-relative `nullius.config.json`, and `--config` is currently parsed only
      for `check` and `audit`. Without it, CI cannot point this verb at a fixture
      config and task 6.2a's arm silently takes the absent-`oracles` path
- [ ] 4.1a State `--journal`'s default explicitly: omitted, no journal is read.
      Report that **on the run line**, not only in the docs. A clean run with no
      journal otherwise reads as "no malformed justifications", which is a silent
      zero of the same species task 1.3 forbids for an absent `oracles` key
- [ ] 4.2 `--strict` widens what fails; it is not the sole failure mechanism
- [ ] 4.3 The pass line states the limit — a reason was recorded, not assessed
- [ ] 4.4 Per-command `--help` with one example, matching the funnel convention
- [ ] 4.5 `--format json` if `add-authoring-ergonomics` has landed; otherwise
      leave the hook and do not invent a second output shape

## 4b. Schema bump

- [ ] 4b.1 Add `"0.5"` to `VERSIONS` in `packages/claims/src/witness.ts`. Append;
      never replace a member — every previously accepted version stays accepted
- [ ] 4b.2 `witness validate` gains no finding and reads no new field. The bump is
      the new-verdict trigger firing, not a tightening; a `0.4` journal must
      validate byte-identically before and after
- [ ] 4b.3 Fixture pair for `0.5`, matching the shape the existing versions use in
      `.github/workflows/ci.yml`: a `v0.5-run.jsonl` that must pass and a
      `v0.5-broken-run.jsonl` that must fail
- [ ] 4b.4 A `0.5` journal carrying a well-formed `justifies`, asserting the field
      is accepted and uninterpreted
- [ ] 4b.5 Assert an above-`0.5` version is still refused as unsupported — the
      guard must move with the bump rather than being widened
- [ ] 4b.6 CI: add the `0.5` pair to the witness gates alongside the `0.3`/`0.4`
      rows, both polarities
- [ ] 4b.7 `spec/witness-journal.md`: record `0.5`, and record the trigger as the
      new-verdict clause. Do not paraphrase the versioning rule there or anywhere
      else — it is the canonical statement

## 5. Fixtures and tests

- [ ] 5.1 Unit fixtures as **plain data through the injected seam** (design
      Decision 8): a justified deletion, an unjustified weakening, a skipped
      test, and an added test that must raise nothing. No `.git` directory is
      committed and no repo is synthesized at test time
- [ ] 5.2 A deletion with no `mutation` record in the journal, proving the git
      source catches what the hook tier cannot — this is the change's whole
      premise
- [ ] 5.3 Task 5.2 gets its **own named assertion**, not coverage by the general
      sweep in 5.4: the test asserts `UNJUSTIFIED-ORACLE-CHANGE` fires for the
      no-mutation-record path specifically, and fails if that premise stops
      holding
- [ ] 5.4 Assert every `OracleVerdict` in a unit test by name, not only via an
      exit code — including `MALFORMED-JUSTIFICATION`, which carries the load for
      CI's negated arm
- [ ] 5.6 A `.jsonl` journal fixture with a malformed `justifies`, in
      `spec/fixtures/`, so the negated CI arm has a static artefact and the
      `verdict-needs-fixture-and-test` glob has something to match
- [ ] 5.6a **Create `spec/fixtures/oracle-broken/` as a directory**, carrying a
      `nullius.config.json` that declares `oracles` plus the 5.6 journal. Nothing
      currently creates it, and no `nullius.config.json` exists anywhere under
      `spec/fixtures/`. The existing negated-arm fixtures are directories with
      nested trees (`spec/fixtures/wiring-broken/`, `spec/fixtures/rules-broken/`)
      — match that shape. Say explicitly whether the journal is moved into the
      directory or duplicated
- [ ] 5.5 One integration test over the live git reader, so the seam's real
      implementation is exercised somewhere
- [ ] 5.5a A named test for the `base == head` (empty range) case specifically,
      asserting the **combination** CI's negated arm depends on: an empty range
      **plus** a malformed journal still fires `MALFORMED-JUSTIFICATION`. Testing
      only that the empty-range diff does not erupt leaves the actual gated
      scenario without a unit test. Task 2.7 notes the existing revision guard is
      hex-only and cannot take a range string as written, so this path is new

## 6. CI

- [ ] 6.1 Add `oracle` to `.github/workflows/ci.yml`. It is currently the only
      verb with no CI presence at all; `witness`, `check`, `canary`, `wiring` and
      `rules` are each gated with a passing **and** a negated invocation
- [ ] 6.2 The negated arm runs against a static `.jsonl` journal fixture carrying
      a malformed `justifies`, over an empty range. It needs no commit history,
      because `MALFORMED-JUSTIFICATION` is raised from the journal, and it fails
      on the verdict rather than on `--strict`
- [ ] 6.2a **The negated arm must assert on output, not on the exit code alone**,
      and must point the verb at the 5.6a fixture config with `--config`.
      There is no `nullius.config.json` at this repository's root, and task 1.3
      requires an absent `oracles` key to exit non-zero rather than report a clean
      zero — so a bare `! node ... oracle` is satisfied identically by "the verdict
      fired" and by "nothing is configured", and stays green after the verdict
      stops firing. The arm runs against a fixture directory where `oracles` **is**
      declared, and greps the output for the verdict name. A gate that passes for
      the wrong reason is the exact defect
      `.claude/rules/verdict-needs-fixture-and-test.md` exists to prevent, and the
      first draft of this task reproduced it
- [ ] 6.2b Write the exit-code and output assertions as **separate statements**.
      `! cmd | grep -q X` negates the pipeline rather than the command and
      inverts the intended assertion
- [ ] 6.2c Pin the human output format in the arm. Every renderer prints
      `verdict.toUpperCase()`, so the token is a de facto contract — but task
      4.5's `--format json` would render it lowercase and the grep would stop
      matching silently
- [ ] 6.3 Run it on this repository's own range in advisory mode, the way
      `wiring .` dogfoods
- [ ] 6.4 State two limits in the workflow comment and the CHANGELOG. First: the
      negated arm gates `MALFORMED-JUSTIFICATION` only — `UNJUSTIFIED-ORACLE-CHANGE`
      is advisory and asserted by name in the unit suite, so a regression silencing
      it alone would not turn CI red. Second: the arm's exit code alone does not
      distinguish the verdict from an unconfigured project, which is why 6.2a
      asserts on output. Both are known gaps, accepted rather than hidden

## 7. Documentation

- [ ] 7.1 The Evidence-Anchor convention for rationales (design Decision 2) in
      the authoring skill — a convention, deliberately not a verdict
- [ ] 7.2 README: a new row in the verbs table, and the honest one-line limit
      next to it
- [ ] 7.3 Document `weakened`'s crudeness where users meet it, not only in the
      design: merged assertions are a false positive, a gutted assertion body
      is a false negative
- [ ] 7.4 Document that `justifies` is validated by `oracle` and ignored by
      `witness validate`, so nobody looks for a journal finding that will not come

## 8. Close-out

- [ ] 8.0 `pnpm build` immediately before the checks below. They run out of
      `dist/`, so an unbuilt tree scores the previous build of the checker against
      the current tree and reports success
- [ ] 8.1 `node packages/claims/dist/cli.js check 'openspec/**/*.md'` clean
- [ ] 8.2 `check 'README.md' 'spec/**/*.md' --require-markers` clean
- [ ] 8.3 Every witness fixture exits as `spec/witness-journal.md` says, and the
      declared schema version is unchanged
- [ ] 8.4 CHANGELOG: new verb, new union, no schema bump, and why the bump is not
      owed — the field is never read by the journal
