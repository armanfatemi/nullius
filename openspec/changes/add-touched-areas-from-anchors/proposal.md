# Proposal — add-touched-areas-from-anchors

> **Depends on:** None

## Problem

`touchedPaths` — the function behind `proposal-to-pr`'s `touched-areas` and
`route` commands, which decides which reviewer agents a change earns — finds
paths with its own standalone regex over `proposal.md`/`tasks.md` prose:

**Evidence:** `packages/kit/src/pipeline.ts:129@2792fa1` — `` const PATH_TOKEN = /`([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(?:ts|md|json|jsonl|ya?ml|sh))`/g; ``

It requires the file extension to be the last character before the closing
backtick, so it cannot extract a path out of this repository's own canonical
Evidence Anchor citation shape, which appends `:LINE` (and optionally `@rev`)
inside the same backtick pair. Confirmed directly:

```
PATH_TOKEN.exec("`packages/claims/src/canary.ts:49@8c6ea59`") → no match
```

That citation form is not an edge case — it is how every `**Evidence:**` line
in this repository's own proposals cites a file, including this repository's
own `openspec/changes/*/tasks.md` "Code this change reasons about" sections.
Any file cited *only* through an Evidence Anchor, with no separate bare
backticked mention elsewhere in prose, is invisible to `touchedPaths`, and
therefore invisible to `routeAgents`'s dispatch decision. This is not
hypothetical: a real run had `test-engineer` dropped from routing for exactly
this reason and had to be dispatched by hand after the gap was noticed.

`packages/kit` already depends on `@nullius-inverba/claims` and already
imports from it directly in this same file:

**Evidence:** `packages/kit/src/pipeline.ts:15@2792fa1` — `import { scanRules, selectRules } from "@nullius-inverba/claims";`

and the kernel already exports a parser that produces a clean `PresenceClaim`
with a `path` field per citation, the `:LINE`/`@rev` suffix already stripped:

**Evidence:** `packages/claims/src/parseClaims.ts:319@2792fa1` — `export function parseClaims(doc: string, content: string): Claim[] {`

`touchedPaths` re-implements a weaker version of a grammar the kernel already
parses correctly, rather than reusing it.

## Why now

Directly caused a routing miss on a real run — not a hypothetical gap, a
measured one, per the survey behind this proposal
(`.claude/skills/proposal-to-pr/SKILL.md`'s `route`/`touched-areas` commands
are load-bearing for which reviewers a change gets).

## What changes

- `touchedPaths` unions its existing bare-backtick-filename scan with the
  paths `parseClaims` extracts from the same text as `presence` claims —
  closing the Evidence-marker blind spot without discarding the broader
  prose scan, which still matters for plain backticked filenames that appear
  outside any `**Evidence:**` marker (a common shape in `tasks.md` checklist
  items).
- No change to `routeAgents`'s signature (`(paths, root)`, established by
  `add-rules-compliance`) or to the `rule-auditor` pre-filter it added — this
  proposal only changes what paths `touchedPaths` returns, not what
  `routeAgents` does with them.
- No new CLI command, no new verdict, no schema change.

## Non-goals

- Not changing `routePathsFrom`/`route-paths`, which routes exactly the paths
  it is given from a diff and deliberately does not run prose extraction at
  all — that boundary is correct today and this proposal does not touch it.
- Not deduplicating or restructuring `PATH_TOKEN` itself — the two extraction
  paths (bare-backtick scan, Evidence Anchor scan) are unioned as two
  independent sources, not merged into one pattern. See `design.md` Decision 1.

## Dependencies

### Hard (must be merged before this starts)

None.

### Soft (design assumes these exist; graceful degradation if absent)

None. `add-evidence-marker-near-miss` (a sibling proposal from the same
backlog survey) improves how many near-miss `**Evidence:**` lines the kernel
parser recognizes, which would only ever add more paths this change's
`parseClaims`-based extraction can find — there is no ordering requirement
between the two; this proposal works correctly against the parser as it is
today.

### Enables (future changes that will depend on this)

None known.

## Size estimate

|                                 |                                       |
| ------------------------------- | -------------------------------------- |
| Estimated tasks                 | ~6                                     |
| Packages or surfaces touched    | 1 (`packages/kit`, consuming an existing `packages/claims` export) |
| Risk                            | LOW                                    |
| Expected sessions to implement  | 1                                      |

## Open questions

None.
