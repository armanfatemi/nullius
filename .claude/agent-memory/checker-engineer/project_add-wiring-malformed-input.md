---
name: add-wiring-malformed-input-prereview
description: add-wiring-malformed-input (malformed-hooks / unclosed-frontmatter) — pre-review 2026-08-25 through iteration 3, post-review of the branch diff clean with two concerns
metadata:
  type: project
---

Reviewed `openspec/changes/add-wiring-malformed-input/` three times at plan
stage and once post-review against `feat/add-wiring-malformed-input`
(2026-08-25). Adds `malformed-hooks` and `unclosed-frontmatter` to
`WiringVerdict`; both fail closed, `PASSING` untouched.

**Post-review outcome:** no blockers. Every pre-review item discharged —
`references` is not incremented on either path, the parse finding is emitted
once per artifact, and all six stamped anchors the change introduced verify
verbatim at reachable revs.

**Two concerns left for a human, still live if this code is revisited:**
- `wiringScan.ts:203-215` — correctness depends on `hookCommands` being
  hoisted into its own statement before `artifacts.push`. The `onParseFailure`
  closure writes a `let` that TS narrows to `null` at the read site, so the
  type system will not catch a future re-inline of the call into the object
  literal; the finding would silently vanish. No comment guards the ordering.
- `wiringScan.ts:162` — on an unclosed fence `front === null`, so `body =
  content` and `looseCandidates` scans the frontmatter block as prose. A
  declared reference written with backticks in that block surfaces as advisory
  `loose-reference` instead of hard `missing-path`. Pre-existing, but the
  design doc's "`loose` survives the fence path" reads as pure upside.

**Pre-existing tension worth watching (unchanged):** `wiring.ts` increments
`references` for `tokens`, but `cli.ts`'s `references === 0` message
enumerates only the five declared fields and omits tokens.

**How to apply:** if a follow-up touches this scan path, re-check the hoist at
`wiringScan.ts:204` first — it is the one line whose removal breaks the
feature without a type error.
