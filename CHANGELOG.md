# Changelog

Bare version headings are the kernel — `@nullius-inverba/claims` and its
unscoped alias `evidence-anchors`, which ship together. Headings prefixed with
a package name are that package's own release; the kit versions independently.

## 0.9.0

The `oracle` verb, a security fix for rev-stamped anchors, and the canary's
location leak closed. `@nullius-inverba/kit` moves 0.3.0 → 0.4.0 alongside it —
its own bullets are folded into the sections below rather than a separate
heading, following the 0.8.0 precedent.

> **0.8.0 was never published.** Its version was bumped and its notes written,
> but the publish step did not run, so npm went 0.7.0 → 0.9.0 and
> `@nullius-inverba/kit` went 0.2.0 → 0.4.0. The 0.8.0 and kit 0.3.0 sections
> below describe real states of the code and are kept as written; everything in
> them ships here for the first time.

### Fixed

- **Security: an unresolvable `@rev` no longer rescues a failing anchor.**
  A rev stamp is part of the document, and on a pull request the document is
  written by the party being checked. Naming a commit the clone could not
  resolve softened a **failing** working-tree verdict to the advisory
  `UNVERIFIABLE-REV`, which passes — so appending `@0000000` to any invented
  citation turned a red run green. A document in which every claim was
  fabricated exited 0 and printed "All 3 grounding marker(s) verified", under
  `--require-markers` too.

  This is described plainly because it is already public: the finding and an
  earlier, unmerged fix have sat on a branch of this repository since
  2026-08-19. Understating it in the release notes would misrepresent what
  users were running.

  The fail-open itself was correct and is kept. A commit this clone never had
  is not evidence about the author — the clone may be shallow, the PR may come
  from a fork, the branch may have been squash-merged — and a checker that
  cannot read the history it was pointed at does not get to call anyone a
  fabricator. Refusing to soften anything would have reported `FABRICATED` for
  a squash-merged proposal that cited code it then modified, which is the
  outcome `rev-stamp-change-anchors` exists to prevent.

  So the discriminator moved off the citation and onto the clone, which no
  document can influence. `check` now asks `git rev-parse
  --is-shallow-repository` once per run, and only on the branch where a stamped
  anchor has already failed:

  | Clone | Unresolvable commit, failing working-tree verdict |
  | --- | --- |
  | Shallow | `UNVERIFIABLE-REV`, advisory — unchanged |
  | Cannot be determined (no git) | `UNVERIFIABLE-REV`, advisory — unchanged |
  | Full history | the working-tree verdict stands, failures included |

  A **passing** working-tree verdict is unaffected in every row: a stamp can win
  an anchor the permanent gate, and it can never lose it the ordinary one.

  If a squash orphans a stamp on a full-history clone, the remedy is the one
  already documented — re-pin the anchors to the squash commit.

  Because `actions/checkout` defaults to `fetch-depth: 1`, most CI runs are
  shallow and therefore behave exactly as before. Set `fetch-depth: 0` to arm
  the gate; that has always been this project's advice for rev-stamped
  documents, and it is now what makes the difference.

- **The canary told reviewers where it was planted.** The probe measures whether
  a reviewer found a false claim by *reading* a document, so any command that
  prints the plant's location answers that question for them. Nine did, and the
  leak was not hypothetical: across prior runs, two of five scored rounds reached
  the plant through the registry rather than by reading, and the reviewers' own
  reports said so. It recurred twice while this fix was under review, through
  `canary status` and then through `check`.

  Every rendering of a registered canary now goes through one accessor,
  `describeCanary`, which omits the document and line by default. Nine sites are
  redacted — six in the CLI (`status`, `clear`, `verify`'s CAUGHT and MISSED, and
  `check`'s two canary warnings) and three in the library (`plant`'s
  already-registered refusal, `clearCanary`'s refusal, and `loadActiveCanary`'s
  unsafe-path warning). `canary plant` is the sole deliberate exception and asks
  for the location by name, at the one moment a coordinator legitimately records
  it; its output is unchanged. Exit codes are unchanged everywhere, as is
  `no active canary`.

  The unredacted form is a function parameter rather than a CLI flag on purpose.
  A `--reveal` flag would be reachable from the shell by the reviewer the
  redaction exists to stop, which makes it a documented bypass rather than a
  control.

  **Three limits, stated plainly, because a redaction that overclaims is worse
  than none.**

  First, `.git/nullius/canaries.json` remains readable, so this stops incidental
  exposure during ordinary review work, not a determined reader.

  Second, `check`'s `CANARY-PRESENT` guard row still carries the plant's line. It
  leaks through a structured field on the published JSON schema and needs an
  additive field rather than a message edit, so it is a follow-up; until that
  lands, the vector is open.

  Third — and this one is not closed by that follow-up either — the out-of-scope
  warning is a presence oracle even when redacted. It fires exactly when the
  matched set does *not* contain the plant, and `--probing` suppresses the guard
  row and the stale-registry warning but not this one. So
  `check --probing <one-document>` still answers "is the plant in this file"
  one bit at a time, with no prior knowledge. Redacting the text does not remove
  the signal carried by *which* message fires; closing that means changing when
  the warning is emitted, which is a behaviour change this entry does not claim
  to have made.

### Added

- **`nullius oracle <range>` — conservation of the thing that grades the work.**
  The artifact that decides whether work is done is writable by the thing being
  measured, and when a change makes a test fail there are two ways back to green
  that produce identical output: fix the code, or fix the test. Editing the test
  is frequently correct, so the question is not whether the oracle changed but
  whether the change was **accounted for**.

  Declare what grades the project under a new `oracles` config key — an array of
  `{glob, weakening?, skipMarker?}`. The verb diffs a commit range against those
  globs and classifies each changed path. `deleted`, `skipped` and `weakened` are
  hard and raise an obligation; every other change is listed and raises none.
  Flagging every test touch would produce a list nobody reads, and a list nobody
  reads is worse than none because it launders as review.

  An obligation is discharged by a witness-journal `decision` carrying
  `justifies: {path, change}` naming the same pair. The referent is derived, not
  assigned: both sides compute `(path, change)` from the same diff, so no record
  id is ever needed. That is the point — git is the source rather than the
  journal's own `mutation` records, because those come from hooks watching
  editing tools only, and a `rm`, a `git rm` or any script-driven deletion leaves
  no record at all. Deletion is the highest-risk edit there is, and the tier that
  is normally the stronger attestation has its coverage hole exactly there.

  **New verdict union.** `OracleVerdict` is separate from the exported `Verdict`,
  whose growth is breaking public API, following `RuleVerdict`.
  `UNJUSTIFIED-ORACLE-CHANGE` is advisory in v1 and passes;
  `MALFORMED-JUSTIFICATION` is excluded from `PASSING` and fails with no flag
  set, on the same ground that excludes `malformed-rule-header` — a mistyped key
  is an authoring error, not a finding about the codebase. The exclusion is
  load-bearing: a `PASSING` set containing every member of its union makes the
  failure predicate constant-false and hands the whole decision back to
  `--strict`.

  **What it does not do.** The verdict certifies that a reason was *recorded*,
  never that the reason is good, and no model appears in the verdict path.
  `weakened` is a declared pattern's match count compared across two revisions,
  not a parsed syntax tree — a refactor merging two assertions is a false
  positive, and an assertion gutted from `expect(x).toEqual(full)` to
  `expect(x).toBeDefined()` is a false negative the count cannot see. It catches
  deletion-shaped weakening and says so. A project declaring no `oracles` is told
  so rather than shown a clean zero.

  **CI gates it in both polarities, with its limits in the workflow comment.**
  The negated arm gates `MALFORMED-JUSTIFICATION` only —
  `UNJUSTIFIED-ORACLE-CHANGE` is advisory, exits 0, and is asserted by name in
  the unit suite instead, so a regression silencing it alone would leave CI
  green. The arm also asserts on output rather than exit code alone, because an
  absent `oracles` key exits non-zero too and a bare negation would be satisfied
  identically by "the verdict fired" and "nothing is configured".

- **Journal schema `0.5`.** `decision` may carry `justifies`. `witness validate`
  does not read the field — not even to reject a malformed one — and reports the
  same findings for a journal carrying it as for one without; its meaning and
  validation belong to `oracle`, its only consumer.

  **The bump is owed to the new-verdict clause, not to the field.** `justifies`
  alone is additive optional metadata and would have been exempt. But
  `MALFORMED-JUSTIFICATION` reads it and fails a `decision` record on it, and the
  exemption's condition is *no verdict reads it*, without qualification. Three
  drafts of this change argued their way to no bump — that it tightens nothing
  (true and irrelevant); that clause 4 means a verdict `witness validate` emits
  (a qualifier the clause does not carry); and that "nothing previously valid
  becomes invalid" is what every clause measures (false, and it collapses clause
  4 into clause 3, erasing it). Recorded in `spec/witness-journal.md` because the
  rule's own text says it has already decayed twice through restatement.

  The bump tightens nothing: `0.5` is appended, every `0.4` journal stays valid,
  and `witness validate` gains no finding. The version moves so a reader knows a
  clean validation no longer means what it used to.

- **Journal schema `0.4` — a journal that knows where it came from.** The
  header may now carry `branch`, `head`, and `worktree`, and a `verification`
  may carry `rev`, the commit its claim was checked against. `head` is defined
  narrowly as *the commit the session started from* — not the tree any later
  record was written against — because HEAD moves during a session and a field
  silently meaning something else is a lie by staleness. The definition is in
  the schema text rather than a comment, since a caveat that lives only in a
  comment gets read as absent.

  `worktree` is a salted SHA-256 of the absolute worktree path, truncated to
  16 hex characters — never the path, and never an unsalted digest, because an
  absolute worktree path is low-entropy enough that an unsalted hash is
  confirmable by guessing. The salt lives in the git common directory, which
  makes it uncommittable by construction rather than by an ignore rule that
  only covers one repository.

- **`0.4` is a bump rather than an additive change, and the reason is worth
  stating.** Every new field is optional, which is what made the first draft of
  this work claim no bump was needed. That was wrong: `verification.rev` must
  now be a stamp and a `mutation` may not carry `rev` at all, and both records
  validated clean under `0.3`. Making a previously-valid record invalid is a
  tightening, and optionality of a *field* does not rescue the validity of a
  *record*.

  All three new rejections are gated behind a version predicate that compares
  by index into the ordered version list, never by string — `"0.10" >= "0.3"`
  is false. A `0.3` journal validates exactly as it did before. That guarantee
  is carried by a fixture pair, `v0.3-compat-run.jsonl` and
  `v0.4-broken-run.jsonl`, which are byte-identical apart from the declared
  version and exit 0 and 1 respectively; either one alone would pass with the
  predicate written backwards.

- **The version-bump rule is now written down in `spec/witness-journal.md`**,
  with all four of its triggers: a new kind, a new member of a closed
  vocabulary, a tightening that invalidates a previously-accepted record, and a
  new verdict that can fail a record. It lives in the schema doc rather than in
  a change proposal because proposals archive and a citation into one rots.

- **`nullius witness survey <glob...>`** validates every matched journal
  **independently** and adds up the reports. It never merges records into one
  timeline, and that is the point rather than an implementation detail: two
  journals are two worktrees, both containing `src/parser.rs`, and a merged
  timeline would let one worktree's mutation invalidate another's verification
  — a `STALE-VERIFICATION` for an event that never happened. A validator that
  invents failures is worse than one that misses them, because the invented
  ones teach people to pass `continue-on-error`.

  Output keeps the three terminal outcomes as three numbers and names the
  journal count in the same block, so a summed total cannot be misread as one
  validated run. Journals that reached no terminal record are listed by name;
  journals whose schema this build cannot read are listed separately, because
  their zero counts mean "nothing was read", not "nothing happened".

- **kit: the hook recorder writes repository identity into the header.** The
  governing constraint turned out not to be "git might fail" but *git
  succeeding slowly*: the header is written under the journal's advisory lock,
  and a hook that waits past that lock's deadline has its append refused —
  records lost, not deferred. So identity is resolved before the lock is taken
  and passed in as data, on its own sub-second budget rather than the kernel's
  ten-second file-reading default. A detached HEAD writes `head` and omits
  `branch` rather than inventing a sentinel nobody can check. No git failure,
  and no git slowness, can cost a hook its records.

### Changed

- **Public surface.** `JournalHeader` gains three fields, and `surveyJournals`
  / `JournalSurvey` / `SurveyedJournal` are newly exported. Reading is
  unaffected: code that consumes a `JournalReport` and ignores the new fields
  compiles and behaves exactly as before.

  One nuance worth stating rather than glossing. The three fields are declared
  `string | null` and required, matching `session` and `source` beside them, so
  any code that *constructs* a `JournalHeader` literal — a test double, a mock
  — must now supply them. `JournalHeader` is a type the validator produces
  rather than one callers build, so this is unlikely to bite, but "additive"
  is true of readers and not of constructors and the difference belongs here.
- **The ledger gate is a floor, not an equality.** `SUPPRESSED-FINDING` and
  `SILENT-REVIEWER` were gated on a journal declaring exactly `0.3`. Left
  alone, a `0.4` journal would have been silently ungated for both while every
  fixture still exited as its table said and CI stayed green — a checker going
  quiet behind a passing build. A test asserts both verdicts by name at `0.4`
  and asserts the lower boundary at `0.2`, since an upper-boundary test alone
  passes against a floor wrongly written as "not 0.1".

### Known limitation

- **The hook recorder still declares `0.2`.** Bumping the producer was scoped
  into this work and then measured and scoped back out. The kit cannot emit a
  `finding` record at all, so under any schema at `0.3` or later every `found`
  report earns `SILENT-REVIEWER`: on this repository's own corpus, 0 findings
  at `0.2` and 255 at `0.3`, from a producer whose behaviour had not changed.
  The cause is one level below the gate — for a hook journal `outcome: "found"`
  means only that the subagent's final message was non-empty, so a reviewer
  semantic is being read into a harness-derived field. That is a question about
  the outcome vocabulary rather than about identity, and it is deferred with
  its measurements recorded rather than patched over. The identity fields are
  readable at any declared version, so they are written and read today.

## 0.8.0

> Never published to npm — see the note under 0.9.0. Everything here first
> reached users in 0.9.0.

Deterministic rule compliance and a journal check for it, a review-layer
canary, wiring validation, and a round of authoring ergonomics for `check`
itself. `@nullius-inverba/kit` moves 0.2.0 → 0.3.0 alongside it — its own
bullets are folded into `### Added` below rather than a separate heading,
following the first-release precedent.

### Added

- **`nullius canary` — measure the review layer instead of assuming it.**
  Every other check in this repository asks whether a claim is true. This one
  asks whether the machinery that reads claims is still running. `canary plant
  <doc>` inserts one registered, plausibly-false statement into a document;
  you run your review; `canary verify <report>` reports `CANARY-CAUGHT` (exit
  0), `CANARY-MISSED` (exit 1), or `CANARY-TAINTED` (exit 3, the report named
  the probe machinery, so the result is invalid rather than passed). A
  pipeline that catches the plant is demonstrably alive; one that misses it
  has been *measured* dead rather than assumed alive.

  Two design points carry the whole thing. The planted claim is **bare
  prose** — false by construction, but carrying no anchor — because a claim
  the deterministic checker could settle would test the checker, not the
  reviewer. And the registry lives **outside the document**, in
  `.git/nullius/canaries.json`: a visible in-doc marker would tip off the
  reviewer being measured and invalidate the test. That is also why there is
  no fixture for the new verdict and cannot be one — the CI gate is the whole
  plant/check/verify/clear round trip instead.

  One new verdict, `canary-present`, fails `check` on any document holding an
  uncleared plant, so a probe can never be merged by accident. `--probing`
  suppresses that guard for the one run that is deliberately checking a
  planted document, and nothing else. An unreadable registry fails closed
  everywhere: unknown probe state is not "no active canary", because reporting
  the second would be a fabricated attestation about the machinery itself.

- **`nullius wiring [root]` — references that must resolve.** A skill naming
  an agent that has no definition file does not error today: the dispatch
  no-ops and the run reports a completed review having reviewed nothing. That
  silence is a filesystem fact, so it now has a checker. `wiring` scans agent,
  skill, rule, hook, settings, and command artifacts under the harness root
  and confirms every reference their frontmatter *declares* — `dispatches:`,
  `skills:`, a `{{TOKEN}}` placeholder — actually resolves, and does the same
  for every hook `command` it can unambiguously resolve to a repo-relative
  script; a command line it cannot read that unambiguously (two candidate
  tokens, any backslash, whitespace in a candidate) is declined rather than
  checked, by design.

  Nine verdicts: `dangling-agent` and `dangling-skill` (a declared name with
  no definition file), `missing-path` and `empty-glob` (a declared path or
  glob matching nothing), `dead-hook` (a hook command that does not resolve,
  or is not executable), `unsubstituted-token` (a `{{TOKEN}}` that survived a
  port), `malformed-hooks` (a hooks or settings file that fails to parse as
  JSON) and `unclosed-frontmatter` (a frontmatter fence that opens and never
  closes) — both fail closed, same as the six above — and the advisory
  `loose-reference` (a backticked path in prose, which might be a live
  pointer or an illustrative example, and nothing here can tell the two
  apart). Only declared fields fail; prose is always advisory.

  **`WiringVerdict` is its own union, separate from the kernel's exported
  `Verdict`.** `Verdict` — the enum `check` and `audit` report against — is
  unchanged. This release is additive, not breaking: growing `Verdict` itself
  to cover wiring would have made every existing switch over it non-exhaustive,
  so wiring gets a verdict space of its own instead.

  Library API: `checkWiring`, `isWiringFailure`, `hookTarget`,
  `scanHarnessRoot`, `fsWiringDeps`, `looseCandidates`, `parseFrontmatter`, and
  `declaredList` are now exported from the package root, alongside their
  `ArtifactKind` / `HarnessArtifact` / `WiringDeps` / `WiringFinding` /
  `WiringReport` / `WiringVerdict` / `Frontmatter` / `Located` types.

- **`nullius rules select`/`rules check`, and `/comply` — rule compliance
  stops being model-judged.** Every rule under `.claude/rules/` already
  carries a flat frontmatter (`id`, `applies_to`, `severity`) and, by
  convention, an incident anchor in the body; nothing parsed it as a closed
  schema before this. `rules select --paths <path...>` is the deterministic
  half — no model, just glob matching against `applies_to` — and emits
  exactly the rule ids that bind to what a plan or diff touches, in a
  stable order, with the excluded count printed alongside. `rules check
  [root]` verifies every rule file the way `check` verifies any other
  document: a required `id`, a known `severity`, closed frontmatter keys,
  and the incident anchor re-verified against the working tree. Three
  verdicts, two of them advisory: `ungrounded-rule` (no incident anchor —
  folklore, flagged rather than failed), `rule-rot` (the anchor no longer
  verifies — computed from the anchor's own `Verdict` through `isFailure`,
  never a bare inequality, because ordinary line drift reports the passing
  `stale` and a naive check would have misreported several of this
  repository's own rules as rotted from day one), and `malformed-rule-header`,
  which fails closed like any other schema violation in this tool.

  `/comply` is the plugin-side consumer: one rule per starved subagent
  dispatch, the same discipline `audit`'s briefs already use
  (`buildComplianceBrief`, mirroring `buildAuditBrief`). Both verdicts a
  dispatch can return — `COMPLIANT` and `VIOLATION` — require an Evidence
  Anchor that `check` re-verifies; `COMPLIANT` is not trusted on a lighter
  gate than `VIOLATION`, closing a model-in-the-verification-path gap that
  would otherwise have survived everywhere else this changed. Only
  `NOT-APPLICABLE` goes unanchored, since it asserts nothing about the plan
  for an anchor to bind to. `routeAgents` (kit) now calls `rules select` to
  pre-filter before dispatching `rule-auditor`, so a change earns that
  reviewer only when a rule's `applies_to` genuinely matches something it
  touches, closing a gap the pipeline's own comment used to name.

  `RuleVerdict` is its own union, following the `WiringVerdict` precedent —
  the kernel's exported `Verdict` union is unchanged.

- **`SILENT-RULE` — a rule `rules select` named can no longer go unchecked
  without it showing.** Reaching a terminal journal record is not the same
  as delivering a verdict: a dispatch can complete, report, and never
  actually assert `COMPLIANT` / `VIOLATION` / `NOT-APPLICABLE` for the rule
  it was sent to check. `witness validate <journal> --expect-rules
  <rule-id...>` cross-references the ids named for a run against that run's
  own journal and reports `silent-rule` for any that never landed a
  verdict. Its own union, `RuleCoverageVerdict` (`ok` | `silent-rule`), not
  a new member of the 13-member `JournalVerdict` — every existing member is
  determinable from a journal's own content, and this one needs an
  externally-sourced expected list no other member takes. Skipped, not
  misreported, when the journal itself is `unsupported-version`: nothing
  past the header was read, so nothing here can be asserted either.

- **`check --stamp` and `check --fix` — repoint citations without
  re-arguing the claim.** `--stamp` adds `@<head>` to every unstamped
  anchor that verifies both in the working tree and, independently, at HEAD
  as resolved once per run — an anchor that only holds locally is left
  untouched rather than stamped into a false immutable claim; it exits 2
  when HEAD cannot be resolved. `--fix` repoints the line number on
  `DRIFT` and `WRONG-LINE` verdicts, the two where the quote still uniquely
  identifies real code and only the coordinate went stale; it never
  touches `FABRICATED`, `UNPINNED`, or any already-`@rev`-stamped anchor,
  and never rewrites the quoted text — the tool fixes citations, not
  claims. The two compose in one pass, one atomic write per document.

- **`check --format json`** — a versioned, machine-readable report (one
  object per claim result, plus summary counts: anchor density, unanchored
  documents by name, per-verdict counts, failures) on stdout; diagnostics
  and the exit code are unchanged and stay on stderr. Human output is
  byte-identical to before and stays the default.

- **Per-command `--help`, and a funnel for the zero-marker case.** Every
  command takes its own `--help` with one example invocation. When `check`
  matches documents and finds no grounding markers at all, the closing
  line now names the next command — `nullius audit <doc> --propose` —
  instead of only a spec URL.

- **kit: `routeAgents` pre-filters through `rules select`.**
  `packages/kit/src/pipeline.ts` now imports `selectRules` from
  `@nullius-inverba/claims` directly — the same pattern `doctor.ts` already
  uses, not a subprocess — and dispatches `rule-auditor` only when
  `selectRules` finds at least one applicable rule.

- **kit: `doctor` reports what the settings files say about payload capture.**
  The recorder can save every raw hook payload behind `NULLIUS_WITNESS_PROBE=1`,
  and those recordings are what feed the committed corpus that `probeChecks`
  replays. Nothing reported whether capture was configured, so an empty
  `.nullius/probes/` was indistinguishable from a directory nobody had asked
  for — and capture cannot be performed after the fact, so the first time a
  payload anomaly needs explaining is exactly when the explaining data is found
  not to exist.

  The new `payload capture` check reads the `env` block of
  `.claude/settings.local.json`, `.claude/settings.json` and an injected user
  settings path, and reports every file that sets the variable and the value it
  carries. **It is an observation, never a verdict** — `fact` in every branch
  but one, and `fail` in none. Not capturing is a legitimate configuration, and
  a check that failed on it would be disabled rather than heeded.

  What it deliberately does not claim is the point. It does not read `doctor`'s
  own `process.env`, because the variable governs the hook subprocess while
  `doctor` runs in the operator's shell. It does not adjudicate precedence
  between settings files, because nothing in this repository establishes the
  harness's ordering and naming a deciding file would assert external behaviour
  the checker cannot ground. And it never says "capture is on" or "capture is
  off" — both are claims about sources it cannot read, including the
  environment that launched the harness. Every statement is scoped to the file
  it came from. `unknown` is reserved for a settings file that exists, will not
  parse, and leaves nothing else established; a parse failure alongside a
  determinate read stays a fact and names the unreadable file beside it.

- **kit: `init` names payload capture without enabling it.** The installer now
  says that capture exists, what it records, where it lands, and that it is off
  unless asked for. It does not set the key and does not offer to: raw payloads
  carry prompt text, tool inputs and absolute home paths, and persisting that is
  the operator's decision rather than the tool's. A test asserts the rendered
  `nullius.kit.json` carries no probe key across all three profiles.

### Fixed

- **kit: `probeChecks`' absent-corpus message pointed at the wrong directory.**
  It told the reader to populate the committed corpus with
  `NULLIUS_WITNESS_PROBE=1`, which writes to `.nullius/probes/` instead — so
  following the instruction did not fill the directory the message named. This
  is the misreading that made the corpus check look like a misdirected
  live-capture check during an earlier review. The message now names both
  directories and the promotion path between them. Behaviour is unchanged: the
  directory it reads, its `unknown` status and its returned shape are the same,
  and a new test at the CLI seam asserts `doctor` still points it at the corpus
  — which no previous test did, since every one of them supplied the directory
  itself.

## kit 0.2.0

One fix, and it is a consent bug rather than a bug in the checker.

### Breaking

- **`init` no longer creates `.nullius/`, and kit config moved out of it.**

  ```
  .nullius/kit.json      →  nullius.kit.json
  .nullius/authoring.md  →  nullius.authoring.md
  ```

  That directory's existence is the witness recording opt-in — the hooks check
  for it and write nothing without it. 0.1.0 put its config there, so `init`
  created it as a side effect of needing somewhere for settings, and silently
  switched on run recording for anyone with the plugin installed. Verified
  against the real hook: before `init`, zero journals; after, a journal on
  disk. Nothing in `init`'s output mentioned it — it prints "No hook entries
  written" while having just enabled the thing hooks do.

  Two decisions had collided: `.nullius/` as the kit's config directory, and
  `.nullius/` as a consent boundary. The second wins; a boundary must not be a
  directory another feature needs for unrelated reasons.

  `init` now creates it under no profile, and leaves one you created **alone**
  — neither creating nor removing it.

  **Migration.** Re-run `init`, then delete `.nullius/kit.json`. Until you do,
  `doctor` reports the stale file as failing and `doctor --fix` refuses rather
  than re-rendering from config nothing reads any more. Both name the new path
  and say why it moved.

## 0.7.0

The kit's front door, a schema for what a run actually contained, and one
breaking change to the CLI.

> **0.5.0 and 0.6.0 were written but never published.** Upgrading from 0.4.0
> — the newest version on npm — brings all three releases at once. Their
> entries are below, unchanged.

### Breaking

- **Flags belong to their command.** One parser used to scan all of argv for
  both the verb and its options, so `nullius --require-markers check DOC`
  worked and `nullius audit DOC --require-markers` was accepted and **silently
  ignored**. The second is why this changed: a gate that quietly is not a gate
  is the worst failure a checker has, because the user believes a run was
  verified.

  Each command now parses its own flags. A misplaced one names its real owner
  rather than claiming to be unknown, and a flag before the verb is refused
  with the corrected order:

  ```
  --extract is an option of `audit`, not `check` — it was previously
  accepted here and silently ignored
  the command comes first: `nullius check --require-markers …`
  ```

  **Migration:** move the flag after the command. `--help` and `--version`
  still work anywhere, including after a verb.

### Added

- **`@nullius-inverba/kit` — first release.** `init` applies one of three
  profiles (`plans` / `prs` / `specs`) chosen from what is on disk, prints
  every file it writes, and `--dry-run` is the same code path minus the write.
  `doctor` diagnoses an installed setup from local state only and ends by
  running a fixture through the installed recorder and validator, because a
  list of green configuration checks is a claim about configuration. `--fix`
  re-renders what the kit owns, refusing to guess when `.nullius/kit.json` is
  unreadable rather than silently switching a repo's profile.

  Two things it will not do, and prints instead: it writes no hooks where a
  plugin delivers them, and it places exactly one pointer line in your agent
  instructions rather than a managed block.

- **Witness schema v0.3 — the run ledger.** Five kinds (`stage`, `finding`,
  `resolution`, `check`, `decision`) for what an agent contributed to a run,
  and two verdicts that were previously unaskable: `SUPPRESSED-FINDING` (a
  blocker no resolution answers) and `SILENT-REVIEWER` (a dispatch that
  returned `found` and filed nothing).

  The vocabulary is derived from a corpus of 91 hand-written evidence files
  rather than invented — which overturned four assumptions, including a
  resolution enum that had missed five of the six most common outcomes.
  `SUPPRESSED-FINDING` is gated to `blocker` for a measured reason: 60.8% of
  identified findings in that corpus are never mentioned again, so an ungated
  verdict fires on three in five and gets learned as noise.

  v0.2 and v0.1 journals are unaffected — the new verdicts are evaluated only
  when a journal declares `0.3`.

- **`configVersion`, reserved in `nullius.config.json`.** Accepted and ignored,
  and deliberately not type-checked: if this version demanded a number and the
  format later became `"2.0"`, every older pinned kernel would fail on a repo it
  should merely not understand. Nothing writes it yet — a reservation only buys
  compatibility once the writer waits for a release that contains it.

### Fixed

- `<command> --help` and `<command> --version` work again; they were briefly
  scoped to the first argument while the usage text still advertised them.
- `--` now separates operands, so a path beginning with a dash is nameable.

## 0.6.0

Citation rot, and the two verbs the checker could not be.

### Added

- **Rev-stamped anchors: `path/to/file.ts:12@a1b2c3d`.** A citation asserts two
  different things — "this text was in this file" (a fact about the author) and
  "it is on line N of it today" (a fact about the repository) — and the checker
  had only the working tree to settle both. Stamping the commit splits them onto
  two snapshots: the gate runs against the immutable commit with `git show`, so
  a `FABRICATED` there is permanent and can never be excused by a later
  deletion, and the working tree becomes advisory (`STALE`), so no refactor can
  turn an honest document red. Unstamped anchors behave exactly as before.
- **`nullius audit <doc>`** — the entailment half `check` deliberately does not
  certify. Anchored claims are extracted deterministically, then dispatched one
  per agent, starved of the document, the title, and every sibling claim, and
  told to refute. Refutations come back as anchors that `check` re-verifies, so
  no model is in the verification path. `--emit-brief <id>` prints one brief,
  `--extract` pulls unanchored claims out of prose, `--propose` is the older
  confirmation-shaped mode (`eager-prompt` still works and points here).
  `UNVERIFIABLE-BY-SEARCH` is a first-class answer.
- **`nullius witness validate <journal.jsonl>`** — three invariants on the
  record a multi-agent run leaves behind: every dispatch reaches one of three
  terminal states (collapsing "reported nothing" into "never reported" launders
  dead agents into evidence of absence), no verification is relied on after the
  artifact it verified changed, and no append omits what it corrected. Schema:
  [spec/witness-journal.md](spec/witness-journal.md).
- New verdicts: `STALE`, `UNVERIFIABLE-REV` (both advisory) and
  `MISSING-FILE-AT-REV` (failing).

### Fixed

- **Four-space indented blocks are quoted context**, like fenced ones. A README
  showing an example anchor in an indented block was asserting it. Indentation
  is measured from the enclosing list item's content column, so four spaces
  under a bullet stays list continuation and is still checked.
- **Markers written as list items are read**, not reported `MALFORMED`.
  Bulleting the evidence under the claim it supports is the natural authoring
  style, and refusing it trained authors away from the marker.

### Notes

- Rev-stamped anchors need the history they name: check out with
  `fetch-depth: 0`. A commit this clone does not have is never held against the
  author — the verdict fails open as the advisory `UNVERIFIABLE-REV`, with the
  remedy in the message. Squash-merge discards the stamped commit, so documents
  merged that way lose the hard gate and keep the advisory one.

## 0.5.0

A security release. It closes command execution and file-probe holes in the
absence lane, and it is **breaking** — see Migration.

### Security

- **Arbitrary code execution via ripgrep flags.** Allowlisting the binary was
  never enough: `rg --pre <cmd>` runs `<cmd>` against every searched file, and
  the run reported `OK` with exit 0. Commands are now tokenised and every flag
  is checked against a closed per-binary allowlist; unknown flags are refused
  rather than passed through.
- **No shell.** Commands are spawned as a canonical argv vector, never a string.
- **File-probe oracle in the absence lane.** `checkAbsence` never applied the
  repo-path guard that `checkPresence` used, so a search could read any file on
  the runner and the verdict — posted into a PR comment — was the answer. The
  guard now covers both lanes, in three layers: the string check, a refusal of
  any out-of-repo token wherever it appears (so containment does not depend on
  the arity table), and symlink resolution before anything is read or searched.
- **`.git` is off limits, at the walk and not just the operand.** Under
  `actions/checkout` it holds an `AUTHORIZATION: basic <token>` header, and
  anchors are unlimited per document, so each one is a bit. Refusing the written
  path was not enough: `grep -r` never needs the directory named to descend into
  it, and defaults to `.` with no operand at all. Searches now run with
  `--exclude-dir=.git` (grep) or a negated `.git` glob (ripgrep, which skips it
  by default but not under `--hidden`/`--no-ignore`/`-uuu`), and a symlink
  resolving into `.git` is refused.
- **Budgets.** 10s per search, 120s per run, and `RIPGREP_CONFIG_PATH` /
  `GREP_OPTIONS` are stripped from the child environment.
- Flags that make a search vacuous regardless of the pattern (`-q`, `-m 0`,
  `--max-depth 0`, `--max-filesize 0`) are refused, as is a null byte anywhere
  in a command (which previously crashed the whole run).

### Verdicts

- **The line number is now a hint, not an assertion.** `WRONG-LINE` and `DRIFT`
  pass, reporting the delta. A citation asserts two things on two axes: "this
  text is in this file" is a claim about the author that can be fabricated and
  can never later become false, while "it is on line N" is a claim about the
  repository that goes stale whenever someone inserts a line above it.
  Hard-failing the second turns a correct document red on an unrelated
  refactor, which is what gets `continue-on-error` added to a workflow.
  `FABRICATED` still fails permanently.
- New failing verdict `UNPINNED`, the guard on that relaxation: a quote that
  matches SEVERAL lines and is on none of them at the cited line identifies
  nothing on either axis. Length alone never fails a claim — a short quote
  matching exactly one line still pins that line, and re-reading the file can
  still contradict it. Distinctiveness prefers exact whole-line matches, so
  appending a trailing comment to a copy of a cited line does not make the
  original quote "ambiguous".
- `WEAK-ANCHOR` (passing) covers both quality signals: a quote shorter than
  `minAnchorChars`, or one matching several lines while still sitting on its
  cited line.
- `--require-markers` is now a **per-document** floor. Previously one anchored
  document licensed every unanchored document in the glob.
- New passing verdict `WEAK-ANCHOR`: the quote is true but too short
  (`minAnchorChars`, default 8) or too repeated to identify the cited line.
- Absence claims report `SEARCH-CLEAN` rather than `OK` — a search certifies the
  search, never the absence.
- A zero-result absence search is re-run with a match-anything pattern as a
  reachability control; if that also returns zero the search examined nothing
  and the verdict drops to `ADVISORY`.
- The summary counts presence and search anchors separately.

### Authoring

- A quote may be a fenced block under the marker; a multi-line block must match
  consecutively from the cited line.
- Fences track their delimiter and length (CommonMark), so neither a ``` inside
  a ~~~ block nor a ``` inside a ```` block flips the rest of the document
  between asserting and quoting.

### Migration

- **`WRONG-LINE` no longer fails**, and a new `UNPINNED` verdict does. Documents
  that were red only from line drift go green; a doc whose anchors match several
  lines and sit on none of them goes red. `driftWindow` now only chooses between
  two passing verdicts, so it no longer affects the exit code.
- **Shell globs are no longer expanded.** `grep -rn x src/*.ts` now reports a
  missing file instead of silently matching. Use `-r` with `--include=`/`-g`.
- **`exclude` is a glob against the full repo-relative path**, not a basename.
  `"review-log.md"` now matches only the root-level file; use
  `"**/review-log.md"` for the previous behaviour.
- **A pattern that looks like an absolute path is refused.** Write
  `grep -rn 'api/v1/users' src/` rather than `'/api/v1/users'`.
- **`searchTimeoutMs: 0` is rejected** rather than silently failing every search.
- Library API: `CheckDeps.runSearch` takes a parsed `SearchPlan` instead of a
  command string, and the `Verdict` union gained members.

## 0.4.0

Initial release: Evidence Anchors spec, deterministic checker, GitHub Action,
Claude Code plugin.
