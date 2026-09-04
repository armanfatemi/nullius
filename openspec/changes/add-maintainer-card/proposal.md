# Proposal — add-maintainer-card

> **Depends on:** None

## Problem

The Action's entire report to a maintainer is a fenced dump of the checker's
human-format stdout and stderr, merged:

**Evidence:** `action/action.yml:86@5f88e21` — `          docs_output=$(npx -y "@nullius-inverba/claims@${CLAIMS_VERSION}" check $GLOBS "${args[@]}" 2>&1)`

**Evidence:** `action/action.yml:122@5f88e21` — `        } >> "$GITHUB_STEP_SUMMARY"`

A maintainer triaging a queue of agent-authored pull requests has to read
prose to answer three questions that are already computed as numbers: how many
claims were checked, how many failed, and which ones. The structured output
that answers them shipped, and the Action does not read it — every result already
carries its verdict, a precomputed pass/fail bit, and its position in the
source document:

**Evidence:** `packages/claims/src/checkReport.ts:195@5f88e21` — `  failing: boolean;`

**Evidence:** `packages/claims/src/checkReport.ts:196@5f88e21` — `  source: { doc: string; line: number };`

**Evidence:** `packages/claims/src/checkReport.ts:216@5f88e21` — `  verdicts: Partial<Record<Verdict, number>>;`

**Evidence:** `grep -rn 'format json' action/` → 2 results

This count has now moved twice, for opposite reasons, and the difference is the
whole point of the anchor. The first result is `add-pr-process-report`'s
run-report step, which landed after this proposal was written and asks the
checker for JSON on a **different** verb — the count moved without the gap
closing. The second is this change's own card step, and there the count moved
**because the gap closed**: the Action now reads `check --format json`, which is
the machine-readable rendering this proposal was written about.

An anchor that had been left at 1 would still be green today and would be
describing a repository that no longer exists.

The second half of the problem is that the fenced dump is, in one specific
respect, the *safe* rendering — and any replacement inherits a hazard the
current version does not have. The checked document is attacker-controlled:

**Evidence:** `spec/evidence-anchors.md:398@5f88e21` — `The checked document is **untrusted input** — in a CI setting it is`

A markdown table renders its cell contents as markdown, and a GitHub workflow
annotation is a command a literal `::` or newline can break out of. Verdict
detail strings derived from a PR-controlled document flow into both.

## Why now

`--format json` was built for this consumer and named it at the time. Until
something reads it, the schema has no exercised contract and is free to drift;
the first consumer is what makes the version discipline real.

## What changes

- The Action invokes `check --format json`, parsing stdout only, with stderr
  kept separate — the CLI guarantees this split:

  **Evidence:** `packages/claims/src/cli.ts:1086@5f88e21` — `    // stdout is the document and nothing else. Every diagnostic below keeps`

- The PR comment and step summary render a **grounding card**: a table of what
  was checked, what passed, what failed, broken out by verdict, plus a list of
  failing anchors with jump links.
- Every value interpolated into the card is escaped for markdown table cells;
  every value interpolated into an annotation is escaped for workflow-command
  syntax.
- The Action emits `::error` / `::warning` annotations for failing results,
  anchored to the **markdown document** line, not the cited source file.
- The card states what a green result does and does not mean, and names
  `audit` as the check it is not.
- The Action refuses to render a card when the report's `version` is not one
  it understands, falling back to the human dump rather than guessing.
- This repository's CI adopts the card so it is dogfooded. Note that its
  current oracle step text-greps the human format's uppercased verdict token,
  and says so — adopting JSON output there without adjusting that grep would
  break a de facto contract CI already relies on:

  **Evidence:** `.github/workflows/ci.yml:247@5f88e21` — `      #    verdict.toUpperCase(), so the token is a de facto contract — but a`

## Non-goals

- **Any kernel change.** `packages/claims` is untouched; this is a consumer.
- **Reporting on the agent run that produced the PR.** Witness journal data is
  local, gitignored, and contributor-controlled; putting it in the same table
  as code-verified counts is the specific confusion this card must avoid.
- **Claiming the document's reasoning is sound.** Out of scope by construction
  — see Decision 2.
- **Diff-scoped strictness.** Separate change; the card gains its tier row
  additively when that lands.

## Dependencies

### Hard (must be merged before this starts)

None. `check --format json` is already released.

### Soft (design assumes these exist; graceful degradation if absent)

- `add-authoring-ergonomics` — introduced `--format json` and named PR
  annotations as its intended consumer. Implemented but unarchived; its spec
  delta has not folded into `openspec/specs/`.
- `add-canary-status-redaction` — narrows what canary output may reveal. The
  card must not echo canary plant locations into a public PR comment; if that
  change lands first, this one inherits the rule rather than restating it.

### Enables (future changes that will depend on this)

`add-diff-scoped-strictness` — the card is where a two-tier result becomes
legible to a maintainer. Without it, a third strictness state is invisible.

## Size estimate

|                                |                                        |
| ------------------------------ | -------------------------------------- |
| Estimated tasks                | ~18                                    |
| Packages or surfaces touched   | 3 (action/, .github/workflows, openspec/specs/check-cli) |
| Risk                           | MEDIUM                                 |
| Expected sessions to implement | 1–2                                    |

## Open questions

1. **Where does the escaping logic live?** Bash + `jq` inside `action.yml`
   keeps the Action self-contained but puts security-relevant string handling
   in the least testable language available. A small kit subcommand would be
   unit-testable but adds a second npm fetch to every run. Resolve in Stage 3.
2. **Should annotations be `::error` or `::warning` in advisory mode?** An
   `::error` annotation on a job that passes is a mixed signal; a `::warning`
   on a hard failure understates it. Likely keyed to the `strict` input.
3. **What is the card's behaviour when the PR body is the only checked
   document?** A PR description is not a file in the diff, so its failing
   anchors can carry no annotation at all. The card must not imply otherwise.
