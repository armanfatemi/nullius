# Design — add-pr-process-report

## Context

**Where the data is, and what it can answer.** Journals record dispatches,
reports, mutations (and, after `add-run-ledger-producer`, findings, ledger
kinds and prompts). The header's identity names where the session *started*,
by definition. The row that settles it is `branch`'s own, which says *when* it
was sampled rather than what it tracks:

**Evidence:** `spec/witness-journal.md:293@04cd9ac` — `| `branch` | The branch checked out when the run began |`

and its neighbour says the same of the commit:

**Evidence:** `spec/witness-journal.md:176@c8305b1` — `| `head` | **The commit the session started from** |`

so the session that produced a feature-branch PR routinely carries `branch:
main`. Selection has to come from the records, not the header. The kernel's
survey validates journals independently and never merges their timelines,
which the bundle and the report both keep:

**Evidence:** `packages/claims/src/witness.ts:1376@c8305b1` — ` * The records are never combined into one timeline, and that is the whole`

**The kernel's range plumbing** is `oracle`'s and is internal to the package:

**Evidence:** `packages/claims/src/oracleGit.ts:67@c8305b1` — `export function parseRange(range: string): ParsedRange | { error: string } {`

**Evidence:** `packages/claims/src/oracleGit.ts:225@c8305b1` — `export function gitOracleDeps(`

**Evidence:** `packages/claims/src/oracle.ts:231@c8305b1` — `export function checkOracles(`

**Evidence:** `grep -rn 'checkReport' packages/claims/src/index.ts` → 0 results

**The JSON report** the code-verified tier reads has a version and a policy:

**Evidence:** `packages/claims/src/checkReport.ts:262@c8305b1` — `export const REPORT_VERSION = 1;`

**Evidence:** `packages/claims/src/checkReport.ts:236@c8305b1` — ` * - Adding a member to the `Verdict` union is ALSO breaking — for any consumer`

**The Action** upserts by prefix match on a marker, and swallows a failed post:

**Evidence:** `action/action.yml:152@c8305b1` — `          | jq -r --arg m "$marker" '[.[] | select(.body | startswith($m)) | .id][0] // empty') || existing=''`

**Evidence:** `action/action.yml:157@c8305b1` — `          gh api -X POST "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" -f body="$body" >/dev/null || true`

**Evidence:** `action/action.yml:47@04cd9ac` — `    default: '0.9.1'`

Nothing in the repository escaped markdown or workflow commands, rendered
mermaid, or exercised the Action in CI when this design was written. Two of the
three are still true; the mermaid count is non-zero **because this change made
it so**, which is the one anchor here that had to move:

**Evidence:** `grep -rn '%0A' action/ packages/claims/src packages/kit/src` → 0 results

**Evidence:** `grep -rn 'mermaid' action/ packages/ docs/ README.md .github/` → 26 results

**Evidence:** `grep -rn 'uses: ./action' .github/workflows/ci.yml` → 0 results

The middle one is worth pausing on, because it exposes a gap in the anchor
grammar rather than a defect in this document. `rev-stamp-change-anchors`
exists because a change proposal cites code it is about to modify, and a stamp
splits that citation into an immutable half and an advisory half. **A search
anchor has no stamp available** — `grep … → N results` is a claim about the
working tree and nothing else — so an "absence of X" search anchor in a
proposal that adds X is *designed* to rot with no advisory fallback, and turns
into a hard `COUNT-MISMATCH` the moment the change lands. The repair is the one
taken here: restate the count and say what moved it. Worth a rule of its own,
and recorded in `IDEAS.md` rather than fixed inside this change.

**`init` and `doctor`** dispatch on the workflow's path and test its content by
substring:

**Evidence:** `packages/kit/src/render.ts:319@c8305b1` — `    } else if (artifact.path === ".github/workflows/claims.yml") {`

**Evidence:** `packages/kit/src/render.ts:160@c8305b1` — `          globs: ${globs}${requireMarkers}${strict}`

**Evidence:** `packages/kit/src/doctor.ts:564@c8305b1` — `  const path = join(root, ".github", "workflows", "claims.yml");`

**Redaction** has one accessor and one known structured leak:

**Evidence:** `packages/claims/src/canary.ts:401@c8305b1` — `    claim: { kind: "canary", source: { doc, line: entry.line } },`

**Evidence:** `packages/claims/src/cli.ts:1109@c8305b1` — `        "warning: the registered canary points at a document outside the matched set — not read; run `canary clear` if it is stale",`

**Stage 8** seeds the PR body from the evidence file and then opens the PR:

**Evidence:** `.claude/skills/proposal-to-pr/SKILL.md:1041@c8305b1` — `node packages/kit/dist/cli.js pipeline evidence-print <change>`

**Evidence:** `.claude/skills/proposal-to-pr/SKILL.md:1113@c8305b1` — `gh pr create --base <resolved-base> --head feat/<change> `

## Decisions

### 1. Four tiers, fixed order, separate tables

**Chosen:** the report renders *code-verified* (re-run in CI), then
*hook-attested*, then *self-reported*, then ***unattributed*** — each under its
own heading with a one-line provenance statement, and a closing *not recorded*
list. No table mixes tiers.

**The renderer does not decide tiers, and below the ledger floor there is no
tier to render.** The kernel computes its provenance partition only at journal
version `0.6` and above — the whole loop is gated:

**Evidence:** `packages/claims/src/witness.ts:1599@04cd9ac` — `  const atLedgerFloor = versionAtLeast(scan.version, "0.6");`

**Evidence:** `packages/claims/src/witness.ts:1615@04cd9ac` — `  if (atLedgerFloor) {`

and below it the counts are not a zero but an absence:

**Evidence:** `packages/claims/src/witness.ts:1637@04cd9ac` — `  const provenanceCounts: ProvenanceCounts | null = atLedgerFloor`

The report therefore does exactly two things. **At `0.6` and above** it renders
the kernel's `provenance` counts, which are already on `validateJournal`'s
return and already exported, so no kernel API change is needed. **Below `0.6`**
it renders the hook-attested, self-reported and unattributed tiers as *not
recorded*, with the reason and the version: *tier breakdown not recorded — this
journal is version 0.2 and predates per-record attribution (added at 0.6).*

**This is this change's own absence rule, turned on the change's own headline
feature.** Every journal in this repository today is version `0.2`, including
the one recording the run that produced this proposal — so on this repository,
right now, the report's most-advertised section renders as an absence. That is
the correct output and it is worth stating rather than engineering around: a
tier breakdown is a claim about attribution, the data carries no attribution,
and the alternative to saying so is inventing one.

**Two earlier drafts invented one, in opposite directions, and both were
wrong.** The first re-tiered pre-`0.6` records as *unattributed*, presenting a
divergence from the validator as fidelity to it. The second counted them
*hook-tier* and claimed the kernel said so; the kernel says nothing below the
floor, and the three anchors that draft cited sit inside the `if (atLedgerFloor)`
block — accurate quotations, enclosed by a gate that denied the sentence they
were placed under. The spec had said so the whole time:

**Evidence:** `spec/witness-journal.md:230@04cd9ac` — `have no per-record origin to partition by.`

The pattern in both drafts was the same: a claim about what the kernel
*computes* was checked against the line where a value appears rather than
against the path from the function's entry to that value. That is the reading
this decision now records as the one to do.

**Alternatives considered:**

- **One summary table** — rejected: it is the confusion `add-maintainer-card`
  refuses (`proposal.md:74`, cited in `proposal.md`), and it lets a
  contributor-supplied count sit beside a CI-computed one as equals.
- **Bundle tiers first, because they are the novel content** — rejected: the
  contributor-independent tier is the only one a hostile contributor cannot
  shape, so it goes where a skimming maintainer looks first.
- **Re-tier pre-`0.6` records as unattributed**, or **count them hook-tier** —
  rejected; both were drafted and both invented an attribution the data does
  not carry, in opposite directions.
- **Promote `add-run-ledger-producer` to a hard dependency** so journals reach
  `0.6` before this ships — rejected by the human, who chose to ship against
  the absence rule instead. The tier lights up on its own once journals cross
  the floor; no further change here is needed for that.
- **Synthesise a `0.6` fixture to exercise the tier** — rejected: the feature's
  core path would then be tested only against data this change invented.

**Rationale:** the critic's strongest objection to this feature is that the
signal is absent exactly where it matters. Ordering by independence from the
contributor is the structural answer: the part that survives an absent or
curated bundle is rendered first and rendered always.

### 2. A committed envelope of source lines, outside `.nullius/`

**Chosen:** `witness bundle` writes `nullius.runs/<branch-slug>.json` — a JSON
envelope `{ version, range, selection, journals: [{ session, lines }] }`, where
`lines` is the journal's source lines in order — which the contributor commits.
CI reads it from the checkout and reconstructs each journal by joining `lines`.

**Alternatives considered:**

- **A git ref** (`add-journal-sealing`) — rejected for v1: refs are not part of
  a fork's pull request and need push permissions the Action does not have.
  Kept as a second read source once sealing lands.
- **Under `.nullius/`** — rejected: the directory's existence switches recording
  on for anyone who clones (`profiles.ts:66`, cited in `proposal.md`).
- **JSONL of concatenated journals** — rejected: a journal-level header record
  for the envelope would be `MALFORMED` to the validator, and concatenation is
  the merge the survey refuses.
- **`{ session, header, records }`** — rejected, and Decision 3 gives the
  reasons, which are the reasons the envelope stores lines at all.

**Rationale:** a file in the diff is reviewable, travels with any PR, and can be
re-validated per journal by handing the rejoined lines to `validateJournal`.

### 3. The envelope carries every source line; redaction rewrites fields

**Chosen**, and this is the rule the whole bundle format follows:

> **The envelope carries every source *line*. Redaction rewrites a line's
> fields; it never drops a line.**

Everything below is why the noun is `line`, why redaction cannot remove, and
what follows from both.

#### Why lines rather than records

**A rejected line is not a record, and its verdict is evidence.** Pass 1
rejects five classes of line — unparseable JSON, non-object, misplaced header,
unknown kind, missing or duplicate id — pushing a finding and moving on, so
none of them ever enters `records`:

**Evidence:** `packages/claims/src/witness.ts:1644@04cd9ac` — `    // past pass 1. Lines rejected as malformed or duplicate-id are reported as`

A bundler serialising `records` would drop exactly those lines **and their
`malformed` and `duplicate-id` verdicts**, in the direction that makes a bad
journal look clean.

**A records array can be empty for a journal that has content.** When the scan
stops — an unsupported version, for instance — the report returns `records: 0`
while `findings` still carries the reason:

**Evidence:** `packages/claims/src/witness.ts:740@04cd9ac` — `      records: 0,`

A records-shaped envelope would carry zero lines for such a journal and read
downstream as a session that did nothing.

**A separately stored header can launder a broken journal clean.** `scanHeader`
takes the first non-blank line and gives up if it will not parse or is not a
journal record:

**Evidence:** `packages/claims/src/witness.ts:596@04cd9ac` — `    if (!isObject(parsed) || parsed["kind"] !== "journal") return headerless();`

Re-emitting a stored `header` at the top of a reconstruction would hand a
headerless or misplaced-header journal a valid header it never had. So the
header is stored in place, at its original position, and reconstruction is a
join and nothing more.

#### Why redaction cannot remove

The validator computes verdicts *across* records, by two mechanisms that
partition the same records differently on purpose:

- **By path**, through a hash map that three kinds advance — `mutation`
  (`packages/claims/src/witness.ts:1118`), `verification`, and `append`'s
  optional target — while the verdict that reads it, `stale-verification`, is
  raised on a **`reliance`**, which carries no path at all.
- **By id**, through `byId`. A `reliance` *can* name a mutation — the validator
  has a verdict for exactly that mistake
  (`packages/claims/src/witness.ts:1062`) — but no well-formed journal reaches
  a mutation this way, so in practice mutation and verification correlate only
  by path.

A reference closure therefore re-adds the verification for a surviving reliance
but never the mutation that made it stale, **silencing** `stale-verification`.
A path closure drops that verification under a surviving reliance,
**manufacturing** `dangling-reference`. Neither order reproduces the source
journal, and there is no third order.

#### What redaction does

Redaction rewrites only these fields, and only on a line that carries a valid
`id`:

- **`report.findings`** — the array's length is preserved and each entry is
  capped. The entries are plain strings and carry no ids:

  **Evidence:** `packages/kit/src/record.ts:486@04cd9ac` — `      // clipped copy that went into `report.findings`.`

  Arity is what the validator reads, and arity is what is preserved. Emptying
  the array outright would trip the hard `collapsed-state` verdict:

  **Evidence:** `packages/claims/src/witness.ts:970@04cd9ac` — `              detail: 'outcome "found" with no findings — report "empty" instead, and say so explicitly',`

- **`finding.text` and `prompt.text`** — capped.
- **`report.statement`** — capped, **under a bundle-set flag of its own**. It
  is an unbounded contributor-controlled string landing in a public committed
  file, so it is bounded here; and the flag is new rather than borrowed,
  because `truncated` and `response_chars` describe the clipped *findings*
  entry (`packages/kit/src/record.ts:481`), and reusing them would assert a
  long response behind an empty excerpt.
- **`prompt` records under `--no-prompts`** — converted, per the next section.

Nothing else, and **no line is dropped**. There is no keep-list, no kind
enumeration and no closure rule, because there is no removal for them to
govern. `truncated` and `response_chars` are carried exactly as the producer
set them and never synthesised.

**Redaction gates on a valid `id`, and that is what keeps the round-trip
comparison meaningful.** A line rejected for a missing id is reported with its
own text as the subject:

**Evidence:** `packages/claims/src/witness.ts:820@04cd9ac` — `    if (!nonEmptyString(id)) {`

so rewriting such a line — it may still carry a redactable `text` — would
change the subject of its own `malformed` finding, and source and reconstruction
would disagree about a verdict neither got wrong. Every other pass-1 subject is
an id, which redaction never touches.

**Order is preserved on write.** The dangling checks compare `record.line`
(`packages/claims/src/witness.ts:1231`, `:1296`), so the envelope stores lines
in their original sequence and reconstruction emits them in that sequence.

#### `--no-prompts` converts, and refuses rather than half-redacting

Emptying `prompt.text` is unsafe: with text absent the validator *requires*
`chars` **and** a non-empty `hash` —

**Evidence:** `packages/claims/src/witness.ts:1448@04cd9ac` — `        if (record.raw.chars === undefined || !nonEmptyString(record.raw.hash)) {`

— and the producer's text mode writes `text` and `chars` and no hash, so
emptying manufactures `malformed`. The producer already emits the correct shape
when text is withheld at record time (`packages/kit/src/record.ts:894-900`),
and `--no-prompts` writes that same shape: drop `text`, add `hash`, keep
`chars`, and drop `truncated`.

Removal would in fact have validated clean — a `prompt` reference naming no
record is deliberately not a dangling reference:

**Evidence:** `spec/witness-journal.md:593@04cd9ac` — `discovers as a bug: **a `prompt` key naming no record validates clean.** There`

Conversion is chosen anyway, and not from deference to the rule: the report
claims to show what the human asked for, and a converted record still says a
prompt occurred and how long it was. A removed one is indistinguishable from a
run where the human never spoke.

**And where it cannot convert, it refuses.** Rewriting a field requires parsing
the line, and unparseable lines are carried verbatim — so a prompt line the
validator rejects cannot be converted, and a flag that silently shipped its
text would be a consent control failing precisely where nobody can inspect the
result. With `--no-prompts` and any unparseable line in a selected journal,
`bundle` exits non-zero, names the session and the line numbers, and writes
nothing, offering `--exclude <session>`. A redaction flag may refuse; it may
not appear to work.

**The concrete values, so they are not invented twice.** The design owes these
to the implementer rather than the other way round:

- **Cap budget: 800 characters** for `finding.text`, `prompt.text`,
  `report.statement` and each `report.findings` entry. The producer's own
  `EXCERPT_LIMIT` is 2000 (`packages/kit/src/record.ts:220`); the bundle caps
  harder because this file is public and committed and the report needs a
  label, not a transcript.
- **The statement-cap flag is `bundle_statement_capped`** — deliberately long,
  so a reader of a committed envelope cannot mistake it for something the
  producer wrote.
- **A prompt carrying `text` but no `chars`**: `--no-prompts` derives `chars`
  from the stored excerpt, because dropping `text` without `chars` would
  manufacture `malformed`. A prompt whose `text` is present but blank is left
  verbatim — converting it would *repair* an existing `malformed`, which is a
  verdict change in the flattering direction and is exactly what this decision
  forbids.
- **Exit codes**: the `--no-prompts` refusal exits **2**, matching `ledger`'s
  refusal to write a record it cannot stand behind; zero included journals
  exits **1**.
- **`selection` records** `prompts: "text" | "hashed"`, and in the hashed case a
  `prompt_hash_note` carrying the caveat below.
- **"Fails to parse" means "not readable as a JSON object"**, which also
  catches a line that is valid JSON but a scalar or an array. The conservative
  reading, consistent with a redaction flag that may refuse but may not appear
  to work.

**One caveat the envelope states.** The bundler holds only the clipped text the
producer stored, while the producer's own hashed branch hashes the untruncated
original and `chars` is the untruncated length. The validator checks no
derivation, so the record validates either way — but a reader comparing hashes
computed elsewhere would find them different for a reason that is not
tampering. `selection` records that converted prompts were hashed from the
stored excerpt, and the report never presents a prompt hash as an identity.

#### What is not redacted, and why saying so matters

An earlier draft listed "header minus `user.email`". That strip is a no-op: no
journal carries the field, and two independent places say so —

**Evidence:** `packages/kit/src/identity.ts:119@04cd9ac` — `   * `email` is deliberately not resolved. It is the identifying half, the only`

**Evidence:** `packages/claims/src/witness.ts:141@04cd9ac` — `    user?: { name: string };`

The redaction already happened upstream, in the producer. Naming it here invited
a reader to believe the bundle is the chokepoint for operator identity, which it
is not and must not be relied on to be.

#### The cost, stated

The envelope carries every line of a selected journal, including records about
paths the range never touched — for the intended fixture, four
`.claude/agent-memory/**` paths, which are tracked in this repository. The
general case is wider: a contributor's journal can name gitignored or untracked
paths from their own tree, and unparseable lines are carried verbatim and are
unredactable by construction. That is the trade being made — a faithful record
that may reveal local paths, over a filtered one whose validation is an artefact
of the filter. The hook-attested tier's entire claim is that it re-validated
what it counts.

### 4. Selection by overlap, printed and overridable

**Chosen:** selection is a **three-way classification at session granularity**.
For each candidate journal, let *overlap* be true when its record timestamps
fall within `[first commit author time − slack, last commit author time +
slack]` for the range, and *touches* be true when at least one
`mutation.target.path` is in the range's changed files. Then:

| overlap | touches | classification |
| ------- | ------- | -------------- |
| yes | yes | **included** — a producing session |
| yes | no | **inconclusive** — recorded as a candidate, *not* silently dropped |
| no | — | **excluded** — recorded with the reason |

**`inconclusive` is the case this decision exists for.** A review-only session —
one that dispatched reviewers, collected findings and mutated nothing inside the
range — has overlap and not touches, and it is exactly the session whose rounds
and findings the report is for. Dropping it would render its work as a *smaller
count*, contradicting this change's own requirement that absence render as *not
recorded* and never as zero. So the envelope carries inconclusive candidates by
session id, and the report names them: "*N session(s) overlapped this range but
mutated no file in it; include with `--include <session>` if they belong.*"

**Range scoping is the renderer's, and applies only to kinds that have a path.**
Three kinds carry one — `mutation`, `verification`, and `append`'s optional
target — and those are the only records the range can speak about. Dispatches,
reports, findings, prompts and every ledger kind have no path, so they are
counted in full and the report says so rather than implying they were considered
and passed. **Tier counts are never scoped**: `provenance` is a whole-journal
partition with no path predicate, so re-partitioning it by range would be the
renderer applying a tiering rule of its own, which Decision 1 forbids.

`selection` records the rule, the slack, every candidate's classification with
its reason, and the range's changed-file set; `--include <session>` /
`--exclude <session>` override and are recorded as overrides.

**Alternatives considered:**

- **Header `branch` equals the PR branch** — rejected: it names where the
  session started (`spec/witness-journal.md:293`, above), and in this
  repository's own history the producing session started on `main`.
- **Time overlap alone** — rejected: a concurrent session in another worktree
  overlaps in time and touched nothing in the range.
- **Two-way selection — in or out** — rejected: it makes a rule-excluded session
  and a session that was never on the machine indistinguishable in the envelope,
  which is the one distinction a maintainer cannot reconstruct from anywhere
  else.
- **Filtering records by range in the bundler**, in any form — rejected under
  Decision 3; scoping is presentation, and a filter that changes what the
  validator sees changes what the validation is worth.

**Rationale:** the rule is deterministic, the report states it verbatim, an
override is visible rather than silent, and the one genuinely ambiguous case is
rendered as ambiguous instead of resolved by a default that flatters whichever
side of it the run happened to land on.


### 5. The renderer is kernel code, pure, versioned

**Chosen:** `packages/claims/src/witnessReport.ts` builds a `RunReport`
structure from `{ bundle, range deps, check run, oracle report }` with no I/O,
and two renderers (`renderMarkdown`, `renderJson`) read it. The CLI verb
`witness report` wires it: `oracle` through `checkOracles` +
`gitOracleDeps` in-package (which is why this lives in the kernel and not the
kit — neither is exported), `check` through the existing collectors,
`validateJournal` per bundled journal. JSON carries `version: 1` under the
same policy as `checkReport`.

**Alternatives considered:**

- **Render in the kit** — rejected: `oracle` and `checkReport` are not on the
  published API, and adding them there for one consumer is a larger public
  surface than a verb.
- **Render in the Action with `jq`** — rejected: the escaping is
  security-relevant and `jq`-in-YAML is untestable, which is the same
  reasoning `add-maintainer-card` left open and this settles.

### 6. Escaping and the mermaid label grammar

**Chosen:** two escapers in the renderer, unit-tested against an adversarial
fixture: markdown-cell (pipes, newlines, backticks, angle brackets, leading
control characters) and mermaid-label (labels quoted; the character set
restricted to `[A-Za-z0-9 ._:/x()-]` — ASCII `x`, not `×` (U+00D7), which an
earlier draft carried and which nothing in the label grammar needs — with
everything else replaced with `·`; a
maximum label length). The Action posts the markdown verbatim and never
interpolates report strings into a workflow command.

**Rationale:** every string reaching the renderer is contributor-controlled;
the renderer is the one place with tests.

### 7. Rounds, bursts and the flowchart

**Chosen:** a *round* is a maximal set of dispatches whose start times fall
within `ROUND_WINDOW_MS` of the first and which contains at least two
dispatches; an *edit burst* is the mutations between consecutive rounds or
commits, grouped by path with counts; *commits* come from `git log` of the
range; *prompts* are placed by timestamp. The chart is `flowchart LR` over
those nodes in time order. The window is printed under the chart.

**Rationale:** each node is a deterministic function of timestamps the
harness wrote; nothing infers intent.

### 8. Redaction inherited, not restated

**Chosen:** `canary-present` results contribute to the failure count and
render neither `source.doc` nor `source.line`; the out-of-scope warning
(`cli.ts:1109`) is never rendered; the renderer reaches canary state only
through `describeCanary`, **called with `reveal` unset**.

**The accessor is a chokepoint, not a guarantee, and the difference is the
whole point.** An earlier draft of this decision said the renderer "takes
canary state only through `describeCanary`" and treated that as discharging
the no-location requirement. It does not — the accessor returns exactly the
pair this decision promises to suppress, on request:

**Evidence:** `packages/claims/src/canary.ts:72@04cd9ac` — `  return options.reveal === true`

**Evidence:** `packages/claims/src/canary.ts:73@04cd9ac` — `    ? `${entry.doc}:${entry.line}``

So the constraint is on the **call site**, and it is testable there: the
renderer passes no options, and a unit test asserts that a report built over a
registry entry contains neither the document path nor the line. Routing
through one accessor is what makes that test sufficient; it is not itself the
protection.

### 9. Second comment, second marker, size budget

**Chosen:** the Action's new step upserts under `<!-- nullius-run-report -->`
— not a prefix of `<!-- nullius-claims -->`, since the upsert matches by
`startswith` — truncates at a stated budget with a visible line pointing at
the JSON artefact uploaded alongside, and writes the same body to the step
summary. A failed post is reported in the step summary rather than only
swallowed.

### 10. `init --run-report`, `nullius.kit.json`, `doctor`

**Chosen:** the flag sets `runReport: true` in `nullius.kit.json`;
`renderWorkflow` emits `run-report: true` when set; `doctor` adds a `run
report` check — `fact: not enabled` when the config lacks it, `pass` when the
workflow carries the input, `fail` when the config asks and the workflow does
not. `doctor --fix` re-renders as it does today.

### 11. Single commit

**Chosen:** `witness report <sha>` is `parseRange`'s bare-revision reading —
the commit against its parent. Selection, tiers and rendering are unchanged;
only the range is narrower.

### 12. Stage 8

**Chosen:** after the base is resolved and before the body is seeded:
`witness bundle <base>..HEAD`, `git add nullius.runs/`, commit, push; then
`evidence-print` and `gh pr create` as today. The skill's prose subcommand list
gains `bundle`.

### 13. `witness report` renders; it does not gate

**Chosen:** the verb exits `0` whenever it produced a report, `2` on a usage
error or unreadable input, and **never** exits non-zero because a tier it
rendered contains a failure. The contract is stated in
`specs/check-cli/spec.md` and asserted by a test that runs the verb over a
fixture whose code-verified tier fails and asserts exit `0`.

**Rationale:** the kernel already refused to give `survey` a verdict, and for
a reason that applies with more force here:

**Evidence:** `packages/claims/src/cli.ts:562@04cd9ac` — `above; the survey exits non-zero iff at least one journal does. There is no`

**Evidence:** `packages/claims/src/cli.ts:563@04cd9ac` — `survey-level verdict, and inventing one would be a second place for pass and`

A verb that re-runs `check`, `checkOracles` and `validateJournal` and then
minted its own verdict would be a *fourth* place for pass and fail to
disagree — and the three it wraps are each already run, and already gate, in
CI on their own. The report's job is to say what happened, and a reader who
wants the gate reads the gate. Task 6's `--format json | jq .version` step
depends on this answer: under any other contract that step would fail
whenever the report had something to report.

### 14. The JSON form carries a discriminator, and shadows nothing

**Chosen:** `renderJson` emits `{ kind: "run-report", version: 1, ... }`, with
its own version independent of `REPORT_VERSION`, and embeds the check
document under its own key **carrying that document's own `version`** rather
than restating it.

**Rationale:** two documents numbered `version: 1` on one CLI, distinguishable
only by which subcommand produced them, is a consumer bug waiting for the
first tool that reads a file it did not invoke — and the existing document has
no `kind` of its own to distinguish it by:

**Evidence:** `packages/claims/src/checkReport.ts:262@c8305b1` — `export const REPORT_VERSION = 1;`

Independence is right rather than merely convenient: `REPORT_VERSION`'s policy
is about the `Verdict` wire vocabulary, and this renderer reads `failing`
rather than the union, so the two documents genuinely do break on different
events. The discriminator is what makes that independence safe to rely on.

## Compatibility risks

**Risk:** the Action posts what a separately versioned kernel rendered; a
newer `witness report` whose JSON `version` moved past what the Action
understands would be parsed with wrong expectations if the Action read fields.

**Binds at:** `inter-service-skew`

**Skew path:** `@nullius-inverba/claims@<newer>` → `witness report --format json` on stdout → `armanfatemi/nullius/action@v1`

**Symptom:** an empty or partial comment on a PR whose bundle is sound.

**Mitigation closes it because:** the Action reads `version` first and, on an
unrecognised value, posts no report and states the version it could not
render — the same discipline as `add-maintainer-card` Decision 6 — and the
markdown form is posted verbatim without field access, so only the JSON path
can skew. The checker version is pinned by the Action (`action.yml:47`,
above).

## Open questions

Mirrored from `proposal.md`:

1. The envelope's path and name.
2. The comment size budget.
3. Whether prompts travel by default.
4. Rendering when `oracles` is unconfigured.
5. The round-detection window, and whether it is configurable.
