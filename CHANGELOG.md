# Changelog

Bare version headings are the kernel — `@nullius-inverba/claims` and its
unscoped alias `evidence-anchors`, which ship together. Headings prefixed with
a package name are that package's own release; the kit versions independently.

## 0.9.1

Two security fixes in the rev-stamped lane, both reported 2026-08-19 and both
shipped in 0.9.0. `@nullius-inverba/kit` is unchanged at 0.4.0: its source did
not move, it does not reach the corrected code, and its `^0.9.0` range already
resolves to this release.

### Fixed

- **Security: the git lane no longer reads outside the root it was pointed at.**
  In `<rev>:<path>` a bare path resolves from the top of the repository rather
  than from the directory git was pointed at, so a checker running in a
  subdirectory read files above its own root through the stamped lane while the
  working-tree lane refused the same citation:

  ```console
  $ git -C sub show 049a447:above.txt
  SECRET_TOKEN=hunter2
  ```

  Because the verdict turns on whether the quoted text matches, the exit code
  answered "is my guess about that file right" — one bit per run, over a
  directory nobody pointed the checker at. Blobs are now addressed as
  `<rev>:./<path>`, which anchors resolution at the checked root. Where that
  root IS the repository root — the documented usage, and what CI does — the
  two forms are identical and nothing changes.

  A test named for this property already existed and passed. It cites
  `../../etc/passwd`, a **syntactic** escape the path guard rejects before any
  read; the defect was a **semantic** one, a path with no `..` in it that git
  resolved somewhere else. The test kept its name and gained the case it
  claimed. (#71)

- **A 40-character absent commit is no longer reported as a fabrication.**
  git says `invalid object name` only for a rev shorter than 40 hex. At exactly
  40 the argument is already a complete object id, so it skips the revision
  complaint and reports a path problem — which the classifier read as "that
  commit exists and lacks this file". One anchor therefore got two verdicts
  depending on the LENGTH of its hash:

  ```
  app.ts:1@0000000                                   OK                   exit 0
  app.ts:1@0000000000000000000000000000000000000000  MISSING-FILE-AT-REV  exit 1
                                                     "this citation was never true"
  ```

  Same file, same quote — a quote genuinely present in the working tree. Since
  `git rev-parse HEAD` and `$GITHUB_SHA` both print 40 characters, this accused
  authors who used the most natural input available, with the verdict this
  project asks reviewers to treat as most serious.

  Existence is now asked with `git cat-file -e <rev>^{commit}`, which involves
  no path and cannot be confused by one, and is cached per rev. stderr matching
  remains only for what it is still the sole source of. The pre-existing test
  used a 16-character SHA, which is exactly why this shipped; the new one
  asserts 7, 16 and 40 agree. (#70)

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

- **Journal schema `0.6` — the second tier gets a producer, and the two now
  share one file.** A `prompt` kind for the operator's turn. A per-record
  `origin`, **required** on `stage`, `resolution`, `decision` and `check`, where
  absent or any other value is `MALFORMED`. A closed `expects` vocabulary on
  `dispatch` with one member, `findings`. A header `user: { name }`. And two new
  blocks on `JournalReport` — `ledger` (per-kind counts) and `provenance`
  (hook-tier, self-reported, unattributed).

  **The header's `origin` now means something narrower, and the summary says so.**
  It was the origin of every record in the file; it is now the origin of records
  that carry none of their own. That sentence is false about a journal holding
  ledger records, so at `0.6` the validate summary is rescoped and followed by
  the three provenance counts. `unattributed` is the branch the old sentence
  never had to name: records with no origin of their own, under a header whose
  origin is absent, belong to nobody, and counting them as hook-tier would be
  the flattering read the field exists to remove.

  Both counter blocks are **`null` below `0.6`**, not zero, and the floor is
  decided once in the kernel rather than in the renderer — a sum is not an
  absence, and "this journal carries no ledger records" is a different claim
  from "this build did not look". A survey of only sub-`0.6` journals reports
  `null` for the same reason.

  **Three of the five bump triggers fire**, and it is worth naming which:
  clause 1 (`prompt` is a new kind), clause 2 (`expects` is a new closed
  vocabulary), and clause 3 (per-record `origin` required on four kinds, and a
  blank `user.name` rejected — both make previously-valid records invalid).
  `user` gets its own branch in the header scan rather than joining the flat
  `IDENTITY_FIELDS` list, whose loop would have tightened `0.4` and `0.5`
  retroactively. An unrecognised `user` shape (`user: "Arman"`, `user: {}`)
  fails closed rather than being dropped, on the same ground as `expects`.

- **kit: the run-ledger producer.** The recorder no longer stops at "an agent
  came back". At a subagent's terminal it scans the **untruncated** return text
  for lines in the reviewer tag grammar — `- [blocker] …`, `[concern]`,
  `[looks-good]`, `[false-premise]` — and writes one `finding` record per match,
  joined to the dispatch it came out of. That is a line grammar and not a
  classifier: nothing reads the return for meaning, so a return with no tag
  lines produces no findings, which is the honest reading of a return that used
  no contract.

  Whether a dispatch expected findings at all is decided from a file rather than
  an opinion. At `PreToolUse` the recorder reads
  `.claude/agents/<subagent_type>.md` and sets `expects: "findings"` when its
  `## Output format` section mentions `[blocker]`. `subagent_type` is
  payload-supplied, so it is validated against a conservative name shape before
  any path is built; the dispatch also records how the read went —
  `read` / `missing` / `unreadable` / `unsafe-name`, metadata no verdict reads —
  so a dispatch missing `expects` because nothing could be read is
  distinguishable in the file from one whose agent is not a reviewer.

  **`nullius-kit witness ledger stage|resolution|decision|check`** writes the
  coordinator's own half into the same journal, and **`witness ledger findings
  [--open]`** lists what the reviewers actually raised — read out of the file,
  so a coordinator that forgot a blocker still sees it. Every record it writes
  carries `origin: "self-reported"`; the header's `hooks` is never inherited.
  Three refusals happen before any write: no session is guessed (`--session`,
  else `CLAUDE_CODE_SESSION_ID`, else exit 2 naming both — never the newest file
  by mtime), a value outside a closed vocabulary is refused rather than left for
  the validator, and **`finding` is not an offered kind** — a hand-written one
  would be byte-identical to an extracted one, and the ledger verdicts exist
  precisely because those are different tiers. That last one is a command-surface
  convention, not a property of the file, and is listed under known limitations
  below rather than implied to be a mechanism.

  `report` also gains optional `model`, `usage` and `usage_source`. Synchronous
  returns take them from the payload; asynchronous ones sum `message.usage` over
  the transcript's assistant turns, read **before** the lock under a byte cap
  and a wall-clock budget strictly below the lock wait, and omitted with a
  stderr note when either is exceeded. Both budgets are parameters of the
  reader, so the under-cap-but-slow branch is testable rather than argued about.
  Additive optional metadata no verdict reads — it earns no bump on its own.

  The header gains `user: { name }` from `git config`, resolved inside the same
  per-call and total budgets the other identity fields use. The governing
  constraint is not git failing but git succeeding slowly: identity is resolved
  before the journal's advisory lock is taken, so no git slowness can cost a
  hook its records.

- **plugin: prompts are recorded.** `hooks.json` gains a `UserPromptSubmit`
  entry routed to the same `witness-record.sh`. The recorder writes one `prompt`
  record and stamps the harness's `prompt_id` onto each later `dispatch` and
  `mutation` that carries it, so what was asked and what it caused are joined by
  the harness's own key rather than by timestamps. The agent's reply is
  deliberately not recorded: `last_assistant_message` is the agent's
  self-account, which is the tier this journal exists to distrust.
  `NULLIUS_WITNESS_PROMPTS=0` records a length and a hash instead of the text.

  Two properties of the shim, both load-bearing. Its stdout is redirected to
  stderr **for every event, not just the new one** — `UserPromptSubmit` is the
  one event whose hook stdout the harness returns to the model, the default
  runner is `npx`, and `npx` prints to stdout on a cold cache, which would
  arrive as instruction-shaped text nobody wrote. And the runner is bounded by a
  `timeout` wrapper **inside the script** rather than by a `timeout` key in
  `hooks.json`: a harness-killed process never reaches the script's own
  `exit 0`, and that last line is where the never-blocks guarantee actually
  lives. A delegated bound is a convention; an in-script one is a mechanism.

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

- **`SILENT-REVIEWER` is scoped, and this is a loosening — the first one this
  schema has shipped.** At `0.6` the verdict considers only dispatches carrying
  `expects: "findings"`. Below `0.6` it is unchanged and unscoped. Same bytes,
  newer version, *more* records valid.

  The measurement is why. Under a producer that records every dispatch, an
  unscoped `SILENT-REVIEWER` fires on every `found` return from an `Explore` or
  implementing agent, none of which use the tag contract: on this repository's
  own corpus, 0 findings at `0.2` and 255 at `0.3` from a producer whose
  behaviour had not changed. A verdict that fires on three dispatches in five
  gets learned as noise, and a verdict read as noise is a gate that has stopped
  working while still appearing to run. The verdict's own rationale already
  presumed the dispatch was a reviewer; that presumption is now declared in the
  record, from a file, by the only party that can read one.

  **One fail-open direction, stated here rather than discovered later.** A
  reviewer whose definition file the recorder cannot read gets no `expects`, and
  is therefore a dispatch the verdict cannot fire on where at `0.5` it would
  have. The dispatch says so — `agent_definition: "unreadable"` or `"missing"` —
  but nothing fails on it. The denominator is also editable in-session: deleting
  `[blocker]` from an agent's output section disarms the verdict for every later
  dispatch, and either edit appears in the journal only as an ordinary
  `mutation`. The remedy belongs to `nullius wiring`, is not built, and is
  recorded as a follow-up rather than implied to be covered.

  **The fixture pair is inverted, and had to be.** `v0.3-compat-run.jsonl`
  proved a *tightening* by passing at the older version on identical bytes.
  `v0.5-compat-run.jsonl` is the same bytes as `v0.6-run.jsonl` and must **fail**
  at `0.5`. A pair where both halves pass, or both fail, proves nothing about
  which way the floor points. What the twin cannot do is isolate the loosening:
  it fails at `0.5` for two independent reasons — the unscoped verdict and the
  unknown `prompt` kind — and an exit code cannot say which fired. The
  "fires unscoped at 0.5" unit test is what pins the predicate's direction, and
  the CI comment beside the twin says so.

- **The version-bump rule gains a fifth trigger: a loosening.** The rule's
  criterion has always been *the set of valid records changes*, and clause 3
  named only one direction. Take `0.6`'s scoping on its own, with the rest set
  aside: nothing becomes invalid, no kind is added, no vocabulary grows, no
  verdict is born — clauses 1 to 4 are all silent — and yet the same records now
  validate differently, which is precisely what a declared version is for.

  `0.6` did not need clause 5; the bump was already owed by clauses 1, 2 and 3.
  The loosening rode along, and the clause was written down so the next one
  cannot argue it is free.

  **It was appended, never inserted**, even though it is clause 3's mirror and
  reads naturally beside it. Renumbering would have been a one-line edit that
  silently falsified every existing citation of "clause 4" — in the schema doc,
  in this changelog, and in archived proposals whose arguments turn on which
  clause they name. A rule whose clause numbers move is a rule nothing can cite.
  Every restatement was swept in the same commit, so none is four-of-five at any
  point.

- **`spec/witness-journal.md` is the canonical statement of the bump rule, and
  is now the only one.** Two documents claimed it. `openspec/specs/witness/spec.md`
  now says it restates the rule and does not own it: where the two disagree, the
  spec doc is the rule and the restatement is the defect. The published spec wins
  because it is the one the README sends readers to, and it carries the fixture
  table and the version history.

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

- **The `UserPromptSubmit` payload shape is an assumption, not a recording.**
  Every other shape the recorder reads is pinned to a captured payload under
  `spec/fixtures/probes/claude-code/`. That event has no probe in the committed
  corpus, and capturing one is still open. The parser therefore looks for the
  prompt text under several plausible keys — `prompt`, `prompt_text`,
  `user_prompt`, `text` — and, finding none, records **nothing** and says so on
  stderr rather than writing a `prompt` record that asserts the operator spoke
  while saying nothing about what they said.

  So: an absent `prompt` record means "not recorded", never "no prompt", and it
  is as consistent with the harness having moved a key as with a quiet session.
  This is documented rather than shipped quietly because the fallback list is
  the tell — when a probe lands it collapses to the observed key and the
  fallbacks go.

- **The plugin must be reinstalled before the new hook fires at all.**
  `hooks.json` gained the `UserPromptSubmit` entry, and a plugin installed
  before that ships the old file. Nothing degrades visibly: every other event
  keeps recording exactly as it did, the journal keeps validating, and prompts
  are simply never recorded, with nothing in the output to say why. Reinstall
  via `/plugin`, then confirm with `nullius-kit doctor` — its managed-hooks
  check knows the new event, and it reports `prompts: recorded / hashed only`
  as a fact read from the environment it can actually see.

- **A hand-appended `finding` is byte-identical to a hook-extracted one.**
  `witness ledger` refuses the kind, which is a command-surface convention and
  not a property of the file: the journal is local, this change ships one
  writer, and nothing stops an editor. A file-level mechanism belongs to journal
  sealing and is not in this change. The cross-tier comparison
  `SUPPRESSED-FINDING` makes is therefore as strong as the assumption that the
  journal was written by these two producers.

- ~~**The hook recorder still declares `0.2`.**~~ **Closed by the above.** The
  producer now writes `0.6` and emits `finding` records, and the calibration
  problem that had blocked the bump — 0 findings at `0.2` and 255 at `0.3` on
  this repository's own corpus, from a producer whose behaviour had not
  changed — is what the `SILENT-REVIEWER` scoping under `### Changed` answers.
  The cause was one level below the gate: for a hook journal `outcome: "found"`
  means only that the subagent's final message was non-empty, so a reviewer
  semantic was being read into a harness-derived field. `expects` is where that
  semantic now lives, declared per dispatch and read from a file.

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
