# The Run Report

`nullius witness report <base>..<head> | <sha>` renders how a range was
produced. It is the one artefact in this repository that composes the
checkers rather than being one: it re-runs three of them, reads a fourth's
record, and puts the results under four headings that say what each number is
evidence of.

It **renders and does not gate**. A reader who wants a verdict reads the gate.

## The problem this solves

A maintainer reviewing an agent-written pull request sees the diff and nothing
about the process that produced it: how many agents ran, how many review rounds
happened, what was caught, whether the thing that grades the project was
weakened on the way. All of it is recorded or re-derivable, and none of it
reaches the pull request.

The obvious rendering of that data is also the wrong one. A single table of
counts puts a number CI computed beside a number the contributor supplied, and
a reader cannot tell them apart. So the report's first commitment is that it
never does that.

## Four tiers, in a fixed order, never in one table

| Tier | What a number in it is evidence of | Source |
| --- | --- | --- |
| **Code-verified** | The repository itself, re-read now | `check`, `checkOracles`, `validateJournal`, `git` |
| **Hook-attested** | The harness emitted these; the agent had no opportunity to decline | the bundle, after re-validation |
| **Self-reported** | A coordinator's account of its own run | the bundle, after re-validation |
| **Unattributed** | Records that belong to nobody | the bundle, after re-validation |

The order is by independence from the contributor, descending. The
code-verified tier survives an absent bundle, a curated bundle and a hostile
one, so it is rendered first and rendered always.

The provenance line for each tier is a constant in the renderer, not a value
computed per run:

**Evidence:** `packages/claims/src/witnessReport.ts:789` — `const TIER_PROVENANCE: Record<TierId, string> = {`

## The card is a projection; it is not a fifth tier

Above the four tiers the report renders a **card**: one row per question a
reviewer asks about how the change was produced, each row carrying a mark, the
section it read, and that section's tier.

The card computes nothing of its own, and its signature is what says so. It
takes only the report's `tiers` — not a `RunReportInput`, not the whole report —
so it cannot call git, read the bundle, re-validate anything, or read the `card`
key that will be built from its own return:

**Evidence:** `packages/claims/src/witnessReport.ts:852` — `export function buildCard(report: Pick<RunReport, "tiers">): Card {`

Narrowing the parameter is doing real work. An earlier draft took the whole
`RunReport` and was called with a cast, which was safe only because the body
happened not to read the fields that were not yet there. The narrowed type makes
the guarantee structural rather than circumstantial.

**A row never assigns a tier.** It locates the tier that contains its section
and reports that, so a section moving tier moves its row with it and there is no
second place to edit. This is the same prohibition the module header states
about record kinds, applied to the one structure that could have re-introduced
it.

Three marks, never two: a figure nobody recorded and a figure that came back
zero are different facts, and rendering the first as the second is the
flattering default the tiers exist to prevent. A section whose figure is absent
marks *not recorded*, not *clear*.

Two mark shapes. Most rows want attention when a bad count is above zero; two —
did review happen, did reviewers run together — are inverted, because there the
count is the good thing and zero is the finding. A single rule would have
rendered a run with no review at all as clean.

The card carries **no composite score and no role inference**. Both were
proposed and refused: a weighted aggregate over these rows is a judgment in the
shape of a measurement, and deciding that an agent is a critique reviewer
because its name matched a pattern is a claim about a role evidenced by a
string.

Because a row holds only an id, a question, a section id, a tier and a mark —
every one a constant in the renderer — no contributor-controlled text reaches
the card at all. That is a stronger property than escaping one, and it is what
the tests assert.

## The report takes its tiers; it does not compute them

The three bundle tiers are counted from `JournalReport.provenance`, which the
validator computes and which is `null` below journal version `0.6`. The
renderer has no tiering rule of its own — no `tierOf`, no list of kinds mapped
to tiers, no reading of the header's `origin`. Below the floor it says so:

**Evidence:** `packages/claims/src/witnessReport.ts:1347` — `    (entry) => entry.report.provenance === null,`

That is this feature's own absence rule turned on its headline section. When it
was written, every journal in this repository was version `0.2` and the tier
breakdown rendered as an absence on this repository's own pull requests — which
was the correct output, because a tier breakdown is a claim about attribution,
the data carried none, and the alternative to saying so is inventing one.

The floor is now crossed rather than removed. The recorder writes the version
the floor names:

**Evidence:** `packages/kit/src/journalFile.ts:77` — `export const SCHEMA_VERSION = "0.6";`

so a range recorded by a session at that version renders its tiers. Older
journals do not disappear when the schema moves — a bundle may carry one of
each, and the absence is then reported per journal rather than for the report.
That is the same rule doing the same thing; the recorder walked over the floor
it describes, and the floor is still where it was.

## Absence is rendered as *not recorded*, never as zero

Every section renders its data or one line naming why it has none. The
distinction is carried in the structure and not only in the prose: a section
with no data has no `count` key at all.

**Evidence:** `packages/claims/src/witnessReport.ts:673` — `  return { id, title, statement, status: "not-recorded", reason, notes: [] };`

A zero would be a claim that the thing was counted and came to nothing. "No
oracles are configured" and "no oracle changed" are different facts and only
one of them is evidence.

## The grounding row reads the range's documents, and the description if given

The anchor section checks the range's changed files filtered by the project's
`docs` globs — and, when the caller names one, a pull-request description
alongside them:

**Evidence:** `packages/claims/src/cli.ts:861` — `  if (prBody !== undefined) docs.push(prBody);`

Without that second half the row is *not recorded* on every pull request that
changes no document the globs name, which on a repository whose globs cover
design documents is every code-only change. The description is the one
claim-carrying document a pull request always has, and it is the document an
agent writes its own summary of the change into — so a row that reads
"cannot be answered" while CI has just verified that body anchor by anchor is
reporting an absence that is an artefact of which file list it was handed.

The flag is the caller's, not a default. `witness report` over a bare range
knows nothing about a pull request; the Action passes `--pr-body` because it
has the event payload, and passes it to the JSON and the markdown invocation
alike, since the first decides whether the second may be posted.

## Selection is three-way, and inconclusive is not a synonym for excluded

`nullius-kit witness bundle` classifies each session journal against the range
by **time window** and by **mutation paths intersecting the range's changed
files** — never by the header's `branch`, which names where a session
*started*, so a session that produced a feature branch routinely says `main`.

- **included** — overlaps in time *and* mutates a file in the range.
- **inconclusive** — overlaps in time, mutates nothing in the range. This is
  what a review-only session looks like, and it is exactly the session this
  report exists to show. It is carried by session id into the report's *not
  recorded* list with the `--include` remedy, never silently dropped.
- **excluded** — no record falls in the window.

## Redaction is line-level; scoping is the report's job

The envelope carries **every source line** of a carried journal. Redaction
rewrites a line's fields and never drops a line, so a line the validator
rejects survives — and its `malformed` or `duplicate-id` verdict survives with
it. A record-level rule would have lost exactly those.

Range scoping therefore belongs to the renderer, and it reaches the
**mutation-derived tables and the flowchart only**:

**Evidence:** `packages/claims/src/witnessReport.ts:950` — `  const inRangeMutations = allMutations.filter(`

It never reaches the tier counts. `provenance` is a whole-journal partition
with no path predicate, so scoping it would mean the renderer re-partitioning
records itself — the one thing the tier rule above forbids. Records of kinds
that carry no path (`dispatch`, `report`, `finding`, `prompt`, and the ledger
kinds) are counted in full, and the report says so in each section rather than
implying they were scoped.

## The record → section map

| Record kind | Section | Scoped by the range? |
| --- | --- | --- |
| `dispatch` | Dispatches, Review rounds | no — carries no path |
| `report` | Dispatch outcomes, Model and tokens | no — carries no path |
| `mutation` | Files mutated in the range, Edit bursts | **yes** |
| `verification`, `append` | counted by the validator only | no |
| `finding` | Findings raised (hook-attested: a finding carries no per-record origin) | no |
| `prompt` | Operator turns | no |
| `stage`, `resolution`, `decision`, `check` | Stages, Resolutions, Decisions, Checks (self-reported) | no |
| — | Commits, Files changed, Evidence Anchors, Oracle conservation | from `git` and the checkers |

## Bundled journals are re-validated before any count is rendered

Every journal is rejoined from its lines and re-run through `validateJournal`
before a number is taken from it. If any journal fails, the three bundle tiers
render the validator's finding in place of their counts, and **no count is
printed** — the absence of the number is the point, not the presence of the
finding.

**What a green row does and does not certify.** `validateJournal` settles a
bundle's *internal consistency* and says nothing about its *completeness*. A
bundle with whole journals removed validates cleanly, and the report says so in
the section itself rather than in a footnote:

**Evidence:** `packages/claims/src/witnessReport.ts:1053` — `const JOURNAL_VALIDATION_STATEMENT =`

## The exit-code contract

| Situation | Exit |
| --- | --- |
| A report was produced | `0` |
| A rendered tier contains a failure | `0` |
| Usage error, or input this verb was handed and could not read | `2` |

A verb that re-runs `check`, `checkOracles` and `validateJournal` and then
minted its own verdict would be a **fourth** place for pass and fail to
disagree — and all three of the checks it wraps already gate in CI on their
own. So it does not:

**Evidence:** `packages/claims/src/cli.ts:999` — `  // Decision 13: a report was produced, so the verb exits 0. It renders three`

The distinction inside exit `2` is between *absent* and *unreadable*. A bundle
that is not at the given or default path is an absence the report renders. A
bundle that is there and is not an envelope is input this command was handed
and could not use, and it exits `2` naming the path.

## A rendered report is not a review report

The canary suppression renders the *fact* of a `canary-present` failure and
never its location, per the redaction rule above. Doing so means the rendered
markdown contains the literal verdict name — and `CANARY-` is one of the three
taint tokens `canary verify` scans for:

**Evidence:** `packages/claims/src/canary.ts:83@04cd9ac` — `const TAINT_TOKENS = ["canaries.json", ".git/nullius", "CANARY-"];`

So **a run report handed to `canary verify` scores `TAINTED` by construction**,
whatever the review layer did. That is correct behaviour from both sides and
worth stating once: the taint check exists to void a probe whose reviewer saw
the machinery, and a document that renders checker verdict names has seen it.

The two artefacts are not interchangeable. `canary verify` scores a *review
synthesis* — what reviewers said about a change. This renders *what a run did*.
Passing one where the other is expected is a category error, and this paragraph
is here so it is a documented one rather than a confusing `TAINTED` an hour
into a debugging session.

## Escaping

Every bundle- or document-derived string passes through a **markdown-cell**
escaper; every flowchart label passes through a **mermaid-label** escaper. The
mermaid grammar is an allow-list, not a deny-list:

**Evidence:** `packages/claims/src/witnessReport.ts:370` — `const MERMAID_ALLOWED = /[^A-Za-z0-9 ._:/x()-]/g;`

The `x` is ASCII, not `×` (U+00D7), which the label grammar has no need of.
Everything outside the list becomes `·`. Quoting is the second half of the
grammar and answers a different question: `:` is *inside* the allow-list, so
`a::b` survives replacement untouched and is made inert by the quotes alone.
Node ids are generated (`n0`, `n1`, …) and never derived from content — an id
is the one position in the grammar quoting cannot protect.

## Canary locations are never rendered

A `canary-present` result is counted as a failure and rendered with neither its
document nor its line. The renderer reaches canary state only through
`describeCanary`, called with `reveal` unset. The accessor is a chokepoint, not
a guarantee: it returns exactly `doc:line` on request, so the constraint is on
the call site, and a unit test asserts the rendered report contains neither.
The out-of-scope canary warning is never rendered at all.

## Determinism

No wall clock is read inside `buildRunReport` or either renderer. Every
timestamp comes from a record or a commit, which is what makes the committed
goldens under `spec/fixtures/report/` goldens rather than snapshots of the
moment they were taken.

## The two documents on one CLI

The JSON form carries a discriminator and its own version:

**Evidence:** `packages/claims/src/witnessReport.ts:41` — `export const RUN_REPORT_VERSION = 2;`

It embeds the `check --format json` document under its own key, **carrying that
document's own `version`**, rather than restating it. Two documents numbered
`version: 1` on one CLI, distinguishable only by which subcommand produced
them, is a consumer bug waiting for the first tool that reads a file it did not
invoke. The outer number reaching 2 while the inner stays 1 is the first time
that separation is visible rather than merely intended.

Version 2 added the `card` key. The number moved for a purely additive change
because compatibility is decided by the reading end's accepted **set**, not by
the writer's optimism: a consumer that recognises only 1 must refuse the
document rather than read the fields it happens to know.

## Fixtures

Under `spec/fixtures/report/`:

| File | What it is for |
| --- | --- |
| `pr58-session.jsonl` | This repository's own producing session for PR #58, redacted. Version `0.2`, header `branch: main`, 11 mutation paths of which 4 are in no pull request — the range-scoping case |
| `review-only.jsonl` | Version `0.6`. Overlaps in time, mutates nothing in range — the `inconclusive` case |
| `other-worktree.jsonl` | Every record outside the window — the `excluded` case |
| `rejected-lines.jsonl` | One unparseable line and one duplicate id — verdicts that must survive bundling |
| `stale-verification.jsonl` | A journal that genuinely reports `stale-verification` |
| `pr58-bundle.json` | The real envelope `witness bundle` wrote for `8211685..f431193` |
| `review-only-bundle.json` | The same range with `--include review-only` — a `0.6` journal, so the tier counts are real |
| `tampered-bundle.json` | An envelope hand-edited to drop a terminal record. `witness bundle` cannot produce it, which is what makes it a tamper |
| `pr58-check.json` | A real `check --format json` document over that range's documents |
| `pr58-oracle.txt` | The real `nullius oracle` output for that range — the unconfigured refusal |
| `golden-*.md.txt`, `golden-*.json` | The rendered forms, regenerated with `NULLIUS_UPDATE_GOLDENS=1`. The markdown goldens end in `.txt` so that `check 'spec/**/*.md' --require-markers` does not fail a rendered artefact for carrying no anchors of its own |

## Scope

The report claims nothing about *why* anything happened. Every sentence in it
is a template over counts and records; no model is anywhere in its path. It
does not parse coordinator prose, and it does not treat a bundle as evidence
about a contributor — the bundle is contributor-supplied by construction. What
it offers is the tier labels, so a reader knows which numbers survive a
contributor who wanted a different answer.
