# Make Absence Loud

## Why

nullius verifies what documents *assert* — anchors for facts, binding moments
for mechanisms. Before this change it had no vocabulary for what documents
*omit*: a review gate that silently died produced the same clean output as
one that found nothing, and every orchestration layer collapses "I checked
and found nothing" and "nobody checked" into the same blank. The verdict for
an expected-but-missing report now exists:

**Evidence:** `packages/claims/src/checkClaims.ts:45` — `| "undelivered"`

This change adds the missing half of the discipline. Absence becomes a
first-class, checkable fact (declared review dispatches must have delivered
outcomes — an explicit `None` is a valid answer; writing nothing is not),
and the liveness of the review layer itself becomes measurable instead of
assumed (mutation testing, aimed at reviewers instead of tests).

## What Changes

- New capability **attestation-ledger**: a checked document may declare
  expected review dispatches; the checker verifies every declared dispatch has
  a delivered outcome — findings or an explicit `None` — and reports failures
  as new check verdicts: `UNDELIVERED` (declared, no delivery entry),
  `EMPTY-DELIVERY` (an entry with no outcome), `UNKNOWN-REVIEWER` (a name
  outside a configured vocabulary), plus the passing `UNDECLARED` (delivered
  but never declared). Ledger checking activates only on an explicit
  `**Ledger:**` opener line, so no existing document changes behavior.
- New capability **canary**: `nullius canary plant | verify | clear | status`
  — plant a registered, plausibly-false claim in the class only the reviewer
  layer can catch; deterministically verify whether review output flagged it
  (outcomes `CANARY-CAUGHT`, `CANARY-MISSED`, or `CANARY-TAINTED` when probe
  machinery leaked into the review's own inputs). Probe state lives outside
  the working tree (under `.git/`), and a registry-based merge guard — the
  failing check verdict `CANARY-PRESENT`, suppressible with `check --probing`
  — keeps probes out of approved documents.
- `demo` gains one sandbox claim per new **check** verdict (the ledger
  verdicts and `CANARY-PRESENT`). Verify outcomes are subcommand outcomes,
  not check verdicts, and are documented in their own table.
- Deliberately **not** in this change: the Claude Code plugin's automatic
  session ledger (hook-recorded subagent dispatch/delivery counting). What a
  hook may truthfully attest about a subagent's outcome — without a model and
  without fabricating a `None` — is an open integrity question that deserves
  its own proposal; see design.md, Deferred. The plugin is untouched here.
- Nothing breaking: both capabilities are additive and severable, in the same
  sense Binding Moments are — a document with no ledger opener and a repo
  with no registered canary check exactly as before.

## Capabilities

### New Capabilities

- `attestation-ledger`: declared review dispatches and delivered outcomes as
  checkable facts inside any checked document; silence as failing verdicts.
- `canary`: planting, verifying, and clearing registered false-premise probes
  that measure whether the review layer can still catch anything.

### Modified Capabilities

None — this is the repository's first OpenSpec change; `openspec/specs/` is
empty.

## Impact

- `packages/claims`: parser and checker extensions, a new `canary`
  subcommand alongside `check` / `demo` / `eager-prompt`, and a `--probing`
  flag on `check`:

**Evidence:** `packages/claims/src/cli.ts:50` — `canary plant <doc>  insert a registered, plausibly-false claim (probe state`

- `spec/`: two new convention documents (`attestation-ledger.md`,
  `canary.md`); the verdict table in the Evidence Anchors spec gains the new
  check verdicts.
- `action/`: no interface change — the Action pipes the checker's report
  through verbatim, so new verdicts appear without parsing changes:

**Evidence:** `action/action.yml:76` — `docs_output=$(npx -y @nullius-inverba/claims check $GLOBS "${args[@]}" 2>&1)`

- `plugin/`: untouched in this change (session ledger deferred; the
  evidence-anchors authoring skill gains a ledger section as documentation
  only).
- No new runtime dependencies, and no model calls anywhere in the loop
  (README design principle 1).
