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
| `claims-version`  | `0.9.0` | Checker version to run. Pinned, so `@v1` means one thing; set `latest` to float                              |

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
