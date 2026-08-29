# Pipeline routing — touched-areas recognizes Evidence Anchor citations

## ADDED Requirements

### Requirement: touchedPaths extracts paths cited only through an Evidence Anchor marker

`touchedPaths` SHALL extract a file path from a `**Evidence:**` marker
citation (`path:LINE` or `path:LINE@rev`, per the Evidence Anchors grammar),
in addition to any bare backticked filename it already finds.

A path cited only inside an Evidence Anchor, with no separate bare
backticked mention elsewhere in the same text, SHALL appear in
`touchedPaths`'s result.

A path cited both as a bare backticked filename and inside an Evidence
Anchor SHALL appear exactly once in the result.

#### Scenario: A path cited only via an Evidence Anchor is found

- **WHEN** the input text contains only the line `**Evidence:** \`packages/claims/src/canary.ts:49@8c6ea59\` — \`text\`` and no other mention of that file
- **THEN** `touchedPaths` includes `packages/claims/src/canary.ts` in its result

#### Scenario: A bare backticked filename with no marker is still found

- **WHEN** the input text contains only `` - [ ] update `packages/kit/src/cli.ts` `` with no `**Evidence:**` marker
- **THEN** `touchedPaths` includes `packages/kit/src/cli.ts` in its result
