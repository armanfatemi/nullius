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
| `claims-version`  | `0.11.0` | Checker version to run. Pinned, so `@v1` means one thing; set `latest` to float                              |
| `run-report`      | `false` | Post a **second** comment describing how the PR was produced (see below)                                     |

### The grounding card

On a pull request the comment leads with a card: documents checked, anchors
checked split into presence and absence, a count per verdict, and the failures.
The unstructured report follows, collapsed.

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
annotations only on lines in the diff. A result with no file at all, such as one
in the PR description, gets no annotation and still appears in the card: the
card is the complete record, and annotations are a convenience.

A registered canary is counted among the failures and its location is never
printed. The probe's value depends on that location not being published, and a
pull-request comment is the most public surface this Action writes to.

If the checker emits a report version this Action does not recognise, no card is
rendered: the unstructured report is posted instead and the step summary says
which version it saw. A partially parsed card would show a green-looking table
over a red run, visible only by comparing it against the exit code.
