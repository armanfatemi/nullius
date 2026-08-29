# Design — add-touched-areas-from-anchors

## Context

`touchedPaths(text)` is called with the concatenated content of
`proposal.md` and `tasks.md` from two call sites — `touched-areas` and
`route`:

**Evidence:** `packages/kit/src/pipeline.ts:528@2792fa1` — ``      for (const path of touchedPaths(`${proposal}\n${tasks}`)) console.log(path);``

**Evidence:** `packages/kit/src/pipeline.ts:575@2792fa1` — ``      const paths = [...touchedPaths(`${proposal}\n${tasks}`), ...artefacts];``

Its result feeds `routeAgents`, which decides which of `rule-auditor`,
`checker-engineer`, `architecture-reviewer`, `test-engineer` a change earns:

**Evidence:** `packages/kit/src/pipeline.ts:157@2792fa1` — `export function routeAgents(paths: readonly string[], root: string): AgentName[] {`

This proposal changes only what `touchedPaths` returns. `routeAgents` and
every caller downstream of it are unaffected — they already accept "a list of
repo-relative paths" and do not care how the list was produced.

## Decisions

### 1. Union two independent scans, rather than one unified regex

**Chosen:** `touchedPaths` keeps its existing `PATH_TOKEN` bare-backtick scan
unchanged, and additionally runs the same text through the kernel's
`parseClaims`, keeping only `presence`-kind claims' `.path` field. The two
result sets are unioned (the function already de-duplicates via a `Set`
before sorting).

```ts
import { parseClaims } from "@nullius-inverba/claims";
// ...
export function touchedPaths(text: string): string[] {
  const found = new Set<string>();
  for (const hit of text.matchAll(PATH_TOKEN)) {
    const path = hit[1];
    if (path !== undefined) found.add(path);
  }
  for (const claim of parseClaims("touched-areas-scan", text)) {
    if (claim.kind === "presence") found.add(claim.path);
  }
  return [...found].sort();
}
```

(Illustrative — task 1.1 in `tasks.md` resolves the exact form.)

**Alternatives considered:**
- **Extend `PATH_TOKEN` itself to also match the `:LINE@rev` suffix form** —
  rejected. `PATH_TOKEN` is a generic "any backticked thing that looks like a
  path" matcher; the `**Evidence:**` marker is a specific, already-parsed
  grammar with its own rules (list-marker prefixes, double-vs-single-backtick
  spans, block-head continuation — see `add-evidence-marker-near-miss`
  design.md for how much surface that grammar actually has). Re-deriving
  those rules inside `PATH_TOKEN` duplicates a parser this repository already
  maintains, tests, and keeps correct as its own module boundary — exactly
  the situation this proposal exists to stop.
- **Replace `PATH_TOKEN` entirely with `parseClaims`-only extraction** —
  rejected. `parseClaims` only recognizes `**Evidence:**`-marker citations.
  `tasks.md` checklist items routinely mention a file as a plain backticked
  name with no marker at all (e.g. "- [ ] update `packages/kit/src/cli.ts`"),
  which `parseClaims` would never see. Dropping `PATH_TOKEN` would trade one
  blind spot for a different, larger one.

**Rationale:** The two extractors answer different questions — "what does
this text cite as evidence" versus "what does this text mention as a file" —
and a change's touched-areas answer needs both. Keeping them as two scans
unioned at the result-set level, rather than merging their regexes, keeps
each one's correctness independently verifiable and keeps `parseClaims`'s
grammar rules owned in exactly one place.

**A `doc` name is required by `parseClaims`'s signature but unused here** —
only `claim.path` is read, and `SourceLocation.doc`/`.line` are discarded.
Task 1.1 picks a fixed literal (e.g. `"touched-areas-scan"`) since nothing
downstream reads it; this is a call-site detail, not a design decision.

## Open questions

None.
