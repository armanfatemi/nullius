# Design — add-pr-process-report

## Context

**Where the data is, and what it can answer.** Journals record dispatches,
reports, mutations (and, after `add-run-ledger-producer`, findings, ledger
kinds and prompts). The header's identity names where the session *started*,
by definition:

**Evidence:** `spec/witness-journal.md:176@c8305b1` — `| `head` | **The commit the session started from** |`

so the session that produced a feature-branch PR routinely carries `branch:
main`. Selection has to come from the records, not the header. The kernel's
survey validates journals independently and never merges their timelines,
which the bundle and the report both keep:

**Evidence:** `packages/claims/src/witness.ts:1376@c8305b1` — ` * The records are never combined into one timeline, and that is the whole`

**The kernel's range plumbing** is `oracle`'s and is internal to the package:

**Evidence:** `packages/claims/src/oracleGit.ts:67@c8305b1` — `export function parseRange(range: string): ParsedRange | { error: string } {`

**Evidence:** `packages/claims/src/oracleGit.ts:225@c8305b1` — `export function gitOracleDeps(`

**Evidence:** `packages/claims/src/oracle.ts:231@c8305b1` — `export function checkOracles(`

**Evidence:** `grep -rn 'checkReport' packages/claims/src/index.ts` → 0 results

**The JSON report** the code-verified tier reads has a version and a policy:

**Evidence:** `packages/claims/src/checkReport.ts:262@c8305b1` — `export const REPORT_VERSION = 1;`

**Evidence:** `packages/claims/src/checkReport.ts:236@c8305b1` — ` * - Adding a member to the `Verdict` union is ALSO breaking — for any consumer`

**The Action** upserts by prefix match on a marker, and swallows a failed post:

**Evidence:** `action/action.yml:152@c8305b1` — `          | jq -r --arg m "$marker" '[.[] | select(.body | startswith($m)) | .id][0] // empty') || existing=''`

**Evidence:** `action/action.yml:157@c8305b1` — `          gh api -X POST "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" -f body="$body" >/dev/null || true`

**Evidence:** `action/action.yml:47@c8305b1` — `    default: '0.8.0'`

Nothing in the repository escapes markdown or workflow commands, renders
mermaid, or exercises the Action in CI:

**Evidence:** `grep -rn '%0A' action/ packages/claims/src packages/kit/src` → 0 results

**Evidence:** `grep -rn 'mermaid' action/ packages/ docs/ README.md .github/` → 0 results

**Evidence:** `grep -rn 'uses: ./action' .github/workflows/ci.yml` → 0 results

**`init` and `doctor`** dispatch on the workflow's path and test its content by
substring:

**Evidence:** `packages/kit/src/render.ts:319@c8305b1` — `    } else if (artifact.path === ".github/workflows/claims.yml") {`

**Evidence:** `packages/kit/src/render.ts:160@c8305b1` — `          globs: ${globs}${requireMarkers}${strict}`

**Evidence:** `packages/kit/src/doctor.ts:564@c8305b1` — `  const path = join(root, ".github", "workflows", "claims.yml");`

**Redaction** has one accessor and one known structured leak:

**Evidence:** `packages/claims/src/canary.ts:401@c8305b1` — `    claim: { kind: "canary", source: { doc, line: entry.line } },`

**Evidence:** `packages/claims/src/cli.ts:1109@c8305b1` — `        "warning: the registered canary points at a document outside the matched set — not read; run `canary clear` if it is stale",`

**Stage 8** seeds the PR body from the evidence file and then opens the PR:

**Evidence:** `.claude/skills/proposal-to-pr/SKILL.md:1041@c8305b1` — `node packages/kit/dist/cli.js pipeline evidence-print <change>`

**Evidence:** `.claude/skills/proposal-to-pr/SKILL.md:1113@c8305b1` — `gh pr create --base <resolved-base> --head feat/<change> `

## Decisions

### 1. Three tiers, fixed order, separate tables

**Chosen:** the report renders *code-verified* (re-run in CI), then
*hook-attested* (bundle, after re-validation), then *self-reported* (bundle,
coordinator-authored kinds), each under its own heading with a one-line
provenance statement, and a closing *not recorded* list. No table mixes tiers.

**Alternatives considered:**

- **One summary table** — rejected: it is the confusion `add-maintainer-card`
  refuses (`proposal.md:74`, cited in `proposal.md`), and it lets a
  contributor-supplied count sit beside a CI-computed one as equals.
- **Bundle tiers first, because they are the novel content** — rejected: the
  contributor-independent tier is the only one a hostile contributor cannot
  shape, so it goes where a skimming maintainer looks first.

**Rationale:** the critic's strongest objection to this feature is that the
signal is absent exactly where it matters. Ordering by independence from the
contributor is the structural answer: the part that survives an absent or
curated bundle is rendered first and rendered always.

### 2. A committed envelope, outside `.nullius/`

**Chosen:** `witness bundle` writes `nullius.runs/<branch-slug>.json` — a JSON
envelope `{ version, range, selection, journals: [{ session, header, records
}] }` — which the contributor commits. CI reads it from the checkout.

**Alternatives considered:**

- **A git ref** (`add-journal-sealing`) — rejected for v1: refs are not part
  of a fork's pull request and need push permissions the Action does not have.
  Kept as a second read source for `bundle` once sealing lands.
- **Under `.nullius/`** — rejected: the directory's existence switches
  recording on for anyone who clones (`profiles.ts:66`, cited in
  `proposal.md`).
- **JSONL of concatenated journals** — rejected: a journal-level header record
  for the envelope would be `MALFORMED` to the validator, and concatenation is
  the merge the survey refuses.

**Rationale:** a file in the diff is reviewable, travels with any PR, and can
be re-validated per journal by reconstructing each journal's JSONL from the
envelope and handing it to `validateJournal`.

### 3. Selection by overlap, printed and overridable

**Chosen:** a journal is selected when (a) its record timestamps overlap
`[first commit author time − slack, last commit author time + slack]` for the
range, and (b) at least one `mutation.target.path` is in the range's changed
files. `selection` in the envelope records the rule, the slack, and each
candidate's inclusion with its reason; `--include <session>` / `--exclude
<session>` override and are recorded as overrides.

**Alternatives considered:**

- **Header `branch` equals the PR branch** — rejected: it names where the
  session started (`spec/witness-journal.md:176`, above), and in this
  repository's own history the producing session started on `main`.
- **Time overlap alone** — rejected: a concurrent session in another worktree
  overlaps in time and touched nothing in the range.

**Rationale:** the rule is deterministic, the report states it verbatim, and
an override is visible rather than silent.

### 4. What the bundle carries, and what it strips

**Chosen:** header minus `user.email`; `dispatch` (with `task`, `agent`,
`expects`, `prompt`), `report` minus `findings` bodies (kept: `outcome`,
`statement` capped, `model`, `usage`, `response_chars`), `mutation`,
`finding` (text capped), `stage`, `resolution`, `decision`, `check`, `prompt`
(text capped; dropped entirely under `--no-prompts`). Nothing else.

**Rationale:** the report needs counts, names, paths, severities and short
texts; it does not need a reviewer's full return. Every string that survives
is PR-controlled input to the renderer and is escaped there. Canary results
are never in a journal; the canary's outputs are re-run in CI and pass
through `describeCanary`'s discipline (Decision 8).

### 5. The renderer is kernel code, pure, versioned

**Chosen:** `packages/claims/src/witnessReport.ts` builds a `RunReport`
structure from `{ bundle, range deps, check run, oracle report }` with no I/O,
and two renderers (`renderMarkdown`, `renderJson`) read it. The CLI verb
`witness report` wires it: `oracle` through `checkOracles` +
`gitOracleDeps` in-package (which is why this lives in the kernel and not the
kit — neither is exported), `check` through the existing collectors,
`validateJournal` per bundled journal. JSON carries `version: 1` under the
same policy as `checkReport`.

**Alternatives considered:**

- **Render in the kit** — rejected: `oracle` and `checkReport` are not on the
  published API, and adding them there for one consumer is a larger public
  surface than a verb.
- **Render in the Action with `jq`** — rejected: the escaping is
  security-relevant and `jq`-in-YAML is untestable, which is the same
  reasoning `add-maintainer-card` left open and this settles.

### 6. Escaping and the mermaid label grammar

**Chosen:** two escapers in the renderer, unit-tested against an adversarial
fixture: markdown-cell (pipes, newlines, backticks, angle brackets, leading
control characters) and mermaid-label (labels quoted; the character set
restricted to `[A-Za-z0-9 ._:/×()-]`, everything else replaced with `·`; a
maximum label length). The Action posts the markdown verbatim and never
interpolates report strings into a workflow command.

**Rationale:** every string reaching the renderer is contributor-controlled;
the renderer is the one place with tests.

### 7. Rounds, bursts and the flowchart

**Chosen:** a *round* is a maximal set of dispatches whose start times fall
within `ROUND_WINDOW_MS` of the first and which contains at least two
dispatches; an *edit burst* is the mutations between consecutive rounds or
commits, grouped by path with counts; *commits* come from `git log` of the
range; *prompts* are placed by timestamp. The chart is `flowchart LR` over
those nodes in time order. The window is printed under the chart.

**Rationale:** each node is a deterministic function of timestamps the
harness wrote; nothing infers intent.

### 8. Redaction inherited, not restated

**Chosen:** `canary-present` results contribute to the failure count and
render neither `source.doc` nor `source.line`; the out-of-scope warning
(`cli.ts:1109`) is never rendered; the renderer takes canary state only
through `describeCanary`.

### 9. Second comment, second marker, size budget

**Chosen:** the Action's new step upserts under `<!-- nullius-run-report -->`
— not a prefix of `<!-- nullius-claims -->`, since the upsert matches by
`startswith` — truncates at a stated budget with a visible line pointing at
the JSON artefact uploaded alongside, and writes the same body to the step
summary. A failed post is reported in the step summary rather than only
swallowed.

### 10. `init --run-report`, `nullius.kit.json`, `doctor`

**Chosen:** the flag sets `runReport: true` in `nullius.kit.json`;
`renderWorkflow` emits `run-report: true` when set; `doctor` adds a `run
report` check — `fact: not enabled` when the config lacks it, `pass` when the
workflow carries the input, `fail` when the config asks and the workflow does
not. `doctor --fix` re-renders as it does today.

### 11. Single commit

**Chosen:** `witness report <sha>` is `parseRange`'s bare-revision reading —
the commit against its parent. Selection, tiers and rendering are unchanged;
only the range is narrower.

### 12. Stage 8

**Chosen:** after the base is resolved and before the body is seeded:
`witness bundle <base>..HEAD`, `git add nullius.runs/`, commit, push; then
`evidence-print` and `gh pr create` as today. The skill's prose subcommand list
gains `bundle`.

## Compatibility risks

**Risk:** the Action posts what a separately versioned kernel rendered; a
newer `witness report` whose JSON `version` moved past what the Action
understands would be parsed with wrong expectations if the Action read fields.

**Binds at:** `inter-service-skew`

**Skew path:** `@nullius-inverba/claims@<newer>` → `witness report --format json` on stdout → `armanfatemi/nullius/action@v1`

**Symptom:** an empty or partial comment on a PR whose bundle is sound.

**Mitigation closes it because:** the Action reads `version` first and, on an
unrecognised value, posts no report and states the version it could not
render — the same discipline as `add-maintainer-card` Decision 6 — and the
markdown form is posted verbatim without field access, so only the JSON path
can skew. The checker version is pinned by the Action (`action.yml:47`,
above).

## Open questions

Mirrored from `proposal.md`:

1. The envelope's path and name.
2. The comment size budget.
3. Whether prompts travel by default.
4. Rendering when `oracles` is unconfigured.
5. The round-detection window, and whether it is configurable.
