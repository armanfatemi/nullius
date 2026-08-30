# Design — add-wiring-malformed-input

## Context

`nullius wiring` (`packages/claims/src/wiring.ts` + `wiringScan.ts`) scans
harness artifacts and reports declared references that do not resolve. Its
own doc comment names the boundary this design has to respect:

**Evidence:** `packages/claims/src/wiring.ts:13@8c6ea59`

```ts
 * Its own verdict union on purpose: the kernel's exported `Verdict` is public
 * API, and growing it is a breaking change.
```

`WiringVerdict` currently has eight members (`ok` plus seven that
`checkWiring` can actually emit):

**Evidence:** `packages/claims/src/wiring.ts:22@8c6ea59`

```ts
export type WiringVerdict =
  /** The reference resolves. */
  | "ok"
  /** A declared dispatch names an agent with no definition file. */
  | "dangling-agent"
  /** A declared skill reference names a skill with no SKILL.md. */
  | "dangling-skill"
  /** A declared read path does not exist. */
  | "missing-path"
  /** A declared glob matches no file. */
  | "empty-glob"
  /** A hook command does not resolve, or is not executable. */
  | "dead-hook"
  /** A `{{TOKEN}}` placeholder survived a port. */
  | "unsubstituted-token"
  /** A backticked path in prose that does not resolve. Advisory. */
  | "loose-reference";
```

`checkWiring` (`packages/claims/src/wiring.ts:216-381@8c6ea59`) has no single
dispatch point where a new verdict naturally lands. `checkClaims.ts` reaches
its `"malformed"` verdict from a branch of a switch over the claim's *kind* —
not over `Verdict`; no exhaustive switch over `Verdict` exists anywhere in the
kernel — and that branch is a natural home for a parse failure:

**Evidence:** `packages/claims/src/checkClaims.ts:604@8c6ea59`

```ts
      case "malformed":
        return {
          claim,
          verdict: "malformed" as const,
          detail:
            "not a valid citation — expected `path:line` — `text`, or `command` → N results",
        };
```

`checkWiring` instead loops per-artifact, per-declared-field
(`item.dispatches`, `item.skills`, `item.reads`, `item.globs`, `item.hooks`,
`item.tokens`, `item.loose`), each with its own safety check and its own
existence check. A parse failure — where an artifact has *no* per-field data
at all, because the scan step that would have populated it aborted first — is
not a value any of those seven loops can carry, since every one of them
already reads as an empty array when a parse fails.
`packages/claims/src/witness.ts` solved the structurally identical problem
(a journal line that is not valid JSON) by checking for the parse failure
*before* attempting any of the record-shape work, and pushing one loud
finding rather than a cascade of silent absences:

**Evidence:** `packages/claims/src/witness.ts:445@8c6ea59`

```ts
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      findings.push({
        line,
        verdict: "malformed",
        subject: raw.slice(0, 60),
        detail: "not valid JSON — a journal is JSON Lines, one record per line",
      });
      continue;
    }
```

That is the closest existing precedent in this codebase for "a parse failure
becomes one verdict, not a silent empty result," and it shapes Decision 2
below.

## Decisions

### 1. Two distinct new verdict names, not one shared "malformed"

**Chosen:** Add `malformed-hooks` (a hooks/settings JSON file that fails to
parse) and `unclosed-frontmatter` (a markdown artifact whose frontmatter fence
opens and never closes) as two separate `WiringVerdict` members.

**Alternatives considered:** A single shared `malformed` (or
`unparseable-input`) verdict covering both cases, mirroring
`checkClaims.ts`'s and `witness.ts`'s own single `"malformed"` member.

**Rationale:** `checkClaims.ts`'s `"malformed"` and `witness.ts`'s
`"malformed"` each answer one question ("is this one line a valid citation /
a valid JSON record"), so one name is enough. This proposal's two failures
are not that — they are different documents (a JSON hooks file vs. a markdown
artifact's frontmatter block), caught by different code (`JSON.parse` inside
`hookCommands` vs. a fence-matching loop inside `parseFrontmatter`), with
different remediation (fix the JSON syntax vs. add the missing closing
`---`). A fresh devil's-advocate review of this idea's premise raised exactly
this objection unprompted: conflating distinct failure modes under one label
makes the report say less than it knows, the same complaint this checker's
own design already makes about `hookTarget`'s two silent-`null` paths being
indistinguishable (`spec/wiring.md:220-224@8c6ea59` — "an absolute path and
an escaping one are indistinguishable by the time either goes quiet").
Every existing `WiringVerdict` member is already named for its specific
failure (`dangling-agent` vs. `dangling-skill`, not one shared
`dangling-reference`) — two specific names keep that convention rather than
break it for these two new cases alone.

(See the `WiringVerdict` member list quoted above, showing the specific-name
convention.)

**Why these belong in `WiringVerdict` rather than a new union.** The question
is not rhetorical: `openspec/project.md` states as an absolute constraint that
new verdict *families* get new unions, and this module's own header names its
subject narrowly:

**Evidence:** `packages/claims/src/wiring.ts:2@0651b46` — ` * References that must resolve.`

A verdict about a file that will not parse looks, at first reading, like a
different family — document validity rather than reference resolution — and on
that reading the constraint would require a second union.

It is the same family, and the reason is what `wiring` actually asks. It does
not ask whether a document is well-formed for its own sake; it asks whether
what an artifact **declares** can be resolved. A `hooks.json` that fails
`JSON.parse` has declared commands that cannot be resolved — not one of them,
all of them. That is the limiting case of the existing family — every declared
reference failing at once, for one recoverable reason.

**`unclosed-frontmatter` needs a different argument, and the module supplies
it.** The limiting-case reading does not stretch to cover it, for two reasons.
`parseFrontmatter` returns `null` identically for *no fence* and *unclosed
fence* (`packages/claims/src/frontmatter.ts:62` and `:65`), so the checker
cannot know the block declared anything — "every declared reference failing at
once" may be zero references failing. And the artifact's other fields still
resolve: `front === null` sets `body = content`, so `tokens` and `loose` are
populated from the whole file.

The argument that does hold is the module's own division of labour:

**Evidence:** `packages/claims/src/wiring.ts:8@0651b46` — ` * Only DECLARED fields fail. A path in prose might be a live pointer or an`

**Evidence:** `packages/claims/src/wiring.ts:10@0651b46` — ` * unresolvable one is advisory. The hard half reads frontmatter, where the`

The hard half reads frontmatter. An unclosed fence destroys that half's entire
input, and `tokens` and `loose` surviving is not a counterexample — those are
the advisory half, working exactly as designed. The checker is left unable to
answer its own question for the half where the author committed to something.

On "may be zero references failing": the checker cannot distinguish a
declaration block that was empty from one it could not read, and for a checker
whose whole subject is *do your declared references resolve*, unanswerable is
not a pass. A file opening with `---` announced a declaration block; a file that
does not, did not. The change is between "you declared nothing" and "you opened
a commitment and I cannot read it."

**The same epistemic limit applies to both, and neither argument rests on
escaping it.** A hooks file that parses to `{}` declares zero commands
legitimately, so a malformed one has unknown declarations exactly as an
unreadable fence does — the "may be zero" objection is not special to the fence,
and an earlier draft of this section conceded it for one verdict while letting
the other keep an argument that assumed it away. Neither verdict needs to know
how many references were declared. Both rest on the same thing: the hard half's
input is destroyed, and a checker whose subject is *do your declared references
resolve* cannot answer for that half.

So neither verdict belongs in a new union. `malformed-hooks` additionally
satisfies the limiting-case reading, which `unclosed-frontmatter` does not — but
that is a bonus property of one, not the load-bearing argument for either. The
union's subject is unchanged and the header needs no rewrite. The constraint is satisfied rather
than set aside, which matters because setting aside a constraint documented as
absolute is the kind of decision that reads as wrong six months later even when
it was defensible at the time.

### 2. A `parseError` field on `HarnessArtifact`, checked ahead of the per-field loops

**Chosen:** Add one field to `HarnessArtifact` — carrying at most one parse
failure (verdict, line, detail) per artifact — populated by `wiringScan.ts`
when a hooks/settings file fails `JSON.parse`, or a markdown artifact's
frontmatter fence opens and never closes. `checkWiring` checks this field
once per artifact, pushes the finding if present, and lets the existing
per-field loops run unchanged underneath it. **How many of those loops iterate
zero times depends on which parse failed**, and two earlier drafts of this
section got it wrong — first claiming every array is empty, then giving a single
count for two paths that differ:

| | empty | populated |
|---|---|---|
| `unclosed-frontmatter` | `dispatches`, `skills`, `reads`, `globs`, `hooks` | `tokens`, `loose` |
| `malformed-hooks` | all but one | `tokens` |

On the fence path, `markdownArtifact`
(`packages/claims/src/wiringScan.ts:146-164@8c6ea59`) hard-codes `hooks: []`,
and a `null` frontmatter sets `body = content` — so `tokens: tokensIn(content)`
and `loose: looseCandidates(body, bodyStart)` are both populated from the whole
file, unparsed frontmatter block included. On the hooks path `hookCommands`
returns `[]` and `loose` is set to `[]` outright, so only `tokens` survives.

That does not change the decision — the `parseError` field is still checked
ahead of the loops, and a hard finding is still pushed once per artifact — but
it is the model the Open Question below has to be answered against.

**Alternatives considered:**
(a) Force the failure through the existing per-field model — e.g., synthesize
a fake `dispatches` entry to carry the parse error. Rejected: it would
misreport a document-validity problem as a dangling-reference problem, the
same category error Decision 1 avoids, and it would corrupt the
`references` count `checkWiring` returns (`packages/claims/src/wiring.ts:78`)
with an entry that names nothing real.
(b) A top-level `WiringReport.parseErrors: WiringFinding[]` separate from
`findings`. Rejected: it creates two places a caller has to check for a
non-passing run, when `isWiringFailure` and the CLI's exit-code logic
already assume every hard fact lives in one `findings` array
(`packages/claims/src/cli.ts:363-372@8c6ea59` reasons explicitly about
`findings` being the complete account of a run: "Every finding above is
either a hard failure or a `loose-reference` advisory").

**Rationale:** This mirrors `witness.ts`'s shape (check for the parse failure
first, one finding, `continue`) without disturbing `checkWiring`'s existing
per-field loop structure or the meaning of any existing field.

**Evidence:** `packages/claims/src/wiring.ts:42@8c6ea59`

```ts
export interface HarnessArtifact {
  /** Repo-relative path of the file these references came from. */
  path: string;
  kind: ArtifactKind;
  /** The `name:` this artifact declares for itself, when it has one. */
  name: string | null;
  dispatches: Located[];
  skills: Located[];
  reads: Located[];
  globs: Located[];
  hooks: Located[];
  tokens: Located[];
  loose: Located[];
}
```

(Current `HarnessArtifact` interface, showing every existing field is a
`Located[]`, none of which can carry "the whole artifact failed to parse".)

### 3. Detect the unclosed fence without changing `parseFrontmatter`'s signature

**Chosen:** Add a small additive export to `frontmatter.ts` — a function that
answers "did this content open a frontmatter fence it never closed?" — built
by factoring the two-line fence-matching check already inside
`parseFrontmatter` into a shared internal helper that both the existing
public function and the new one call. `parseFrontmatter`'s own signature
(`Frontmatter | null`) and every existing caller are untouched.

**Alternatives considered:** Widen `parseFrontmatter`'s return type to a
discriminated union (e.g. `{ ok: true; front: Frontmatter } | { ok: false;
reason: "none" | "unclosed" }`) so the distinction is available at the one
call site that needs it.

**Rationale:** `parseFrontmatter` is exported from
`packages/claims/src/index.ts:77@8c6ea59` — it is public API of this package,
not an internal helper. `wiringScan.ts` is not its only caller in principle,
and every existing caller (in this repo, `frontmatter.test.ts` and
`wiringScan.ts` itself) treats a `null` return as one meaning: "no usable
frontmatter here, proceed as if there is none." Splitting that single `null`
into two outcomes changes what every caller must handle to stay correct, for
a distinction only `nullius wiring` needs. An additive, narrowly-scoped
function keeps the existing contract exactly as documented
(`packages/claims/src/frontmatter.ts:60-65@8c6ea59`) while giving
`wiringScan.ts` the one extra bit of information it needs.

**Evidence:** `packages/claims/src/frontmatter.ts:60@8c6ea59`

```ts
export function parseFrontmatter(content: string): Frontmatter | null {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== FENCE) return null;

  const close = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
  if (close === -1) return null;
```

### 4. The declined hook command (gap #3) is a Non-Goal, not a deferred task

**Chosen:** No verdict, field, or report change for `hookTarget` returning
`null`. This gap stays exactly as documented today.

**Rationale:** Treating all three silences as one bug list would conflate a
genuine oversight with a tested, intentional design decision, and forcing a
verdict onto the third would misrepresent an abstention as a defect. That
holds up against the actual code and its own design record, not just as an
assertion: `hookTarget`'s decline behavior carries 25 unit tests
(`describe("hookTarget", ...)`, `packages/claims/src/wiring.test.ts:199`),
and `spec/wiring.md` devotes lines 123–226 to why declining beats guessing,
including a concrete account of an earlier version of this exact function
that *did* try to pick a winner and produced "a wrong but confident path"
(`spec/wiring.md:137-144@8c6ea59`). Reopening that decision was explicitly
out of scope for this idea; if it is ever revisited, `spec/wiring.md:224-226`
already names the narrower, real open question worth a separate design pass
("Whether that pair deserves to be split — a verdict for one, the current
silence for the other — is a real design question this document is not the
place to settle").

**Evidence:** `packages/claims/src/wiring.ts:197@8c6ea59`

```ts
export function hookTarget(command: string, pluginRoot: string): string | null {
  // Backslash quoting is where four attempts at reading these command lines
  // went wrong, each returning a confident wrong path rather than declining.
  // A partial shell parser's real failure mode is not the cases it rejects,
  // it is the cases it thinks it understood. So this does not parse backslash
  // quoting — it refuses to read a command line that uses it.
  if (command.includes("\\")) return null;

  const words = shellWords(command);
  const expanded = words.map((word) =>
    word
      .replaceAll("${CLAUDE_PLUGIN_ROOT}", pluginRoot)
      .replaceAll("$CLAUDE_PLUGIN_ROOT", pluginRoot),
  );

  const candidates = expanded.filter(isHookScript);
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}
```

(Full `hookTarget` body, unchanged by this proposal.)

### 5. Both new verdicts fail closed, and the precedent is `witness.ts`

**Chosen:** Neither `malformed-hooks` nor `unclosed-frontmatter` is added to
`PASSING`, so both fail the run.

**Why this needs writing down at all.** `PASSING` is an allowlist:

**Evidence:** `packages/claims/src/wiring.ts:85@0651b46` — `const PASSING: ReadonlySet<WiringVerdict> = new Set<WiringVerdict>(["ok", "loose-reference"]);`

A new member therefore fails closed by *omission* — the default does the work,
and nothing in the change records that anyone chose it. An unargued default and
a deliberate calibration are indistinguishable in the diff, and the next author
to add a verdict inherits no reasoning.

**The precedent is not `unverifiable-rev`.** That verdict fails *open*, and the
distinction is exactly the one that governs here: the thing it cannot read sits
**outside** the authored file. A commit a shallow clone or a fork cannot resolve
is not evidence about the author, so the checker declines to accuse. Nothing
about that reasoning transfers to a file whose malformed bytes are committed in
the working tree — the author committed them, and the checker can read the
evidence perfectly well.

The structurally correct precedent is `witness.ts`, which faces the same
question about a journal line that will not parse and answers it the same way:

**Evidence:** `packages/claims/src/witness.ts:120@0651b46` — `const PASSING: ReadonlySet<JournalVerdict> = new Set<JournalVerdict>(["ok"]);`

Its `malformed` is absent from that set and so fails closed. This design
already cites `witness.ts` for the *shape* of the fix — check for the parse
failure before the per-field work — and this is the same module answering the
calibration question too.

**Alternatives considered:** advisory, like `loose-reference`. Rejected: an
advisory is for a finding the checker cannot be sure about, and prose paths are
the case that earns it — a backticked path may be a live pointer or an
illustrative example, and nothing can tell them apart. A file that fails
`JSON.parse` is not ambiguous. Making it advisory would mean a harness whose
hooks file is syntactically broken reports a passing wiring run, which is the
silence this change exists to remove.

That argument covers `malformed-hooks` and says nothing about
`unclosed-frontmatter`, which never calls `JSON.parse`. Its own
near-zero-false-positive argument is scoping rather than syntax: the scanned set

**Evidence:** `packages/claims/src/wiringScan.ts:18@06cb2ca`

```ts
  { glob: ".claude/agents/*.md", kind: "agent" },
  { glob: ".claude/skills/**/SKILL.md", kind: "skill" },
```

is agents, skills, rules and commands — artifact classes that carry frontmatter
by convention. A prose document opening with `---` as a thematic break is
near-impossible inside that set, and a document outside it is never scanned at
all. The heuristic is narrow because its input is narrow, which is the argument
an unscoped whole-file check would not be able to make.

## Open questions

- ~~Whether `unclosed-frontmatter` should also count toward
  `WiringReport.references`.~~ **Settled: neither verdict increments it.**
  `references` is defined as declared references *examined*:

  **Evidence:** `packages/claims/src/wiring.ts:77@06cb2ca` — `  /** Declared references examined. Advisory prose references are not counted. */`

  Under the corrected model above, every declared-field loop iterates zero times
  on both paths, so zero were examined. Incrementing would make the CLI print
  "1 declared reference(s) checked" about a file it could not read, and would
  contradict this design's own rejected alternative (a), which refuses an entry
  that names nothing real.

  Leaving this to implementer judgement was itself the risk: it is exactly the
  kind of question two reasonable implementations answer differently, in a
  counter the CLI's summary sentence depends on.

  One inconsistency is inherited rather than introduced, and is named here so
  the next change does not reason from it: `unsubstituted-token` *does*
  increment `references` (`packages/claims/src/wiring.ts:370@8c6ea59`), even
  though the CLI's own definition of the count lists only `dispatches`,
  `skills`, `reads`, `applies_to` and hook `command`
  (`packages/claims/src/cli.ts:363-372@8c6ea59`) — tokens are not among them.
  That discrepancy predates this change and is out of scope for it.
- Whether the two new verdicts belong in the `PASSING` set's neighborhood in
  `spec/wiring.md`'s table only, or also warrant a one-line mention in
  `openspec/specs/wiring/spec.md`'s `## Purpose` prose, which currently
  describes only the declared-vs-prose split and not document validity at
  all. Left to the implementer's judgment during Task 3 (spec delta).
