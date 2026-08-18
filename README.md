# nullius

**Epistemic discipline for agent systems — mechanically enforced.**

[![CI](https://github.com/armanfatemi/nullius/actions/workflows/ci.yml/badge.svg)](https://github.com/armanfatemi/nullius/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40nullius-inverba%2Fclaims)](https://www.npmjs.com/package/@nullius-inverba/claims)
[![license](https://img.shields.io/npm/l/%40nullius-inverba%2Fclaims)](LICENSE)

_Nullius in verba_ — "take nobody's word for it." An agent's claim about your
code is not knowledge, it is text. This repo turns that text into something a
machine can refuse.

> Young and under active development — the conventions here are in daily use
> by the pipeline they came from, and still moving. Issues and pushback
> welcome.

A document claims something about your code:

```markdown
**Evidence:** `k8s/base/settings/deployment.yaml:12` — `  replicas: 2`
```

The checker opens the file and re-verifies it. When the claim is wrong:

```
FABRICATED  design.md:15  src/app.ts:2
          ! text does not appear anywhere in src/app.ts
```

## Why

Agents state things about your codebase constantly — in plans, PR
descriptions, design docs: "nothing else consumes this event", "the helper
for X doesn't exist yet", "this enum is `@shareable`". Some of those claims
are wrong, and in multi-step, multi-agent development the wrongness is
invisible: every later step reasons from the recorded claim rather than the
code, and every reviewer — human or LLM — checks whether the _plan_ is good,
not whether its _premises_ are true. **A false premise that supports a
correct conclusion is invisible to every reviewer who agrees with the
conclusion.** We watched exactly that pass three review gates in the
pipeline this tool was extracted from — the incident is told in
[the spec](spec/evidence-anchors.md). The fix is not a smarter reviewer. It
is a citation convention (**Evidence Anchors**) plus a deterministic checker
that re-executes every citation, forever.

## Try it in ten seconds

```sh
npx @nullius-inverba/claims demo    # unscoped alias: npx evidence-anchors demo
```

This builds a sandbox doc plus a sandbox source file and checks one claim per
verdict class:

```
FABRICATED       design.md:16  src/app.ts:2
                 ! text does not appear anywhere in src/app.ts
COUNT-MISMATCH   design.md:24  grep -rn 'retry' src/ → 0
                 ! claimed 0, actual 1
UNSAFE           design.md:28  grep -rn 'x' src/ && rm -rf / → 0
                 ! not executed — contains forbidden token '&&'
UNKNOWN-MOMENT   design.md:33  binds at partial-composition
                 ! 'partial-composition' is not a binding moment; use one of: build-time, rollout-window, …
UNDELIVERED      design.md:38  security-review
                 ! declared and silent — no delivery entry for 'security-review'; did you mean 'secruity-review' (delivered)?
CANARY-PRESENT   design.md:4   registered canary
                 ! a registered canary is planted in this document (planted …) — run `canary clear` before approval, …
```

That `UNSAFE` line is the security model working: checked documents are
untrusted input, so absence searches run in a grep/rg-only sandbox and cited
paths are validated before any file is read.

## Where the value comes from

Mostly from a moment the checker never sees: **to write a citation that will
survive the checker, the agent has to open the file** — so fabrication dies
at authoring time, before any reviewer reads a word. This is not a prompt
trick. An instruction to "verify your claims" decays like every instruction;
what makes this one hold is that skipping it now produces a deterministic
`FABRICATED` verdict on the record instead of a private shortcut. The checker
is the ratchet; the authoring behavior is the product.

Verification has a sibling problem the checker cannot solve alone:
**coverage**. An agent can anchor three easy truths and leave the
load-bearing claim bare. Three layers handle it: `check` reports **anchor
density** — every document's anchor count against its length, with
zero-anchor documents listed by name — so a 900-line plan with no checkable
claims is visible at a glance (the checker never judges how many is enough;
it makes the number legible, and `--require-markers` sets the floor at one).
The [`[false-premise]` reviewer severity](plugin/reviewers/false-premise.md)
catches bare-prose claims the anchors missed. And [eager mode](#if-you-just-ask-the-agent-to-do-things)
retrofits documents that were never anchored at all.

Anchors attach to **anything a human approves**. Pick your workflow — each
section stands alone.

## If you use plan mode (Claude Code)

**You get:** plans verified _before you hit approve_. An ephemeral plan is
still a document making load-bearing claims, and the person skimming it for
thirty seconds before approving is the most exposed reviewer there is.

```
/plugin marketplace add armanfatemi/nullius
/plugin install nullius@nullius
```

The plugin's `ExitPlanMode` hook checks every plan's anchors automatically
(fail-open — it never breaks plan mode), its authoring skill makes the agent
write anchors in the first place, and `/ground` checks any file on demand.
Details: [plugin/](plugin/).

## If your agents write PR descriptions, or you run agent reviews

**You get:** "safe — nothing else reads this field" in a PR body becomes a
checkable claim, and your reviewer agents gain a `[false-premise]` severity —
flag an uncited load-bearing claim even when the conclusion it supports still
looks right.

```yaml
# .github/workflows/claims.yml
on: pull_request
permissions: { contents: read, pull-requests: write }
jobs:
  claims:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: armanfatemi/nullius/action@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Zero further config: `pr-body` defaults to true, so this already checks the
PR description itself — advisory-only (it comments; it never blocks until you
set `strict`). The paste-ready reviewer severity:
[plugin/reviewers/false-premise.md](plugin/reviewers/false-premise.md).

## If you run review gates, or fan out subagents

**You get:** silence made loud, twice over. Three states hide inside a
reviewer that returns nothing — _found something_, _found nothing_,
_nobody checked_ — and orchestration collapses all three into "no issue
reported". Two conventions pull them apart:

**[Attestation Ledger](spec/attestation-ledger.md)** — declare the review
dispatches a document claims happened, and every declared dispatch must
attest an outcome. Writing `None.` is a valid answer; writing nothing is a
failing `UNDELIVERED` verdict:

```markdown
**Ledger:** entry-review
**Expected:** `rule-audit`, `schema-review`, `security-review`
**Delivered:**
- `rule-audit` — 2 findings → `reviews/rule-audit.md`
- `schema-review` — None.
```

Plain `check` picks it up — same exit codes, same Action, same plan hook.

**[Canary](spec/canary.md)** — mutation testing for the review layer. Plant a
registered claim that is false by construction, run your review, and measure:

```sh
nullius canary plant docs/design.md   # probe state lives under .git/, not the tree
nullius canary verify review.txt      # CANARY-CAUGHT / CANARY-MISSED / CANARY-TAINTED
nullius canary clear                  # byte-identical restore
```

A review layer that misses the canary is measured dead instead of assumed
alive — and a `check` merge guard (`CANARY-PRESENT`) keeps probes out of
approved documents.

## If you have a spec or RFC culture (OpenSpec, spec-kit, ADRs)

**You get:** the full discipline. Fabricated premises die at authoring time —
to write the citation the agent must open the file, and opening the file is
what kills the fabrication — and CI becomes a permanent drift alarm for every
doc.

1. Paste the [authoring skill](plugin/skills/evidence-anchors/SKILL.md) into
   your agents' instructions — it is plain markdown and works in CLAUDE.md,
   AGENTS.md, or Cursor rules.
2. Check locally, from the repo root:
   ```sh
   npx @nullius-inverba/claims check "docs/rfcs/**/*.md"
   ```
3. Gate in CI: the Action above with `globs: "docs/rfcs/**/*.md"` and
   `require-markers: true` — a proposal with no anchors at all is not a pass.

Custom binding-moment vocabulary, drift window, and excludes live in
`nullius.config.json`: [packages/claims/](packages/claims/).

## If you just ask the agent to do things

**You get:** a retrofit lane — no doc culture required. Point a refute-first
audit at any existing document; the model hunts evidence in your code, and
the checker verifies whatever it proposes. The model proposes; the checker
disposes.

```sh
claude -p "$(npx @nullius-inverba/claims eager-prompt design.md)"
```

or `/anchor <doc>` with the plugin installed. REFUTED claims come back with
counter-evidence; SUPPORTED claims get proposed anchors — yours to adopt, and
adopting them is the entailment review; everything else moves to
"Open questions". Your PR descriptions are already covered by the Action
above.

## This README is checked by the tool

The claims below are live anchors — CI runs `nullius check` on this file with
`--require-markers`, so the green badge above attests this README's own
claims about the code. The default binding-moment vocabulary is defined here:

**Evidence:** `packages/claims/src/checkClaims.ts:16` — `export const DEFAULT_BINDING_MOMENTS = [`

Path traversal is rejected before any file is read:

**Evidence:** `packages/claims/src/pathSafety.ts:39` — `return { safe: false, reason: "path traversal ('..') is not allowed" };`

And the checker makes no network calls:

**Evidence:** `grep -rn --include='*.ts' 'node:https' packages/claims/src/` → 0 results

## What's here

| Piece                                             | What it is                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [Evidence Anchors spec](spec/evidence-anchors.md) | The authoring convention: load-bearing claims about existing code carry a re-verifiable citation                     |
| [Binding Moments spec](spec/binding-moments.md)   | The companion for compatibility risks: name _when_ the risk binds, from a closed per-project vocabulary              |
| [Attestation Ledger spec](spec/attestation-ledger.md) | Declared review dispatches must attest outcomes — reviewer silence is a failing verdict, not a blank             |
| [Canary spec](spec/canary.md)                     | Mutation testing for the review layer: plant a false premise, measure whether anything objects                       |
| [`@nullius-inverba/claims`](packages/claims/)     | The deterministic checker — CLI (`check` / `demo` / `eager-prompt`) + library. It opens files; it never asks a model |
| [GitHub Action](action/)                          | Advisory PR comments, `pr-body` mode, a hard gate when you opt in                                                    |
| [Claude Code plugin](plugin/)                     | Authoring skill, plan-approval hook, `/ground`, `/anchor`, and the `[false-premise]` reviewer block                  |
| `witness`                                         | Coming next — the retro kit ([why it's not out yet](packages/witness/README.md))                                     |

## Design principles

1. **Deterministic over model-judged.** No model certifies truth anywhere in
   the loop — the checker opens the file. A verdict you can re-run is a
   verdict you can trust in CI.
2. **Verdicts certify form, never entailment.** A real-but-selectively-quoted
   line passes; whether the evidence supports the decision stays with
   reviewers. Advertised limits are the credibility.
3. **Untrusted input.** Checked documents are PR-controlled content: path
   guard before any read, grep/rg-only command sandbox, no chaining or
   redirection.
4. **Closed vocabularies.** An invented binding moment fails loudly instead
   of sliding through as plausible prose.
5. **Advisory first, facts only.** Report-only in CI until the team trusts
   the verdicts — and no anchors on judgment calls; citation theater trains
   readers to skim.

## Roadmap

- **`witness`** — the retrospective kit: a bounded PR-evidence harvester plus
  the "bad witness" retro-agent conventions. Held back until its conventions
  have more real-world mileage.
- Open threads: [`init`](https://github.com/armanfatemi/nullius/issues/1),
  [`check --rev`](https://github.com/armanfatemi/nullius/issues/2),
  [embedded `--eager`](https://github.com/armanfatemi/nullius/issues/6).

## Names

The repo and the CLI bin are **nullius**, the first word of the motto the
Royal Society chose in the 1660s — coined for eminent men asserting things
fluently while rooms of other eminent men nodded. The npm scope
[`@nullius-inverba`](https://www.npmjs.com/org/nullius-inverba) takes the
whole of it; [`evidence-anchors`](https://www.npmjs.com/package/evidence-anchors)
is the same checker under the name of the thing it checks. Extracted from a working
agent pipeline, where it gates every proposal before any reviewer reads it.

## License

MIT © Arman Fatemi
