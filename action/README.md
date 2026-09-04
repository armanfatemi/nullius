# nullius claims check — GitHub Action

Runs [`@nullius-inverba/claims`](../packages/claims/) on your PRs and reports every
unverified [Evidence Anchor](../spec/evidence-anchors.md). **Advisory by
default** — it comments and summarizes but never fails the job until you opt
into `strict`. Start advisory; go strict once the team trusts the verdicts.

## Usage

```yaml
name: claims
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write # for the report comment

jobs:
  claims:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # Rev-stamped anchors (`src/app.ts:12@a1b2c3d`) are settled with
          # `git show`, which needs the commit they name. The default shallow
          # clone does not have it — those anchors then fail open as the
          # advisory UNVERIFIABLE-REV, and the permanent gate goes quiet.
          # Omit this line if your documents carry no stamped anchors.
          fetch-depth: 0
      - uses: armanfatemi/nullius/action@v1
        with:
          globs: "docs/rfcs/**/*.md"
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input             | Default | Meaning                                                                                                       |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `globs`           | `''`    | Space-separated doc globs; omit to use `nullius.config.json` docs (no globs + no config skips the docs check) |
| `pr-body`         | `true`  | Also check the **PR description itself** — the one claim-carrying document every workflow has                 |
| `config`          | `''`    | Explicit config path                                                                                          |
| `strict`          | `false` | Fail the job on unverified claims                                                                             |
| `require-markers` | `false` | Fail when the docs check finds no grounding markers at all                                                    |
| `comment`         | `true`  | Upsert a single PR comment (updated in place on every run)                                                    |
| `github-token`    | `''`    | Token for the comment; omit to skip commenting                                                                |
| `claims-version`  | `0.12.0` | Checker version to run. Pinned, so `@v1` means one thing; set `latest` to float                              |
| `run-report`      | `false` | Post a **second** comment describing how the PR was produced (see below)                                     |
| `run-report-bundle` | `''`  | Path to the committed envelope; empty means `nullius.runs/<branch-slug>.json`                                |

Pinning this action without pinning its checker would not be a pin: every run
would fetch npm's `latest`, and a breaking CLI change would reach every caller
the day it published. So `claims-version` has a default, and `@v1` is
reproducible. Bump it deliberately, or set `latest` to opt out.

No design-doc culture needed: with `pr-body` alone (no globs, no config), the
action checks only the PR description. An agent-written PR body saying "safe —
nothing else reads this field" is exactly the claim this exists for; teach
your agent to anchor it and the description becomes verifiable. The body is
read from the event payload, never interpolated into shell — it is
PR-controlled content.

The comment is upserted by a hidden marker, so re-runs edit one comment
instead of stacking new ones.

## The grounding card

On a pull request the comment leads with a card: documents checked, anchors
checked split into presence and absence, a count per verdict, and the failures.
The unstructured report follows, collapsed, under the same hidden marker so
re-runs still edit one comment.

**What the card does not claim.** A verdict certifies the citation and not the
argument built on it — a real line, quoted accurately, can still support a false
conclusion. The card says so, because a tidy green table reads as a stronger
claim than the prose it replaces, and that is the one thing it must not imply.
Reasoning is what `nullius audit` examines, and the card does not run it.

Failing anchors are also emitted as workflow annotations, at `error` when
`strict` is on and `warning` when it is not, so an annotation's severity never
disagrees with whether the run blocks. Annotations anchor to the *document*
making the claim rather than the file it cites, because an Evidence Anchor by
construction cites code the pull request did not change — and GitHub renders
annotations only on lines in the diff. A result with no file at all gets no
annotation and still appears in the card: the card is the complete record, and
annotations are a convenience.

A registered canary is counted among the failures and never located. The probe's
value depends on that location not being published, and a pull-request comment
is the most public surface this action writes to.

If the checker emits a report version this action does not recognise, no card is
rendered: the unstructured report is posted instead and the step summary says
which version it saw. A partially parsed card would show a green-looking table
over a red run, visible only by comparing it against the exit code.

Jump links in the card are built from `GITHUB_SHA`, which on a `pull_request`
event is the merge commit — the same commit `actions/checkout` checked out, so
the line numbers agree. They rot once the pull request closes, which is the
accepted cost of linking to a commit that exists rather than to a branch that
moves.

## The run report

With `run-report: true` the action posts a **second** comment, under its own
marker, describing how the pull request was produced: agent dispatches, review
rounds, file mutations, and the coordinator's own ledger records. It reads a
committed envelope written by `nullius-kit witness bundle`, which the
contributor commits to the branch.

Two comments, never one table. The grounding result and the process result
answer different questions and carry different weight, and a single table would
let a contributor-supplied count sit beside a CI-computed one as an equal.

### What each tier is worth

The report renders four tiers, in a fixed order, and the order is the point:

1. **Code-verified** — re-run in CI from the checkout. `check` over the PR body
   and touched documents, `oracle` over the range, `witness validate` over
   every bundled journal. **This tier needs no bundle and is rendered first**,
   because it is the only one a contributor cannot shape.
2. **Hook-attested** — from the bundle, after every journal in it re-validates.
   Written by the harness, which the agent had no opportunity to decline.
3. **Self-reported** — also from the bundle: records the coordinator wrote
   about its own run. A claim, made by the party with the motive, sitting next
   to evidence it did not write.
4. **Unattributed** — records belonging to neither, which the validator counts
   separately rather than folding into the flattering option.

### What it does not claim

- **A bundle is contributor-supplied by construction.** The report re-validates
  it and labels it, and `validateJournal` checks a journal's internal
  consistency — never its completeness. **A bundle with whole journals removed
  validates cleanly.** Nothing here is enforcement, and the tier that needs no
  bundle is first for that reason.
- **A missing bundle is not evidence of anything.** The three bundle tiers
  render *not recorded*, naming the path that held nothing. Absence is never
  rendered as zero.
- **Below journal version `0.6` there is no tier breakdown**, because the
  validator computes none — the report says so and names the version rather
  than inventing an attribution.
- **No model writes any of it.** Every sentence is a template over counts and
  records.

### It needs a published checker

The action `npx`-installs the version in `claims-version`, so `witness report`
has to exist in **that published release**, not merely in your checkout. Until
one ships carrying the verb, enabling `run-report` renders nothing and says so
in the step summary.

## Notes

- The action runs `npx -y @nullius-inverba/claims`, so it always uses the latest
  published checker; pin a version with your own `npx @nullius-inverba/claims@x.y.z`
  step if you need reproducibility.
- Absence citations execute `grep`/`rg` pipelines from the checked-out repo
  root; the checker's sandbox rejects anything else without executing it (see
  the [security model](../spec/evidence-anchors.md#security-model)).
- **Squash-merge destroys the commits stamped anchors name.** A document merged
  that way points at an object the default branch no longer has, and its
  stamped anchors report `UNVERIFIABLE-REV` from then on — advisory, never a
  failure. Repositories that keep merge commits, or that re-stamp on merge,
  keep the hard gate; either way the checker never turns an unreachable commit
  into an accusation.
