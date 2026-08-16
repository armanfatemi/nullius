# @nullius-inverba/claims

Deterministic checker for **[Evidence Anchors](https://github.com/armanfatemi/nullius/blob/main/spec/evidence-anchors.md)** —
machine-verifiable claims about a codebase in design docs, RFCs, ADRs, and
agent-written proposals.

A document asserts things about your code:

```markdown
**Evidence:** `k8s/base/settings/deployment.yaml:12` — `  replicas: 2`

**Evidence:** `grep -rn --include='*.graphqls' '@shareable' services/ | grep enum` → 0 results

**Binds at:** `rollout-window`
```

`nullius check` re-verifies every one of them against the working tree: it
opens the cited file and matches the quoted text (tolerating small line
drift), re-runs the absence search and compares counts, and validates that
every named [binding moment](https://github.com/armanfatemi/nullius/blob/main/spec/binding-moments.md)
comes from the project's closed list. A claim that cannot be re-verified fails
the run with a verdict that says why: `FABRICATED`, `WRONG-LINE`,
`MISSING-FILE`, `COUNT-MISMATCH`, `UNKNOWN-MOMENT`, `MALFORMED`.

Why this exists: **a false premise that supports a correct conclusion is
invisible to every reviewer who agrees with the conclusion** — human or LLM.
The convention forces the file open at authoring time; the checker keeps the
citation honest afterward. See the spec for the full argument and the incident
that produced it.

## Usage

First touch — watch every verdict fire against a sandbox fixture, no adoption
required:

```sh
npx @nullius-inverba/claims demo
```

The checker verifies a convention, so real adoption starts on the authoring
side: paste the
[authoring rule](https://github.com/armanfatemi/nullius/blob/main/plugin/skills/evidence-anchors/SKILL.md)
into your agents' instructions (or install the
[plugin](https://github.com/armanfatemi/nullius/tree/main/plugin)), and the
check gates the next design doc they write. It also works with no agents at
all — hand-anchor the load-bearing claims in one architecture doc and CI
becomes a drift alarm for your documentation.

No design-doc culture required: anchors attach to **anything a human
approves** — a plan-mode plan (the repo's Claude Code plugin ships a hook that
checks it before approval), a PR description (the GitHub Action's `pr-body`
mode), or a formal doc.

Run from the repo root (citations are repo-relative):

```sh
npx @nullius-inverba/claims check "docs/rfcs/**/*.md"

# multiple globs
npx @nullius-inverba/claims check "docs/rfcs/**/*.md" "docs/adr/*.md"

# fail when no grounding markers are found at all
npx @nullius-inverba/claims check "openspec/changes/my-change/**/*.md" --require-markers
```

Exit codes: `0` all claims verified (or none present), `1` at least one
unverified claim (or none present under `--require-markers`), `2` usage or
config error.

Every checked document is reported with its **anchor density** (`N anchor(s)
/ M lines`), and documents carrying no anchors at all are listed by name with
their length — reported, never judged: the checker cannot know how many
claims a document ought to make, but a long plan with zero checkable claims
should be visible, not silently skipped.

Citations quoted inside fenced code blocks are ignored — a document that
_quotes_ a citation as an example is not asserting it.

For a document with **no anchors yet**, `eager-prompt` emits a refute-first
audit brief you can hand to any agent harness:

```sh
claude -p "$(npx @nullius-inverba/claims eager-prompt design.md)"
```

The model extracts the load-bearing claims, tries to _refute_ each against
the code, and proposes anchors for what survives — which this checker then
verifies like anyone else's. The model proposes; the checker disposes. Its
anchors are proposals until the author adopts them — an eager pass improves
recall, never the guarantee.

## Configuration

Optional `nullius.config.json` at the repo root (or `--config <path>`):

```json
{
  "docs": ["docs/rfcs/**/*.md"],
  "exclude": ["review-evidence.md"],
  "driftWindow": 3,
  "moments": [
    "build-time",
    "rollout-window",
    "inter-service-skew",
    "event-consumption",
    "replay-migration",
    "data-at-rest"
  ],
  "ciCaughtMoments": ["build-time"]
}
```

- `docs` — default globs when the CLI gets none.
- `exclude` — basenames to skip (e.g. review logs that quote findings).
- `driftWindow` — how far (± lines) a match still counts as `DRIFT` (passing)
  rather than `WRONG-LINE` (failing). Default 3.
- `moments` / `ciCaughtMoments` — your closed binding-moment vocabulary.
  Defaults model a replicated-service backend; a mobile or embedded project
  should define its own.

Unknown config keys are rejected, not ignored — a typo'd key silently
checking less than you configured is exactly the quiet failure this tool
exists to prevent.

## Security model

Checked documents are treated as **untrusted input** (in CI they are
PR-controlled content):

- Cited paths are validated **before any filesystem access** — no absolute
  paths, no `..` traversal, no `~` expansion. Otherwise the checker becomes a
  file-probe oracle on your CI runner.
- Absence commands are sandboxed: every pipeline segment must begin with
  `grep` or `rg`; `;`, `&&`, `||`, `$(`, backticks, and redirection are
  rejected without execution.

## Library API

```ts
import { parseClaims, checkClaims, isFailure } from "@nullius-inverba/claims";

const claims = parseClaims("design.md", content);
const results = checkClaims(claims, { readFileLines, runSearch }, options);
const failures = results.filter((r) => isFailure(r.verdict));
```

`checkClaims` takes injected `readFileLines` / `runSearch` dependencies, so
you can run it against a virtual filesystem, a git revision, or a test
fixture.

## Part of nullius

_Nullius in verba_ — "take nobody's word for it." This package is the
claims half of [nullius](https://github.com/armanfatemi/nullius), epistemic
discipline for agent systems, mechanically enforced. MIT.
