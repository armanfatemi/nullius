# Add wiring check — references that must resolve

## Why

Harness artifacts reference each other by name and by path, and nothing
checks that the referent exists. A skill naming an agent with no definition
file does not error: the dispatch silently no-ops and the run reports a
completed review having reviewed nothing. The same silence covers a rule
whose `applies_to` glob matches no file, and a hook whose command was moved
by a refactor.

Every one of those is a filesystem fact, which makes this checker territory
rather than reviewer territory.

## What Changes

- **`nullius wiring [root]`** (kernel): scan the harness artifacts under a
  root and report references that do not resolve. Six hard verdicts over
  declared frontmatter fields only — `DANGLING-AGENT`, `DANGLING-SKILL`,
  `MISSING-PATH`, `EMPTY-GLOB`, `DEAD-HOOK`, `UNSUBSTITUTED-TOKEN` — plus
  advisory `LOOSE-REFERENCE` for a backticked path in prose that does not
  resolve.
- **Its own verdict union.** The kernel's exported `Verdict` is public API
  whose growth is breaking, a lesson already paid for once:

**Evidence:** `packages/claims/src/witness.ts:48@7846833` — `export type JournalVerdict =`

- **A permissive-subset flat frontmatter parser** (kernel): scalars, inline
  flow lists, and block lists — no nesting, no anchors, no multi-line
  scalars — hand-rolled rather than a YAML dependency. It is not a
  closed-key validator: a key it does not recognize is simply not read,
  since the harness fields it scans are not a schema this tool owns.

## Impact

- Affected specs: `wiring` (new capability spec)
- Affected code: `packages/claims/src/`, `.github/workflows/ci.yml`
