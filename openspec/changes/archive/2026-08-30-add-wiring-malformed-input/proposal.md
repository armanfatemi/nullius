# Proposal — add-wiring-malformed-input

> **Depends on:** None

## Problem

`nullius wiring` reads harness artifacts off disk and reports every declared
reference that does not resolve. Three shapes of malformed input make it go
silent instead of reporting, and each silence is currently accepted as a
documented scope boundary rather than treated as a gap:

1. **A hooks or settings JSON file that fails to parse.** `hookCommands`
   catches the `JSON.parse` failure and returns `[]` — no hooks, no finding,
   and the file's entire hook surface goes unchecked with nothing in the
   report to say so.

   **Evidence:** `packages/claims/src/wiringScan.ts:115@8c6ea59`

   ```ts
   function hookCommands(content: string, pluginRoot: string): Located[] {
     let parsed: unknown;
     try {
       parsed = JSON.parse(content);
     } catch {
       // A hooks/settings file that fails to parse yields no hooks and no
       // finding, rather than throwing out of the scan. Reporting the parse
       // failure itself would need verdict vocabulary this command does not
       // have — it only speaks about references resolving, not document
       // validity — so this is a deliberate scope boundary, not an oversight.
       return [];
     }
   ```

   The same silence is named, in prose, as a limitation rather than fixed:

   **Evidence:** `spec/wiring.md:118@8c6ea59`

   ```
   A file that fails to parse as JSON yields no hooks and no finding for this
   checker — reporting the parse failure itself would need verdict vocabulary
   this checker does not carry, since it speaks only about references
   resolving, not about document validity.
   ```

2. **A markdown artifact whose frontmatter fence is never closed.**
   `parseFrontmatter` returns `null` when the opening `---` has no matching
   close, exactly as it does when there was never any frontmatter to begin
   with — and every caller treats both the same way: every declared field
   (`dispatches`, `skills`, `reads`, `applies_to`) silently reads as `[]`.

   **Evidence:** `packages/claims/src/frontmatter.ts:62@8c6ea59`

   ```ts
   if (lines[0]?.trim() !== FENCE) return null;

   const close = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
   if (close === -1) return null;
   ```

   **Evidence:** `packages/claims/src/frontmatter.ts:121@8c6ea59`

   ```ts
   export function declaredList(front: Frontmatter | null, key: string): Located[] {
     if (front === null) return [];
   ```

   These two cases are not the same fact about the artifact. "No frontmatter
   block was ever attempted" is a legitimate, silent non-event for a rule or
   command file that is plain prose. "A frontmatter block was opened and
   never closed" means the author was mid-declaration — the fields that
   follow it, including any `dispatches:`/`reads:` the author actually wrote,
   vanish without a trace. `spec/wiring.md` does not name this second case as
   an accepted limitation anywhere; it is a gap this checker has, undocumented.

3. **A hook command the resolver declines.** `hookTarget` returns `null` for
   any command line it cannot narrow to exactly one repo-relative script —
   ambiguous candidates, backslash quoting, a candidate that fails the path
   containment guard — and `wiringScan` drops that `null` silently rather
   than recording a finding.

   **Evidence:** `packages/claims/src/wiringScan.ts:133@8c6ea59`

   ```ts
   for (const raw of commands) {
     const target = hookTarget(raw, pluginRoot);
     // hookTarget returning null means this command line names no checkable
     // script (a shell one-liner, an ambiguous command, ...) — not that the
     // script is missing. Pushing a null entry here would both inflate the
     // reference count and hand checkWiring a meaningless finding, so it is
     // dropped rather than recorded.
     if (target === null) continue;
     found.push({ value: target, line: locateLine(lines, raw) });
   }
   ```

   This one is extensively documented as a *design choice*, not a gap:
   `spec/wiring.md:123-226@8c6ea59` spends over a hundred lines on why
   declining is correct ("Declining is the correct answer to ambiguity;
   picking is not." — line 144), and `hookTarget`'s decline behavior carries
   25 unit tests (`describe("hookTarget", ...)`,
   `packages/claims/src/wiring.test.ts:199`).

Individually, each of these three is either a named scope boundary (#1, #3)
or an unnoticed side effect of a shared `null` return (#2). Put together, they
are a single coherent shape: **inputs this checker cannot make sense of are
inputs it says nothing about**, in a tool whose entire product is refusing to
stay silent about a harness instruction that points at nothing.

## Why now

This gap was named as the natural next step the moment the wiring checker
shipped — `spec/wiring.md` writes gap #1's silence into the record with the
same "would need verdict vocabulary this checker does not carry" phrasing a
follow-up change would resolve, and `docs/adopting-the-pipeline.md` treats
the wiring check's Phase 0 landing as the point this repo started being able
to see its own harness wiring at all. Leaving two of these three cases
unaddressed keeps that visibility partial in a way nothing in the current
report surfaces: a `nullius wiring` run against a hooks.json with a typo
returns the same clean "0 findings" a run against a genuinely wired-up file
does.

## What changes

- Two new hard `WiringVerdict` members: one for a hooks/settings file that
  fails `JSON.parse`, one for a markdown artifact whose frontmatter fence
  opens and never closes. Named and reasoned about separately, not folded
  into one shared "malformed" catch-all — see `design.md` Decision 1.
- A new field on `HarnessArtifact` carrying an artifact-level parse failure,
  checked once per artifact in `checkWiring`, ahead of (and independent of)
  the existing per-field (`dispatches`/`skills`/`reads`/`globs`/`hooks`)
  loops — see `design.md` Decision 2.
- A small additive helper in `frontmatter.ts` that can tell "no frontmatter
  attempted" apart from "frontmatter opened, never closed," without changing
  `parseFrontmatter`'s existing exported signature — see `design.md`
  Decision 3.
- Fixtures under `spec/fixtures/wiring-broken/` that trip each new verdict,
  and unit tests asserting each — per this repo's own rule that a verdict
  without both is a checker that can silently stop firing.
- Updated prose in `spec/wiring.md` (verdict table, the two passages that
  currently name gap #1's silence as accepted) and `CHANGELOG.md`'s
  "Seven verdicts" line, since the count changes.

## Non-goals

- **The declined hook command (gap #3) is explicitly out of scope.** This is
  not an oversight left for later — it is the one gap of the three that a
  fresh devil's-advocate review of this idea specifically flagged as
  categorically different from the other two: a resolver that declines when
  it cannot tell one candidate script from several is a tested, documented
  design decision (25 unit tests, a hundred-plus lines of `spec/wiring.md`
  reasoning), not an unhandled failure mode. Forcing a verdict onto it would
  misrepresent a deliberate abstention as a defect, and risks resurrecting
  the earlier design `spec/wiring.md:137-144@8c6ea59` describes as already
  tried and rejected — a heuristic that "picks a winner among several
  candidates" and occasionally returns "a wrong but confident path."
- **No change to `parseFrontmatter`'s public return type.** It is exported
  from `packages/claims/src/index.ts` and is public API to anything importing
  this package. Widening `Frontmatter | null` into a richer discriminated
  result to carry the fence-unclosed distinction would be a breaking change
  to every existing caller for a distinction only the wiring checker needs.
- **No change to the kernel's exported `Verdict` union** (`checkClaims.ts`) —
  that type is untouched by this proposal. `WiringVerdict` is its own type
  precisely so that growing it does not force a change onto every consumer of
  `Verdict` (`packages/claims/src/wiring.ts:13-14@8c6ea59` — "Its own verdict
  union on purpose: the kernel's exported `Verdict` is public API, and growing
  it is a breaking change."). That does not make growing `WiringVerdict` itself
  free: it is exported from `packages/claims/src/index.ts:73` and is public
  API of `@nullius-inverba/claims` in the same sense `Verdict` is — an external
  consumer with an exhaustive switch over it would break the same way it would
  for `Verdict`. The blast radius inside this repo is small, not zero: no
  exhaustive switch over `WiringVerdict` exists anywhere in
  `packages/claims/src` today, and `PASSING` (`packages/claims/src/wiring.ts:85`)
  is a `ReadonlySet`, so a new member defaults to failing rather than passing —
  an internal caller that forgets to special-case it fails safe. That is a
  reason the risk is manageable here, not a reason to claim the boundary isn't
  crossed.
- **No new CLI flag or command.** Both new verdicts surface through the
  existing `nullius wiring` report and its existing exit-code contract.

## Dependencies

### Hard (must be merged before this starts)

None

### Soft (design assumes these exist; graceful degradation if absent)

None

### Enables (future changes that will depend on this)

None known

## Size estimate

|                   |                                                                     |
| ----------------- | ------------------------------------------------------------------- |
| Estimated tasks    | ~14                                                                  |
| Packages or surfaces touched | 1 (`packages/claims` — plus doc-only edits to `spec/`, `CHANGELOG.md`, and this change's own `openspec/specs/wiring/` delta) |
| Risk              | LOW — `WiringVerdict` is exported and growing it is technically a breaking change for an exhaustive-switch consumer, but no such switch exists in this package today and `PASSING` is a `ReadonlySet` a new member defaults to failing against; package-local otherwise, no schema, wire format, or cross-repo consumer touched |
