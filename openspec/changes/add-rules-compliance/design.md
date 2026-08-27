# Design — add-rules-compliance

## Context

The proposal's premise is that rule compliance is model-judged today with
nothing deterministic underneath it. Three pieces of that premise are already
built, and the design below is scoped to what is actually missing rather than
re-describing what exists.

**The frontmatter shape already exists on every rule file**, and is already
machine-read — just not by anything that validates it as a closed schema:

**Evidence:** `packages/claims/src/wiringScan.ts:26@d83ad69` — `{ glob: ".claude/rules/*.md", kind: "rule" },`

`wiringScan.ts` reads `.claude/rules/*.md` through the same generic,
hand-rolled `parseFrontmatter` every other harness artifact uses — scalars,
inline flow lists, block lists, no YAML dependency:

**Evidence:** `packages/claims/src/frontmatter.ts:78@d83ad69` — `export function parseFrontmatter(content: string): Frontmatter | null {`

and pulls `applies_to` through the existing scalar-or-list unifier:

**Evidence:** `packages/claims/src/wiringScan.ts:184@d83ad69` — `globs: declaredList(front, "applies_to"),`

So task 1.1 is not "write a frontmatter reader" — one is already exported and
already parses this exact file family. What is missing is schema
enforcement: closed keys (`id`, `applies_to`, `severity`, nothing else),
a required `id`, and a `severity` restricted to a known enum — the layer
`config.ts` already has for `nullius.config.json`:

**Evidence:** `packages/claims/src/config.ts:76@d83ad69` — `for (const key of Object.keys(record)) {`

**The incident-anchor convention already exists, unenforced.** Seven of the
eight current rule files carry a `## The incident` section ending in a
`**Evidence:**` anchor; the eighth (`openspec-shall-first-line.md`) carries a
`## Why this rule carries no anchor` section instead, explaining a
deliberate exception:

**Evidence:** `.claude/rules/openspec-shall-first-line.md:28@d83ad69` — `## Why this rule carries no anchor`

That file is the natural `UNGROUNDED-RULE` fixture — folklore-shaped,
self-aware about it, and already in the tree.

**A model already does this job, informally.** `rule-auditor` reads every
rule's frontmatter, matches `applies_to` against in-scope files by its own
judgement, and reports violations. `routeAgents` — the kit's deterministic
router for every other reviewer — refuses to duplicate that matching and
says so in its own comment, naming `rules select` as the fix:

**Evidence:** `packages/kit/src/pipeline.ts:141@d83ad69` — ``matching its `applies_to` globs, and that is `rules select`'s job in the``

**`add-witness-recording` has landed**, so `SILENT-RULE`'s only prerequisite
is satisfied — its change directory is archived at
`openspec/changes/archive/2026-08-21-add-witness-recording/`.

**The kernel already has one precedent for a second, narrower verdict union**
kept separate from the public `Verdict` type for exactly the reason this
proposal cites:

**Evidence:** `packages/claims/src/wiring.ts:13@d83ad69` — ``Its own verdict union on purpose: the kernel's exported `Verdict` is public``

`WiringVerdict` is that precedent. `RuleVerdict` is the second instance of
the same pattern, not a new one.

**The kit already imports kernel functions directly, not via subprocess.**
Every existing kit↔claims boundary crossing is a workspace-package import,
bundled at build time by `tsup`:

**Evidence:** `packages/kit/src/doctor.ts:26@d83ad69` — `import { isJournalFailure, parseConfig, validateJournal } from "@nullius-inverba/claims";`

This fixes how `routeAgents`'s pre-filter (task 2.4) has to be wired: a
function import, not a spawned `rules select` process.

## Decisions

### 1. `rules.ts` wraps the existing `parseFrontmatter`; it does not re-parse frontmatter

**Chosen:** A new `packages/claims/src/rules.ts` module exports
`parseRuleHeader(content, path)`, which calls the existing
`parseFrontmatter` and then applies closed-key, required-field, and
enum validation in the style of `config.ts:parseConfig` — same shape
(`KNOWN_KEYS` set, loop-and-reject-unknown, per-field type checks), applied
to `{ id, applies_to, severity }` instead of the config schema.

**Alternatives considered:** A second hand-rolled frontmatter reader scoped
to rule files, independent of `frontmatter.ts`.

**Rationale:** `frontmatter.ts` is already the shared reader four other
artifact kinds use (`agent`, `skill`, `hooks`/`settings` via a different
path, `command`), and its own doc comment gives the reason no second reader
should exist: a YAML dependency is supply-chain surface this project
deliberately avoids, and that argument does not become weaker for being
reused a fifth time. A second parser would also silently diverge from the
one `wiringScan.ts` already uses to compute `empty-glob` against the same
`applies_to` field — two readers of one field is the exact duplication
`routeAgents`'s comment already refuses to accept for matching.

**`rules.ts` stays a pure core; a peer `rulesScan.ts` does the filesystem
reads**, mirroring the existing `wiring.ts`/`wiringScan.ts` split: `rules.ts`
exports `parseRuleHeader` and the `RuleVerdict` logic taking already-read
file content as arguments, and `rulesScan.ts` is the only module that calls
`readFileSync`/`globSync` to enumerate `.claude/rules/*.md` and hand content
to it. Not a new pattern — the existing pair already draws this line for
harness artifacts generally, and a `rules.ts` that read files itself would
be the one module in this family that didn't.

### 2. A malformed rule header is a `RuleVerdict`, not a thrown error

**Chosen:** `parseRuleHeader` never throws. An unknown key, a missing `id`,
or an invalid `severity` produces `{ verdict: "malformed-rule-header", ... }`
so a scan across `.claude/rules/*.md` reports every bad file, not just the
first one it opens.

**Alternatives considered:** Throw, mirroring `config.ts:parseConfig`.

**Rationale:** `config.ts` parses exactly one file per run — throwing loses
nothing, because there is nothing else left to check. `rules select` and a
rules-directory `check` both scan a whole directory; the closer precedent is
`WiringVerdict`'s `malformed-hooks`, which exists precisely so one bad
artifact doesn't abort a scan of the rest:

**Evidence:** `packages/claims/src/wiring.ts:38@d83ad69` — `| "malformed-hooks"`

`malformed-rule-header` is not in `RuleVerdict`'s passing set — an author who
mistyped a key should see it fail, the same way `config.ts` fails loud today.

**Every `RuleVerdict` member is lowercase-kebab**, matching `Verdict` and
`WiringVerdict` — `ok`, `ungrounded-rule`, `rule-rot`, `malformed-rule-header`
— not the uppercase form this proposal's own prose uses. Uppercase is a
display convention only: `checkClaims.ts`'s and `wiring.ts`'s members are all
lowercase, and every uppercase string in either module's or this repo's specs
(`DANGLING-AGENT`, `STALE`, `FABRICATED`) is a report string built from the
lowercase member at render time, never the type itself.

### 3. `ungrounded-rule` and `rule-rot` reuse the existing citation checker, scoped to any anchor in the rule body

**Chosen:** After frontmatter parses, `rules.ts` looks for any
`**Evidence:**` anchor anywhere in the rule body — no heading match
required, not `## The incident` specifically, since `openspec-shall-first-line.md`'s
own deliberate-exception section is titled `## Why this rule carries no
anchor` and would be wrongly penalized by a heading-keyed lookup. Zero
anchors anywhere in the body → `ungrounded-rule`. One or more found → each is
checked with the same per-claim verification `checkClaims.ts` performs on
every other document, and the rule's overall verdict is `ok` when every
found anchor passes, `rule-rot` when `isFailure()` is true for any of them.

**This corrects an earlier draft of this decision, which is factually
wrong about the reuse mechanism.** It described reuse of "the same
`verifyClaim`-level machinery `checkClaims.ts` already uses" — no such
export exists. `checkClaims.ts`'s exports (`checkClaims`, `isFailure`,
`normalize`, `DEFAULT_BINDING_MOMENTS`, `Verdict`, `ClaimResult`,
`CheckDeps`, `CheckOptions`, `SearchOutcome`, `RevRead`) are the module's
entry point and its supporting types — every per-claim function
(`checkStamped`, `checkUnstamped`, `checkPresence`) is module-private.
Reusing this machinery therefore requires either a new export exposing
per-claim verification, or synthesizing rule-body anchors as claims and
running them through the existing `checkClaims` + `CheckDeps` entry point. The conclusion this decision reaches — don't build a second
citation checker — still holds; only the "already exists, just call it"
framing was wrong. Which of the two integration shapes to build is an
implementation decision for task 1.2, not a design fork: both route through
`checkClaims.ts`'s existing verification, neither adds a second grammar.

**`rule-rot`'s exact trigger is `isFailure(verdict)` on the reused
check, never `verdict !== "ok"`.** This distinction is load-bearing, not
stylistic. Every current rule file's incident anchor is stamped against an
old commit — `52f64ec` or `90105d8` — and ordinary line drift since then
means several already report `stale` today, which is a *passing* verdict:

**Evidence:** `packages/claims/src/checkClaims.ts:175@d83ad69` — `"stale",`

**This claim was previously overstated and is corrected here.** An earlier
draft said "all 7 grounded rules" would misreport as `rule-rot` under a naive
condition. Checked directly against the working tree at `d83ad69`: of the 8
incident anchors across the 7 grounded rule files, 5 currently report
`stale` (`merge-never-squash.md`'s two anchors, plus one each in
`model-proposes-code-verifies.md`, `never-repoint-under-old-stamp.md`, and
`verdict-needs-fixture-and-test.md`); the remaining 3 (`build-before-cli.md`,
`one-delivery-mechanism.md`, `rev-stamp-change-anchors.md`) currently report
`ok`. A naive `verdict !== "ok"` condition would still misreport 4 of the 7
grounded rules as `rule-rot` from the moment this ships — fewer than
originally claimed, but the defect and its fix are unchanged: those 4 rules
are not actually rotted, only line-drifted, and `isFailure()` is exactly the
function that already draws this line correctly for every other document in
the repo. `rule-rot` has to ask the same question the same way, not
re-derive it from the verdict string — and even one legitimately-`stale`
rule would be enough to make the naive condition wrong.

**Alternatives considered:** A rules-specific citation format, parsed
independently. Rejected for the same duplication reason as Decision 1 —
the anchor grammar is already one shared contract across every document
class in this repo, and a rule file using a different one would be its own
inconsistency for `rules select` to explain away later.

**`ungrounded-rule` and `rule-rot` are both advisory (passing), and `ok`
leads the union** (Decision 2's casing note applies here too — the full
member list is `ok`, `ungrounded-rule`, `rule-rot`, `malformed-rule-header`).
A `PASSING` set follows `checkClaims.ts`'s own precedent exactly:

**Evidence:** `packages/claims/src/checkClaims.ts:169@d83ad69` — `const PASSING: ReadonlySet<Verdict> = new Set<Verdict>([`

`RuleVerdict`'s own `PASSING` contains `ok`, `ungrounded-rule`, and
`rule-rot`; `malformed-rule-header` is the only excluded member. Writing
this as an explicit allowlist, with an `isRuleFailure` wrapping it the way
`isFailure` wraps `Verdict`'s, is what keeps this a deliberate calibration
on record rather than an implicit default nobody argued for — the same
reasoning `checkClaims.ts`'s own `PASSING` comment gives for why omission is
not itself a safe default.

`ungrounded-rule` flags folklore without accusing an author who wrote a
deliberately-ungrounded rule (`openspec-shall-first-line.md` is the
existing, correct example of exactly that), and `rule-rot` flags drift
without hard-failing a run over a rule whose *content* may still be sound
even though its cited incident moved.

### 4. `rules select`'s glob matcher is hand-rolled, not `minimatch`

**Chosen:** A small `appliesToMatches(pattern, path)` matcher covering the
vocabulary actually observed across the eight current rule files: literal
path segments, `*` (single segment), and `**` (any number of segments,
including zero). No brace expansion, no character classes, no `?`.

**Alternatives considered:** Depend on `minimatch` directly. It is already
present in the dependency tree transitively (pulled in by the `glob`
package `wiringScan.ts`/`canary.ts`/`cli.ts` already use for filesystem
enumeration), so adding it as a direct dependency would not add a new
package to the lockfile, only a direct declaration of one already resolved.

**Rationale:** `wiringScan.ts`'s existing use of `glob` is a different
operation — "does this pattern resolve to at least one real file" — and
genuinely needs filesystem access. `rules select --paths` answers a
different question — "does this candidate path string match this pattern" —
against paths that may not exist on disk yet (a plan's touched-areas, a
diff's changed files before checkout). That is pure string matching, and
`frontmatter.ts`'s stated rationale for hand-rolling over pulling in a
parser applies here with the same force: the subset actually used is small
and closed, and a hand-rolled matcher is auditable in the space this repo
already holds itself to. Every current `applies_to` glob in `.claude/rules/`
uses only the covered subset, so nothing existing needs a richer matcher
than this.

The full observed vocabulary, one file's `applies_to` block (this citation
was previously malformed — a non-standard `**Evidence (...):**` marker the
checker's own extractor does not recognize, and an off-by-one line number;
both fixed here):

**Evidence:** `.claude/rules/verdict-needs-fixture-and-test.md:3@d83ad69`

```
applies_to:
  - packages/claims/src/**/*.ts
  - spec/fixtures/**/*.jsonl
  - .github/workflows/*.yml
```

**Two implementation details `appliesToMatches` must get right, neither
optional:**

- **`**` matches zero path segments, not just one or more.** The usual place
  a hand-rolled matcher diverges from `glob`'s real semantics is exactly
  this rule's own pattern: `packages/*/src/**/*.ts` must match
  `packages/claims/src/cli.ts`, where `**` sits between two literal
  segments and contributes nothing. A matcher that requires `**` to consume
  at least one segment silently narrows every `**` in this file family.
- **A traversal-safety leg, mirroring `wiring.ts`'s existing check.**
  `checkWiring` runs `isSafeRepoPath` on a declared glob before ever handing
  it to `deps.glob`:

  **Evidence:** `packages/claims/src/wiring.ts:357@d83ad69` — `const globSafety = isSafeRepoPath(ref.value);`

  `appliesToMatches` has no equivalent named anywhere in this design.
  `wiring.ts`'s own comment at that call site makes the argument for why
  this matters here too — `applies_to` is repo-controlled content a pull
  request can add, "and the same containment rule applies as to a
  citation." `rules select` is additionally reused by `/comply`, which runs
  against whatever a plan or diff names — the check belongs on the
  candidate *path* side as much as the pattern side.

### 5. `routeAgents` pre-filter is a direct function import, not a subprocess call

**Chosen:** `packages/kit/src/pipeline.ts` imports `selectRules` from
`@nullius-inverba/claims` (the library export, same pattern as
`parseConfig`/`validateJournal` today) and calls it with the candidate
paths before unconditionally adding `rule-auditor` to the routed set.

**Alternatives considered:** Spawn `node packages/claims/dist/cli.js rules
select --paths ...` as a child process, mirroring how a human or a plugin
command invokes the CLI.

**Rationale:** Every existing kit↔claims boundary crossing in this codebase
is a workspace import, resolved and bundled by `tsup` at build time — there
is no existing precedent for `packages/kit/src` shelling out to
`packages/claims`'s CLI, and introducing one here for a single call site
would be a second integration pattern for the same relationship. A
subprocess call would also reintroduce the exact hazard `build-before-cli.md`
exists to name: `pipeline.ts`'s compiled output would silently depend on
`packages/claims/dist/cli.js` being fresh, on top of its own package's
build, which the direct-import path avoids entirely — `pnpm build` already
rebuilds `kit` against whatever `claims` currently exports, in dependency
order.

**Behavioural change to `routeAgents`:** `rule-auditor` is added to the
routed set only when `selectRules` returns at least one applicable rule for
the given paths, replacing the current unconditional inclusion. The
`routeAgents` doc comment (`packages/kit/src/pipeline.ts:141@d83ad69`,
quoted above) is updated to describe the pre-filter instead of the gap.

### 6. `/comply`'s brief builder is a new function, not `buildAuditBrief` reused verbatim

**Chosen:** `packages/claims/src/audit.ts` gains a sibling,
`buildComplianceBrief(rule, touchList)`, following the same starved-dispatch
shape `buildAuditBrief` already establishes — untrusted-text framing, a
closed verdict vocabulary, an anchor grammar the checker re-verifies, no
sibling content in the prompt.

**Alternatives considered:** Generalize `buildAuditBrief` to take either a
claim or a rule.

**Rationale:** `buildAuditBrief`'s inputs (`AuditClaim`: a statement plus
its anchors) and a compliance brief's inputs (a rule's full text plus a
plan's touch-list) don't share a shape, and forcing them through one
function would need a discriminated parameter just to reach the same
templated prose both already produce independently. The two functions
sharing a *pattern* — starve, forbid siblings, closed verdict vocabulary,
anchors the checker re-verifies — is the actual thing worth keeping in sync;
sharing a function signature is not.

**The brief's verdict instructions require an anchor for `COMPLIANT` as well
as `VIOLATION`.** `specs/rules/spec.md`'s "Starved compliance briefs"
requirement originally required this only of `VIOLATION`, leaving
`COMPLIANT` decided on the agent's word alone — a model in the verification
path for the passing case, caught in Stage 2 review. `buildComplianceBrief`'s
template asks for the same thing `buildAuditBrief` already asks of
`SUPPORTED` (`audit.ts:156` — "where you went looking for the
counter-example," anchors either way): both outcomes cite, both get
re-checked, only `NOT-APPLICABLE` doesn't need to.

## Open questions

- ~~Whether the incident-anchor lookup (Decision 3) keys off the literal
  heading text `## The incident`, or off "any anchor in the body".~~
  **Settled in Decision 3, above, during Stage 2 review:** any
  `**Evidence:**` anchor anywhere in the rule body, no heading match
  required. `checker-engineer` independently confirmed this reading against
  all 8 current rule files and against `merge-never-squash.md`'s anchor
  shape specifically (a bare `path:line@rev` whose quote lives in a
  following fenced block — "last anchor" would have picked a different
  anchor form there than the intended one).
- ~~Whether `malformed-rule-header` belongs in `RuleVerdict` or should
  short-circuit independently, like `config.ts`'s thrown `Error`.~~
  **Settled: `RuleVerdict`, not a thrown error.** `checker-engineer` gave
  the sharper reason Decision 2 was missing: `config.ts`'s throw is
  uncaught all the way to the CLI entry point, aborting the whole
  invocation — acceptable for a single config file, not for a directory
  scan across `.claude/rules/*.md`, which must keep going and report every
  bad file. Kept out of `RuleVerdict`'s `PASSING` set, per Decision 3.
