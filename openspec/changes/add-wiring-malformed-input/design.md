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

`checkWiring` (`packages/claims/src/wiring.ts:216-381@8c6ea59`) is **not** an
exhaustive switch over `WiringVerdict` the way `checkClaims.ts`'s core
function is over `Verdict` — contrast:

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

### 2. A `parseError` field on `HarnessArtifact`, checked ahead of the per-field loops

**Chosen:** Add one field to `HarnessArtifact` — carrying at most one parse
failure (verdict, line, detail) per artifact — populated by `wiringScan.ts`
when a hooks/settings file fails `JSON.parse`, or a markdown artifact's
frontmatter fence opens and never closes. `checkWiring` checks this field
once per artifact, pushes the finding if present, and lets the existing
per-field loops run unchanged underneath it (they iterate zero times when a
parse fails, since every declared-field array is already empty in that case —
see `markdownArtifact`, `packages/claims/src/wiringScan.ts:146-164@8c6ea59`,
and the hook-source loop, `packages/claims/src/wiringScan.ts:175-197@8c6ea59`).

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
assertion: `hookTarget`'s decline behavior carries 29 unit tests
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

## Open questions

- Whether `unclosed-frontmatter` should also count toward
  `WiringReport.references` the way `unsubstituted-token` does (a token found
  in prose still increments `references`,
  `packages/claims/src/wiring.ts:368@8c6ea59`) or should not, on the reasoning
  that a parse failure examined zero declared references rather than one bad
  one. Implementation should follow whichever reading keeps
  `cli.ts`'s "references === 0 means nothing was ever examined" invariant
  (`packages/claims/src/cli.ts:363-372@8c6ea59`) true for a single-artifact
  repo whose only artifact fails to parse.
- Whether the two new verdicts belong in the `PASSING` set's neighborhood in
  `spec/wiring.md`'s table only, or also warrant a one-line mention in
  `openspec/specs/wiring/spec.md`'s `## Purpose` prose, which currently
  describes only the declared-vs-prose split and not document validity at
  all. Left to the implementer's judgment during Task 3 (spec delta).
