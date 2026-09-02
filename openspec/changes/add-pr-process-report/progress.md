# Progress — proposal-to-pr: add-pr-process-report

_Started 2026-08-31; last updated 2026-08-31_

## Phases completed

- [x] Stage 1: Load
- [x] Stage 2: Pre-review iterations 1–5 — probe CAUGHT all five rounds
- [x] Stage 3: Refine iterations 1–5; Decisions 2–4 rewritten clean
- [x] Stage 4 chunk 1: Stage A — the bundle, `5d43133`, Stage 5 green
- [x] Stage 4 chunk 2: Stage B — the report, `62083ec`, Stage 5 green

## Commits on this branch

- `674a225` docs — five pre-review rounds of design refinement
- `5d43133` feat(kit) — `witness bundle`, Stage A
- `2255fc8` chore(openspec) — archive four landed changes, apply their spec deltas
- `742bf64` docs(agent-memory) — reviewer learnings from this run
- `62083ec` feat(claims) — `witness report`, Stage B

## Current phase

**Stage 4 (Implement)**, chunk 3 of 3: **Stage C** — Action input, `init`/`doctor`,
the skill's Stage 8 edit, docs and CHANGELOGs. Tasks §7–§10. 41/54 done.

## Next 3 actions

1. Receive Stage C, run Stage 5 myself, commit
2. Stage 6 post-review routed on `git diff main...HEAD | pipeline route-paths`
3. Stage 7 if blockers, else Stage 8 PR

## Integration points the next session needs to read on resume

- action/action.yml:142 — `marker='<!-- nullius-claims -->'`, matched by startswith; the new marker must not prefix it in either direction
- action/action.yml:157 — the existing post swallows failure with `|| true`; the new step must surface it
- packages/kit/src/cli.ts:527 — `readKitProfile`, three-way shape, currently parses only `profile`
- packages/kit/src/render.ts:158-161 — the workflow `with:` template literal
- packages/kit/src/doctor.ts:699 — `checkWorkflow`; `Check.status` includes `fact`

## Lessons carried into the Stage C brief

- **State the repository's prohibitions, not only the APIs.** Chunk 2's brief
  pinned every signature and omitted hard rule 12; the returned CI step stored
  the checker command in a shell variable and called `$claims` at seven sites.
  Correct under bash, which is why the rule targets the pattern. Stage C's brief
  lists the prohibitions explicitly.
- Verify the implementer's central claims directly; both chunks' reports were
  accurate, and checking cost minutes.
- Run the canary round trip **with the plant CI performs first**, never bare.

## Known gate-list discrepancies (verify against CI, not the skill)

- The skill lists `check 'README.md' 'spec/**/*.md' --require-markers`; that
  fails because README.md has no markers. CI runs `spec/**/*.md` alone.
- `check '.canary-probe.md'` only fails when a canary is planted first.

## Pending user decisions

- None open.
