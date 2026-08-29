# Design — add-authoring-ergonomics

## Context

Everything this change adds is a new *use* of a verdict the kernel already
computes; none of it adds a verdict. That is what keeps it kernel-only and
independent of every other live proposal.

**The corrected line number already exists, but only as prose.** A presence
result is `{ claim, verdict, detail }` and nothing else:

**Evidence:** `packages/claims/src/checkClaims.ts:77@5d5b2e0` — `export interface ClaimResult {`

For `drift` and `wrong-line` the line the text was actually found on is
interpolated into `detail` — `text is on line N, not M — update the citation`
— and discarded as a number:

**Evidence:** `packages/claims/src/checkClaims.ts:332@5d5b2e0` — `verdict: "drift",`

**Evidence:** `packages/claims/src/checkClaims.ts:340@5d5b2e0` — `verdict: "wrong-line",`

So `--fix` cannot be built on today's result shape without either parsing the
checker's own English or recomputing the match. Decision 2 closes this.

**Both fixable verdicts are unique-match by construction — but the two
branches do not name the same line.** Before `evaluateAgainst` can return
`drift` or `wrong-line`, an ambiguous quote — one matching more than one place
in the file — has already been returned as `unpinned`:

**Evidence:** `packages/claims/src/checkClaims.ts:317@5d5b2e0` — `verdict: "unpinned",`

Uniqueness is decided by `locate`, which prefers exact whole-line matches and
falls back to substring matches only when there is no exact one:

**Evidence:** `packages/claims/src/checkClaims.ts:269@5d5b2e0` — `function locate(lines: string[], block: string[]): MatchSurvey {`

The `drift` branch, however, does not use that result. It scans the window
around the cited line with a substring match and reports the first hit:

**Evidence:** `packages/claims/src/checkClaims.ts:330@5d5b2e0` — `if (matchesAt(lines, candidate, block)) {`

So a quote with exactly one exact match far away and a substring match nearby
is `drift` naming the nearby substring line, while `locate` — the survey that
established uniqueness — points at the exact line. Today that only affects a
message. Once the number is acted on, the verdict and the fix must name the
same line. Decision 2 resolves it.

(Issue #7's original scoping — "`WRONG-LINE` must never be auto-repaired:
rewriting a citation to wherever the text happens to appear" — describes an
ambiguous match, and that case is a separate verdict today. Decision 3 argues
the consequence.)

**A stamped anchor CAN carry `drift` or `wrong-line`.** On the path where the
stamped commit is readable, a mispositioned quote is folded into `advisory`
and every working-tree divergence into `stale`:

**Evidence:** `packages/claims/src/checkClaims.ts:427@5d5b2e0` — `const mispositioned = gate.verdict === "drift" || gate.verdict === "wrong-line";`

But that line is downstream of the fail-open branch. When the stamped commit
cannot be read — a shallow clone, a squash-merged branch, a fork — the checker
evaluates the anchor as if it were unstamped and returns that result
*verbatim* whenever it passes:

**Evidence:** `packages/claims/src/checkClaims.ts:400@5d5b2e0` — `if (!isFailure(fallback.verdict)) return fallback;`

`drift` and `wrong-line` are passing, so on that path the result carries
`claim.rev` *and* one of the two verdicts `--fix` acts on. An earlier draft of
this design claimed the opposite and built `--fix`'s safety on it; Stage 2
review corrected it. The consequence is Decision 3's filter: `--fix` keys on
`claim.rev === undefined`, never on the verdict alone, because only the
absence of a stamp makes a repoint safe under
`.claude/rules/never-repoint-under-old-stamp.md`.

The same fail-open branch has a second consequence for `--stamp`. A `Verdict`
cannot say whether the file was actually read at the named commit: an `ok`
computed from the working tree because git was unavailable and an `ok`
computed from the commit's own bytes are the same value. Decision 4 therefore
does not gate on a verdict at all.

Both fixable verdicts, and `stale`, are members of the passing set — `--fix`
is a convenience over passing results, never a way to turn a red run green:

**Evidence:** `packages/claims/src/checkClaims.ts:169@5d5b2e0` — `const PASSING: ReadonlySet<Verdict> = new Set<Verdict>([`

**The parser records where in the document each marker sits, and its grammar
is three module-private regexes.** Every claim carries a 1-based document
line:

**Evidence:** `packages/claims/src/parseClaims.ts:43@5d5b2e0` — `/** 1-based line number within that document. */`

and a presence marker is one of the inline forms or the block-form head, all
of which capture `(path)`, `(line)`, and an optional `(@rev)` as groups:

**Evidence:** `packages/claims/src/parseClaims.ts:119@5d5b2e0` — `const PRESENCE_DOUBLE =`

**Evidence:** `packages/claims/src/parseClaims.ts:125@5d5b2e0` — `const PRESENCE_BLOCK_HEAD =`

A rewrite therefore never needs to touch the quote: for every marker shape the
line number and the stamp sit inside the *first* backtick span, and the quoted
text — inline or fenced — is outside it. The regexes are not exported, so the
rewrite must live beside them (Decision 1) rather than carry a copy. The
parser lower-cases the rev it captures, so a stamp written in lower-case hex
round-trips byte-identically:

**Evidence:** `packages/claims/src/parseClaims.ts:225@5d5b2e0` — `return { rev: captured.slice(1).toLowerCase() };`

**The kernel already reads git and already writes user documents — in bounded
ways.** `revFileReader` runs `git show <rev>:<path>` and caches per `(rev,
path)`:

**Evidence:** `packages/claims/src/runners.ts:149@5d5b2e0` — `export function revFileReader(root?: string, timeoutMs = DEFAULT_GIT_TIMEOUT_MS) {`

and `demo` already resolves a short HEAD the way `--stamp` needs to:

**Evidence:** `packages/claims/src/demo.ts:171@5d5b2e0` — `return git('rev-parse', '--short', 'HEAD');`

`canary plant` / `canary clear` are the precedent for editing a checked
document in place (`plantCanary` in `canary.ts` inserts one line and
`clearCanary` removes it). `--stamp` and `--fix` are the same shape — a
single-line edit to a marker the tool has just parsed — and Decision 1 keeps
them at least that narrow.

**The `check` command's surface today.** Its whole body is one function,
which reads config, globs, runs the checker per document, prints the human
report, and computes the exit code:

**Evidence:** `packages/claims/src/cli.ts:604@5d5b2e0` — `function runCheck(args: CheckArgs): number {`

Per-result rendering is `report()`, which prints *and* counts failures in the
same pass — so a second renderer cannot simply be swapped in; counting has to
be separated from printing first (Decision 5):

**Evidence:** `packages/claims/src/cli.ts:185@5d5b2e0` — `function report(results: ClaimResult[]): number {`

The run ends on a density line and, when nothing failed, `All N grounding
marker(s) verified.` — which on a repository with no anchors at all reads
`All 0 grounding marker(s) verified.` and points at nothing:

**Evidence:** `packages/claims/src/cli.ts:736@5d5b2e0` — ``matched document(s) carry grounding markers.``

The only next-step pointer is a spec URL:

**Evidence:** `packages/claims/src/cli.ts:53@5d5b2e0` — `const SPEC_URL =`

Nothing in this repository consumes that closing line: the Action derives its
headline from the exit status and echoes the report verbatim, and CI keys on
exit codes (confirmed in Stage 2 review against `action/action.yml` and
`.github/workflows/ci.yml`).

**Flags are already per-command; help is not.** The per-command parser the
proposal says this change "rides on" has landed (the change is archived as
`openspec/changes/archive/2026-08-21-add-init-doctor`), and flag ownership is
a table:

**Evidence:** `packages/claims/src/cliArgs.ts:4@5d5b2e0` — `* The predecessor was one parser over a shared flag namespace: every flag was`

**Evidence:** `packages/claims/src/cliArgs.ts:85@5d5b2e0` — `["--require-markers", "check"],`

**Evidence:** `packages/claims/src/cliArgs.ts:201@5d5b2e0` — `function parseCheck(rawArgv: readonly string[]): CheckArgs {`

But `--help` is still global — it is detected before the command word is
looked at, and prints one usage block for every command:

**Evidence:** `packages/claims/src/cliArgs.ts:148@5d5b2e0` — `if (argv.some((arg) => arg === "--help" || arg === "-h")) {`

**Evidence:** `packages/claims/src/cli.ts:905@5d5b2e0` — `case "help":`

**The Action cannot adopt JSON output in this change.** It pins the
*published* checker version, and no published version has `--format`:

**Evidence:** `action/action.yml:47@5d5b2e0` — `default: '0.7.0'`

Bumping `packages/claims/package.json` inside this change would not help — the
Action resolves from npm. Task 2.3 is therefore a follow-up gated on a
release, not a task in this change.

**The issues the proposal says it closes are already closed.** As of this
design, `gh issue view` reports #4, #6 and #7 all `CLOSED`. The proposal's
Impact section has been corrected to say so; the remaining action is a
comment on #4 and #7 linking the PR, which is a human step (Decision 7).

**`--propose` is deliberately not the default audit mode:**

**Evidence:** `spec/evidence-anchors.md:393@5d5b2e0` — `and not the default, deliberately: institutionalising the confirmation-shaped`

The funnel in Decision 6 names it anyway, because the funnel fires only on a
repository with *zero* anchors — the retrofit case the same passage says
`--propose` is kept for. The tension is real and is recorded under Open
questions rather than resolved here.

**The command surface is constrained, not just small by habit:**

**Evidence:** `openspec/project.md:16@5d5b2e0` — `new verdict families get new unions. Its command surface stays small.`

This change adds three flags to one existing command and no command. The
README already promises the first of them:

**Evidence:** `README.md:414@5d5b2e0` — ``--stamp` pass that fills in the commit for anchors that verify against the``

## Decisions

### 1. One marker rewriter beside the grammar, one pure planner, one write per document

**Chosen:** Two small pieces.

`parseClaims.ts` exports one new function next to the regexes it uses:

```ts
rewriteMarker(line: string, patch: { line?: number; rev?: string }): string | null
```

It runs the same `PRESENCE_DOUBLE` / `PRESENCE_SINGLE` / `PRESENCE_BLOCK_HEAD`
patterns the parser runs, and returns the line with only the `:LINE` and
`@rev` groups substituted — or `null` when the line does not parse as a
presence marker. It splices by **match index**: only the `:LINE` and `@rev`
character spans are replaced, and every other byte of the line — the list
prefix, the separator (which sits outside every capture group and may be an
em-dash, en-dash or hyphen), the quote, trailing whitespace — is copied
through verbatim. Rebuilding the line from capture groups would silently
normalise the separator. The parser's `DOUBLE`-before-`SINGLE` try order is
mirrored, for the same reason it exists there.

A new `packages/claims/src/rewrite.ts` exports a pure planner:

```ts
type StampCheck = (claim: PresenceClaim) => string; // "ok" | "weak-anchor" stamp; any other string is the skip reason
interface RewriteIntent { fix: boolean; stamp: { rev: string; verify: StampCheck } | null }
planRewrites(
  content: string,
  results: readonly ClaimResult[],
  intent: RewriteIntent,
): { content: string; applied: Rewrite[]; skipped: Skipped[] }
```

For each presence result it intends to change, it takes the document line at
`claim.source.line` and **re-parses it**: if that line does not parse to the
same `(path, line, rev)` the result was computed from, the result is recorded
under `skipped` with reason `marker-changed` and the line is left alone.
Otherwise `rewriteMarker` produces the replacement. Between the `fix` pass and
the `stamp` pass the marker is re-parsed again, so the second sees the first's
output.

The CLI does the I/O: it already holds `content` from the read that produced
`results`, calls `planRewrites` once per document, and when `applied` is
non-empty writes the new content to a sibling temp file and renames it over
the original. One write per document, never per anchor.

**Alternatives considered:** (a) rewrite inside `checkClaims` as a side effect
of a `fix` option; (b) re-read the document immediately before writing and
diff it against the earlier read; (c) rewrite per anchor; (d) copy the marker
regexes into `rewrite.ts`.

**Rationale:** (a) puts a filesystem write inside the pure kernel function
every other check in this repository keeps pure (`checkClaims`, `checkRule`,
`checkWiring` all take already-read input; the scan/write halves live in
sibling modules or the CLI). (b) is what the proposal's "a marker that changed
between read and write is skipped" sounds like, but the process reads each
document once and writes it once within milliseconds; the window that matters
is the rewrite module acting on a line that is not the marker it thinks it is
— which the re-parse check catches exactly, and a whole-file diff would not
localise. (c) multiplies the write and makes the atomicity story per-line
instead of per-document. (d) is two grammars that can diverge; the regexes are
module-private today and the right fix is one exported function beside them,
not an exported regex and a second consumer.

**Tests this decision owes** (named in `tasks.md` 1.1, all in
`rewrite.test.ts` / `parseClaims.test.ts`): `marker-changed` — a result whose
source line no longer parses to the same `(path, line, rev)` is skipped and
reported, and the line is byte-identical; and the property test the spec asks
for — a hand-rolled generator over synthetic marker lines (all three shapes,
with and without a stamp, with list prefixes and each separator variant)
embedded in random surrounding content, 200 trials over a seeded PRNG with a
fixed seed so the run is deterministic, with the oracle that **every byte
outside the `:LINE`/`@rev` spans of the affected marker lines is identical to
the input**. That is deliberately stricter than "the quote span is identical":
it also pins the prefix and the separator, which is where a rebuild-from-groups
implementation would go wrong. There is no property-testing library in this
repository and adding one for a single test is not worth the dependency.

### 2. `ClaimResult` gains an optional `foundLine`, taken from `locate`, and the drift window is measured from it

**Chosen:** `ClaimResult` grows one optional field, `foundLine?: number`,
set on the `drift` and `wrong-line` results to the line `locate` identified
(`where.first` — the exact-preferred unique match), and absent on every other
verdict. `--fix` reads `foundLine`; it never reads `detail`.

To make the verdict and the number agree, the `drift` / `wrong-line` split is
computed from that same line: `drift` when `|where.first − claim.line| ≤
driftWindow`, `wrong-line` otherwise. The window scan with `matchesAt` is
removed; `detail` on both branches names `where.first`.

**This is a behaviour change in two edge shapes**, and both are called out
rather than smuggled. (1) A quote with exactly one exact match outside the
window and a substring match inside it is `drift` today (naming the substring
line) and becomes `wrong-line` (naming the exact line). (2) An exact match and
a substring-only line both inside the window: the verdict stays `drift`, but
the reported number moves from whichever the scan hit first to the exact
line. Every verdict involved passes, so no run changes colour. A named test
pins each shape. The DRIFT row of `spec/evidence-anchors.md` ("text found
within the drift window") is edited to say the *unique* match is within the
window, so the spec describes the new rule (task 1.2).

**Alternatives considered:** parse `text is on line (\d+)` out of `detail`;
have `rewrite.ts` call `locate()` again on the file; keep the window scan and
set `foundLine` from it.

**Rationale:** Parsing the checker's own prose makes English a wire format
and breaks the first time someone improves a message. Re-locating duplicates
the verdict's logic in a second place and lets the two disagree — the fix must
move the citation to the line the *verdict* found. Keeping the window scan
keeps the disagreement Stage 2 found: `--fix` would repoint to a substring
line while the uniqueness survey pointed elsewhere, and the re-check would
read `ok` and hide it. An additive optional field changes no existing
consumer: `report()`, the characterization suite, and every `ClaimResult`
literal in tests remain valid. The stamped path builds its results
field-by-field and `checkUnstamped` destructures `{ verdict, detail }`
explicitly, so `foundLine` reaches a stamped result only by a deliberate edit
— keep both sites as explicit field lists, never a spread.

This is not a new verdict and does not touch the `Verdict` union or the
`PASSING` set.

### 3. `--fix` rewrites `drift` and `wrong-line` on **unstamped** anchors, and nothing else

**Chosen:** `--fix` repoints the line number for results whose verdict is
`drift` or `wrong-line` **and whose `claim.rev` is undefined**. The stamp
test is the load-bearing half of the filter: it is what keeps `--fix` on the
right side of `.claude/rules/never-repoint-under-old-stamp.md`, because — as
the Context shows — the fail-open path can hand a stamped anchor either
verdict.

Every other result is untouched: `fabricated` and `unpinned` because there is
nothing true to move the citation to; anything with a `rev` because the only
correct repair of a stamped anchor re-stamps both halves, which is `--stamp`'s
job after the human has re-read; `weak-anchor` and `ok` because the line is
right.

**Alternatives considered:** `drift` only, as issue #7 originally scoped it;
filtering on verdict alone, as an earlier draft of this design did.

**Rationale:** The safety condition for an automatic repoint is "the quote
identifies exactly one place in the file *and* no commit has been named",
and after Decision 2 the first half is established by the same survey for
both verdicts. `drift` and `wrong-line` then differ only in how far the
unique match is from the cited line, and distance is not a reason to make a
human retype a number the tool has already computed. Issue #7's caution was
about ambiguity, and ambiguity now has its own failing verdict. If Stage 2
review still prefers `drift` only, narrowing is a one-line change to the
verdict filter; the stamp half of the filter is not negotiable.

**Tests this decision owes** (`tasks.md` 1.3, temp-dir tests in the style of
`revAnchors.test.ts`): a stamped anchor is never rewritten — including the
case where its rev is unreadable (`readFileAtRev` returns `unknown-rev`) and
the verdict is therefore `drift`; `fabricated` and `unpinned` anchors are
byte-identical after `--fix`; a `drift` and a `wrong-line` anchor are
repointed and re-check `ok`.

### 4. `--stamp` writes a claim about HEAD only after reading the file at HEAD

**Chosen:** `--stamp` resolves HEAD once per run (`git rev-parse --short
HEAD`, via a new `headRev(root)` in `runners.ts` beside `revFileReader`, with
the same timeout). If HEAD cannot be resolved, `--stamp` exits 2 before
reading any document: a stamp is a claim about a commit, and there is no
commit to claim.

`checkClaims.ts` exports one new pure helper:

```ts
export type RevVerification = "ok" | "weak-anchor" | "not-at-rev" | "rev-unreadable";
verifyAtRev(
  claim: PresenceClaim, rev: string, deps: CheckDeps, options?: CheckOptions,
): RevVerification
```

`RevVerification` is a named vocabulary and public API, and it is **not a
`Verdict`**: it has no `PASSING` set, is never rendered as a result, and two
of its members share spelling with `Verdict` members only because they are
the same evaluation outcome on the same lines. The CLI passes `verifyAtRev`
the same `CheckOptions` it passed `checkClaims`, so `driftWindow` and
`minAnchorChars` resolve identically in both places.

It calls `deps.readFileAtRev(claim.path, rev)` and **requires
`status === "ok"`**; anything else — `no-file`, `unknown-rev`, `unavailable`,
or `readFileAtRev` absent — is `rev-unreadable`. Only lines actually read at
`rev` are evaluated (with the existing `evaluateAgainst`), and only `ok` or
`weak-anchor` on those lines returns as such; every other verdict is
`not-at-rev`.

For each **unstamped** presence result whose working-tree verdict is `ok` or
`weak-anchor` (or `drift`/`wrong-line` just repointed by `--fix` in the same
run), `--stamp` calls `verifyAtRev(claim, head, deps)` and writes `@head`
only on `ok` / `weak-anchor`. `not-at-rev` and `rev-unreadable` are recorded
under `skipped` with that reason and left unstamped.

**Alternatives considered:** stamp every anchor that verifies against the
working tree with HEAD, as the proposal and the README roadmap literally say;
construct `{ ...claim, rev: head }` and run it through the existing stamped
path, gating on the resulting verdict — an earlier draft of this design.

**Rationale:** "Verifies against the working tree" and "was at this line at
HEAD" are different propositions, and the stamp asserts the second. A cited
file with uncommitted edits can pass in the working tree and be `fabricated`
at HEAD — and a stamp is the one thing in this grammar that turns into a
*hard* failure when it is wrong. Writing it unverified would have the
stamping pass manufacture the exact verdict `never-repoint-under-old-stamp`
exists to protect. The earlier draft's verdict-gate does not close this:
Stage 2 review showed the fail-open branch returns a working-tree `ok` when
git is unavailable, byte-identical to a real HEAD verification. Only the
read status says whether HEAD was consulted, and no `Verdict` carries it — so
the gate is the read status, exposed by a helper that re-uses the kernel's
own evaluation rather than a second copy of it.

`weak-anchor` is included because it is verified at the line; the stamp
settles "this text was here at this commit", which is true. The verdict
stays advisory after stamping, exactly as it was before. Stage 2 may narrow
this to `ok` only; the design notes it as a one-token filter.

**Composition with `--fix`:** in one run, fix is planned first, and a
repointed anchor is then a candidate for stamping — verified at HEAD like any
other, at its *new* line. The two never touch the same group in different
directions: `--fix` writes `:LINE`, `--stamp` appends `@rev`, and the marker
is re-parsed between the two plans.

**Tests this decision owes** (`tasks.md` 1.4, temp-dir git repos in the
style of `revAnchors.test.ts`): an anchor whose quote an uncommitted edit
added, so it passes in the working tree but is not at HEAD, is **not**
stamped and is reported `not-at-rev`; an anchor whose quote an uncommitted
edit removed, so it is `fabricated` locally but present at HEAD, is never a
candidate — byte-identical and still failing (the laundering case); with `readFileAtRev`
returning `unavailable` (simulated git timeout) nothing is stamped and every
candidate is reported `rev-unreadable`; with no resolvable HEAD the command
exits 2 and writes nothing; a clean-tree `ok` anchor gains `@<head>` and
re-checks `ok`; `--fix --stamp` in one run repoints then stamps at the new
line.

### 5. `--format json` is a second renderer over the same results and the same exit code

**Chosen:** `--format <human|json>`, default `human`. Under `json`, stdout
carries exactly one JSON document and nothing else; every diagnostic that
today goes to stderr still goes to stderr; the exit code is computed by the
same expression as human mode.

To make that true, `runCheck` is split into a **collect** phase — per
document: content, claims, results, guard result, line count — and a
**render** phase, with the failure count and the marker-floor test computed
from the collected structure rather than inside `report()`. Both renderers
read the same structure; the exit code is computed once, after collection,
independent of which renderer ran. This is the refactor Stage 2 review asked
to be named rather than waved at.

Shape (version-tagged so it can change):

```json
{
  "version": 1,
  "documents": [
    { "doc": "README.md", "lines": 420,
      "results": [
        { "verdict": "drift", "label": "DRIFT", "failing": false,
          "source": { "doc": "README.md", "line": 12 },
          "claim": { "kind": "presence", "path": "src/a.ts", "line": 88,
                     "rev": "a1b2c3d", "text": "const x = 1;" },
          "detail": "text is on line 90, not 88 — update the citation",
          "foundLine": 90 }
      ] }
  ],
  "summary": {
    "documents": 3, "anchoredDocuments": 2,
    "unanchored": [ { "doc": "docs/b.md", "lines": 57 } ],
    "presenceAnchors": 4, "absenceAnchors": 1,
    "verdicts": { "ok": 3, "drift": 1, "fabricated": 1 },
    "failures": 1, "markerFloorFailed": false,
    "next": null
  },
  "rewrites": { "applied": [], "skipped": [] }
}
```

`claim` is the parsed `Claim` minus `source` (hoisted); `verdict` is the
union member verbatim; `label` is the human-mode label (`SEARCH-CLEAN` for a
passing absence claim) so scripts can key on either. `failing` is computed
by `isFailure` — the same allowlist predicate that decides the exit code —
and never by enumerating failing verdicts, which would invert that allowlist
and drift the first time the union grows. `summary.next` carries
the funnel command from Decision 6 when it fires. `rewrites` is present only
when `--stamp` or `--fix` ran.

**Compatibility policy, stated before v1 ships:** `verdict` makes the
`Verdict` vocabulary a wire contract. Adding a field to any object is not a
breaking change. Renaming or removing a field is. **Adding a member to the
`Verdict` union is also breaking** for any consumer that switches on
`verdict` exhaustively, and bumps `version` — the same discipline
`openspec/project.md` applies to the union itself. Consumers that only need
pass/fail should read `failing`, which is stable across union growth.

**Alternatives considered:** `--json` as a boolean; or JSON Lines, one object
per result.

**Rationale:** `--format` leaves room for a third renderer (SARIF is the
obvious one for PR annotations) without a flag per format. A single document
rather than JSON Lines because the summary counts are the part a script wants
first, and they are only knowable at the end.

**Tests this decision owes** (`tasks.md` 2.1–2.2): a unit test of the JSON
renderer over a fixed result set; and in `cli.characterization.test.ts`,
which spawns the built binary, exit-code parity between `--format json` and
human mode on a passing document, a failing document, and `--require-markers`
over an unanchored document — with stdout parsing as JSON in every case.

### 6. Per-command help, and the funnel replaces `All 0 ... verified.`

**Chosen:** `nullius <command> --help` prints that command's block — one
paragraph of purpose, its flags, and exactly one example invocation — and
exits 0. `nullius --help` prints the overview as today. Implemented in
`cliArgs.ts` by making the global-flag check command-aware: when a command
word precedes `--help`, the parser returns `{ kind: "help", requested: true,
command }`, and `cli.ts` selects the block. `USAGE` is split into per-command
constants the overview concatenates, so there is one copy of each block.

The funnel: when `check` matched at least one document and found zero
grounding markers across all of them, the closing line is no longer
`All 0 grounding marker(s) verified.` but

```
next: nullius audit <doc> --propose
```

where `<doc>` is the largest matched document by line count. Exit code is
unchanged (0, or 1 under `--require-markers`). Under `--format json` the same
string appears as `summary.next`.

**Alternatives considered:** keep `--help` global and add examples to the
overview; append the funnel line after `All 0 ... verified.` instead of
replacing it; point the funnel at plain `audit <doc>` (refute-first) instead
of `--propose`.

**Rationale:** The overview is already nine commands long and is what a user
who typed `nullius check --help` gets today; that is the shape of a CLI that
knows the answer and prints the whole manual instead. Replacing rather than
appending because `All 0 grounding marker(s) verified.` is literally true and
practically misleading — it reads as a pass on a repository the tool has not
examined at all — and the density line one row above already carries the
count. No consumer in this repository greps the closing line (Context).

On `--propose` versus plain `audit`: the funnel fires only on a document set
with no anchors, which is the retrofit case the spec keeps `--propose` for; a
refute-first audit of a document with nothing to refute produces nothing. The
proposal names `--propose` explicitly. The spec's caution — that making the
confirmation-shaped lane the suggested road builds the bias in — applies
regardless, and two reviewers across two rounds (rule-auditor, then
architecture-reviewer) recommended plain `audit <doc>`. This document does
not override the author's explicit choice; it is listed under Open questions
and carried in the PR body for a human call. The string is one constant.

**Tests this decision owes** (`tasks.md` 3.1–3.2): `cliArgs.test.ts` —
`check --help` parses to help with `command: "check"`; characterization —
`check --help` exits 0 and prints exactly one example; a zero-marker run ends
with the `next:` line and does **not** print `All 0 grounding marker(s)
verified.`; the same run under `--format json` carries `summary.next`.

### 7. Two former tasks leave the task list: the Action follow-up and the issue comments

**Chosen:** Adopting JSON in the Action's comment rendering is a follow-up
gated on the release that ships `--format json`, because the Action pins the
published checker (Context). Commenting on closed issues #4 and #7 with the
PR link is a human step — there is nothing left to close, and posting to
issues is outward-facing action this pipeline does not take on its own. Both
live under a `Follow-ups` heading in `tasks.md` as plain bullets, not
checkboxes, so no gate can tick them on faith. The proposal's Impact bullet has been corrected to say the
issues are closed and this change delivers the behaviour they asked for.

**Rationale:** A task that cannot be completed inside the change is a task
that gets ticked on faith, and this repository's whole thesis is that ticks
are not evidence. Recording the real dependency is cheaper than a reviewer
discovering the Action still says `0.7.0` after merge.

## Open questions

- **The funnel names `--propose`.** Decision 6 keeps it on the grounds that
  the zero-anchor case is the retrofit case; `spec/evidence-anchors.md:393`
  cautions against making the confirmation-shaped lane the suggested road.
  Options: keep `--propose`; point at plain `audit <doc>`; print both with
  one line of guidance. **Needs the author's call** — it is carried in the PR
  body as an open concern and does not block implementation, since the string
  is one constant.
- **Should `--fix` narrow to `drift` only?** Decision 3 argues for both
  verdicts. If the reviewer position is that `wrong-line`'s larger distance
  is itself a signal a human should look at, the filter is one line and the
  spec's requirement text changes with it.
- **Should `--stamp` include `weak-anchor`?** Decision 4 includes it because
  the stamp's proposition is true. The counter-argument is that stamping a
  weak anchor makes a nearly-contentless citation look settled. Either answer
  is a one-token filter.
- **Multi-line block quotes under `--fix`:** the block head carries the line
  number and `foundLine` is where the *first* quoted line matched; the
  consecutive-lines requirement was already checked by the verdict, so the
  head is the only thing to move. Flagged so a reviewer confirms there is no
  second coordinate to update.
- **Whether `--stamp` should refuse on a dirty working tree for the cited
  file** rather than skipping with `not-at-rev`. Skipping is chosen because a
  partially-stampable document is the common case mid-change; the skip is
  reported, not hidden.
