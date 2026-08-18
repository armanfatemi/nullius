# Design — make-absence-loud

## Context

See proposal.md — Why. The two capabilities ship together because they answer
the two halves of one question — *did anything object?* The ledger makes the
**delivery** of objections checkable; the canary makes the **capacity** to
object measurable. Both inherit the repo's standing constraints: deterministic
(no model calls), checked documents are untrusted input, advisory-first
defaults, closed vocabularies fail loudly.

The reviewer layer the canary measures is already defined by the repo's own
conventions — bare-prose claims are explicitly the reviewer's jurisdiction,
not the checker's:

**Evidence:** `spec/evidence-anchors.md:202` — `the checker only sees claims written in the structured`

**Evidence:** `plugin/reviewers/false-premise.md:15` — `Report it even when the conclusion it supports still looks right`

## Goals / Non-Goals

Goals:

- Ledger verification runs inside ordinary `check` — nothing new to remember,
  nothing CI can forget to run — while activating only on an explicit opener,
  so no pre-existing document changes behavior.
- Canary probes are deterministic end to end: plant from templates plus
  lexical repo facts, verify by literal text scan, clear byte-exact.
- A false `CANARY-CAUGHT` must be structurally hard to produce — a probe that
  was tipped off reports itself invalid instead of reporting success.

Non-Goals:

- No "coordinator corrections" journal convention in this change.
- No paraphrase-robust canary matching — lexical only, and the limit is
  advertised, the same way absence anchors are search-scoped.
- No retro tooling (`witness` remains its own roadmap item).

## Deferred: the plugin session ledger

The originally drafted third piece — hooks recording subagent dispatches and
deliveries into an auto-checked session ledger — is deferred to its own
change, on review findings this draft could not answer inline:

- **Outcome integrity.** A stop-hook cannot deterministically classify a
  finished subagent's output as findings vs. clean pass; recording `None` on
  its behalf would be the tool fabricating the very attestation it exists to
  demand. The likely resolution — delivery entries that record a findings
  path to captured output instead of an outcome — changes the ledger grammar
  contract and should be specced deliberately.
- **Correlation and injection.** Matching a stop event to its dispatch under
  parallel fan-out needs a verified correlation key, and hook-recorded fields
  derive from agent-influenced text, so the ledger writer must sanitize
  against format injection (a subagent description containing a well-formed
  delivery line must not become one).
- **In-flight semantics.** A ledger checked mid-session reports every
  in-flight dispatch as undelivered; when a session ledger is *judged* needs
  its own rule.

Guidance recorded for that follow-up: visible artifacts belong in-tree under
`.nullius/` with per-session filenames and a hook-dropped `.gitignore`;
probe-style state stays under `.git/`; the two are never co-located.

## Decisions

1. **Ledger verification lives inside `check`, gated on the `**Ledger:**`
   opener.** A second subcommand is a second thing CI can silently not run,
   and routing through `check` gives the Action and the plan hook the new
   verdicts with no interface change. The opener is the entire activation
   rule because `**Expected:**`/`**Delivered:**` are everyday bug-report
   vocabulary while nobody bolds "Ledger:" by accident — and the Action runs
   the latest checker unpinned, so accidental activation would land in
   existing strict pipelines overnight. Inside an opened block, structural
   errors are `MALFORMED` (the house rule: a sloppy citation is the thing the
   checker exists to surface); outside one, nothing fires. Activated ledgers
   count as grounding markers for `--require-markers` and density.
2. **Verdict names: `UNDELIVERED` / `EMPTY-DELIVERY` / `UNDECLARED` /
   `UNKNOWN-REVIEWER`.** The symmetric UNDELIVERED/UNDECLARED pair
   self-teaches against the grammar's own keys (Expected/Delivered), and
   verdict strings are public API — renamed after release they become a
   breaking change, renamed now they are a find-and-replace in a draft.
   EMPTY-DELIVERY names the one reachable failure of the pinned grammar
   precisely. The essay-register prose lives in the detail line, where prose
   belongs (`! declared and silent — no delivery entry for 'security-review'`).
   UNDECLARED is not the existing `advisory` verdict because ADVISORY marks a
   *verified claim* worth a glance, while UNDECLARED states a structural
   ledger fact — and a named verdict stays greppable in CI:

**Evidence:** `packages/claims/src/checkClaims.ts:24` — `| "advisory"`

3. **The grammar is pinned, not described.** Inline-code names matched
   exactly with counted multiplicity; outcome is the literal `None`
   (period-optional — a literal that fails on punctuation is the most
   predictable first-try failure and the period carries no information) or
   findings text with an optional findings path that must exist and pass path
   safety. A near-match detail on `UNDELIVERED` converts the worst
   zero-config failure (typo'd name manufactures undeliverable silence) into
   a self-explaining one. The convention spec (task 1.1) leads with a
   canonical copy-paste block, because agents author by pattern-matching
   examples.
4. **The canary registry lives under `.git/`, outside the working tree.**
   Alternatives rejected: an in-document marker is visible to the reviewer
   under probe; a working-tree registry (`.nullius/canaries.json`) is a
   brighter flare than the marker it replaced — a false-premise reviewer is
   *required* to open repo files, and the `.gitignore` entry a tree-visible
   registry needs is itself a tell in the diff. Under `.git/` the registry is
   per-clone, never committed, and invisible to any gitignore-respecting
   tool. Consequence, advertised in the spec: the merge guard is
   local-plus-hook only — CI on another clone cannot detect an unregistered
   canary, and committing the registry to enable that would tip off PR
   reviewers anyway.
5. **Canary claims are reviewer-jurisdiction only** — bare-prose false claims
   or in-vocabulary-but-wrong binding moments, never a structured anchor. A
   fabricated anchor would be refuted by the checker in the same run, proving
   the checker works (already known) instead of probing the reviewer layer
   (the unknown). Templates exclude CI-caught moments, which the checker
   already treats as passing-with-advisory rather than silently:

**Evidence:** `spec/binding-moments.md:35` — `The checker enforces a soft version of this: a risk whose moment is in the`

6. **Plant generation is templates + lexically harvested facts** (a real
   file, a real symbol, a false relation between them), keeping the
   no-model-calls guarantee. If the resulting canaries prove too recognizable
   in practice, that is a finding to record, not a reason to reach for an
   LLM. One active canary per repository keeps verify unambiguous.
7. **`CANARY-PRESENT` needs a document-level result channel.** The pipeline
   is strictly per-claim today, and documents that parse to zero claims are
   skipped before checking — exactly where a bare-prose canary lives:

**Evidence:** `packages/claims/src/cli.ts:256` — `if (results.length === 0) {`

   The guard therefore emits a synthetic document-level result that flows
   through the existing reporting and exit-code paths, and the zero-claim
   skip consults the registry before skipping.
8. **Verify is three-valued, and taint wins.** `CANARY-TAINTED` fires on
   probe-machinery tokens (registry path or filename, `CANARY-` verdict
   strings) in the review output, and is tested before `CANARY-CAUGHT` — a
   tipped-off reviewer citing the canary must not read as a healthy one. A
   false CAUGHT is the confidence-laundering failure this whole capability
   exists to prevent, so the failure mode is designed against, not just
   documented. `--probing` on `check` and `canary status` are the probe
   runner's primitives: suppression for the one actor who knows a probe is
   live, and a scriptable gate for everyone else.

## Risks / Trade-offs

- [A probed reviewer autonomously runs unsuppressed `check` and sees
  `CANARY-PRESENT`] → the taint scan catches machinery tokens that leak into
  its output, converting the false-confidence outcome into an invalid-probe
  outcome; the residual (a tipped-off reviewer that never echoes the
  machinery) is advertised in the spec.
- [Ledger boilerplate fatigue — teams declare fewer reviewers to stay green]
  → advisory-first rollout, and the ledger binds only reviewers you chose to
  declare.
- [Infrastructure failure and dead reviewer both surface as `UNDELIVERED`] →
  intentional: the verdict names *non-delivery*, the observable fact.
  Distinguishing dead, silent, and withheld requires orchestrator
  cooperation and is part of the deferred session-ledger work.
- [Canary templates become a recognizable genre to frontier reviewers] →
  rotate templates, generate from repo-local facts, and treat detectability
  as a measured property to revisit.
- [Strict-mode Action users get new failing verdict classes without pinning,
  because the Action runs the latest checker] → opener-gating and
  registry-locality make the real blast radius near zero (a repo with no
  `**Ledger:**` lines and no local registry sees no new verdicts); called
  out in the release notes regardless.
- [A `nullius.config.json` carrying the new `reviewers` key hard-fails on
  older pinned checkers, which reject unknown keys] → one line in the
  release notes; the Action's unpinned default is unaffected:

**Evidence:** `packages/claims/src/config.ts:45` — `if (!KNOWN_KEYS.has(key)) {`

## Migration Plan

Additive and severable. Documents with no `**Ledger:**` opener and clones
with no registry check exactly as before — no existing verdict, exit code, or
config key changes meaning. Rollback is deleting the ledger block or running
`canary clear`; no data migrates. Release notes carry the two compatibility
notes above.

## Open Questions

- Whether the Action's comment headline (currently picked by failure class on
  a verbatim code-block report) should distinguish "unverified claims" from
  "declared review never delivered" — cosmetic, defaults to the current
  headline.
- How `demo` groups its output once three capabilities contribute verdict
  classes — presentation only.
