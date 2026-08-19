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
the run with a verdict that says why: `FABRICATED`, `UNPINNED`,
`MISSING-FILE`, `COUNT-MISMATCH`, `UNKNOWN-MOMENT`, `MALFORMED`.

An anchor may also stamp the commit it was read at —
`src/app.ts:12@a1b2c3d` — which splits the two propositions a citation makes
onto two snapshots. "This text was in this file at that commit" is checked
with `git show` and can never rot, so it stays a hard gate forever; "it is
still there" is checked against the working tree and is advisory forever
(`STALE`). A refactor cannot turn an honest document red, and deleting the
cited code cannot excuse having invented it.

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

Citations quoted inside fenced code blocks are ignored, as are four-space
indented ones — a document that _quotes_ a citation as an example is not
asserting it. A marker written as a list item (`- **Evidence:** …`) is read
normally.

Rev-stamped anchors need the history they name, so a workflow that gates them
must not check out shallowly:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0 # `git show <rev>:<path>` needs the commit the anchor names
```

A commit the clone does not have is never treated as evidence against the
author: the verdict fails open as the advisory `UNVERIFIABLE-REV`, with the
remedy in the message.

## `nullius audit` — is the claim true?

`check` certifies form, never entailment: a real line, quoted accurately, under
a sentence it does not support, passes. `audit` is the other half.

```sh
nullius audit design.md                  # the claims, one dispatch each
nullius audit design.md --emit-brief c1  # the starved brief for one claim
nullius audit design.md --extract        # pull the UNANCHORED claims out of the prose
nullius audit design.md --propose        # retrofit: hunt evidence FOR the document
```

Extraction of anchored claims is deterministic — the same parser `check` uses.
Each claim is then dispatched to its own agent with **nothing else**: no title,
no surrounding paragraph, no conclusion, no sibling claims. Claims presented
together imply a narrative and a model handed a narrative argues for it; the
starve is also the smallest prompt-injection surface available. The brief works
refute-first, offers `UNVERIFIABLE-BY-SEARCH` as a real answer, and returns
refutations **as anchors** — which `check` then re-verifies. No model is ever
in the verification path.

`--propose` is the older confirmation-shaped mode (formerly `eager-prompt`,
which still works). It is what retrofitting an unanchored document needs, and
it is a peer verb rather than the default: a model sent to find support finds
support.

## `nullius witness` — did the checking happen?

```sh
nullius witness validate run.jsonl
```

Validates the journal a multi-agent run leaves behind against three invariants:
every dispatch reaches one of three terminal states (`found` / explicit
`empty` / `no-report` — collapsing the last two launders dead agents into
evidence of absence), no verification is relied on after the artifact it
verified changed, and no append omits what it corrected. Exit `1` on any
invalid record. The schema is
[spec/witness-journal.md](https://github.com/armanfatemi/nullius/blob/main/spec/witness-journal.md).

## Configuration

Optional `nullius.config.json` at the repo root (or `--config <path>`):

```json
{
  "docs": ["docs/rfcs/**/*.md"],
  "exclude": ["**/review-evidence.md"],
  "driftWindow": 3,
  "minAnchorChars": 8,
  "relaxedControl": true,
  "searchTimeoutMs": 10000,
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
- `exclude` — globs, matched against the full repo-relative path, for documents
  to skip (e.g. review logs that quote findings). Use `**/name.md` to skip a
  basename anywhere in the tree; a bare `name.md` matches only at the root.
- `driftWindow` — how far (± lines) a match is reported as `DRIFT` rather than
  `WRONG-LINE`. Both pass, so this changes the wording of the advisory, not the
  exit code. Default 3.
- `minAnchorChars` — shortest quote that reads as a real citation. Below it a
  citation verifies as `WEAK-ANCHOR` rather than `OK`; it never fails on length
  alone. Default 8.
- `relaxedControl` — re-run a zero-result absence search with a match-anything
  pattern, as a control on whether it examined any content at all. Default true.
- `searchTimeoutMs` — wall-clock budget for one absence search, in ms. Must be
  positive; there is no value that disables it. Default 10000. All searches in a
  run additionally share a 120s budget.
- `moments` / `ciCaughtMoments` — your closed binding-moment vocabulary.
  Defaults model a replicated-service backend; a mobile or embedded project
  should define its own.

Unknown config keys are rejected, not ignored — a typo'd key silently
checking less than you configured is exactly the quiet failure this tool
exists to prevent.

## Security model

Checked documents are treated as **untrusted input** (in CI they are
PR-controlled content):

- **`.git` is unreachable** — refused as a path, refused through a symlink, and
  pruned from every recursive walk (`grep -r` needs no operand to descend into
  it). Under `actions/checkout` it holds an `AUTHORIZATION: basic <token>`
  header, and each anchor would otherwise be one bit of it.
- **Cited paths are validated before any filesystem access** — no absolute
  paths, no `..` traversal, no `~` expansion. The same guard covers the file operands of an absence search,
  so neither lane can be used as a file-probe oracle whose verdict lands in a
  public PR comment. A token naming a location outside the repo is refused
  wherever it appears, so containment does not depend on the per-flag arity
  table being perfect — and symlinks are resolved before anything is read or
  searched.
- **Absence commands never touch a shell.** They are tokenised into an argv
  vector and spawned directly, so there is no command string for a
  metacharacter to escape. Shell globs are consequently not expanded — use
  `-r` with `--include=`/`-g`.
- **Flags are allowlisted, per binary.** Allowlisting `grep`/`rg` alone is not
  enough: `rg --pre <cmd>` executes `<cmd>` against every searched file.
  `--pre`, `--pre-glob`, `--hostname-bin`, `-z`, `-f`, `--exclude-from`,
  `--ignore-file`, `--files`, `-L` and `-q` are refused by name, and any flag
  not on the allowlist is refused as unrecognised.
- **Flag denials are per binary**: `rg -L`/`-z` are `--follow`/`--search-zip`
  and refused; `grep -L`/`-z` are `--files-without-match`/`--null-data` and
  allowed. `grep -R` is refused because it follows symlinks during its walk.
- **Searches are time-bounded** — 10s each (`searchTimeoutMs`) and 120s for a
  whole run — and run with `RIPGREP_CONFIG_PATH` and `GREP_OPTIONS` stripped
  from the environment.

## Library API

```ts
import { parseClaims, checkClaims, isFailure } from "@nullius-inverba/claims";

const claims = parseClaims("design.md", content);
const results = checkClaims(claims, { readFileLines, runSearch }, options);
const failures = results.filter((r) => isFailure(r.verdict));
```

`checkClaims` takes injected `readFileLines` / `runSearch` / `readFileAtRev`
dependencies, so you can run it against a virtual filesystem, a git revision,
or a test fixture. `validateJournal`, `extractAuditClaims` and
`buildAuditBrief` are exported the same way.

## Part of nullius

_Nullius in verba_ — "take nobody's word for it." This package is the
claims half of [nullius](https://github.com/armanfatemi/nullius), epistemic
discipline for agent systems, mechanically enforced. MIT.
