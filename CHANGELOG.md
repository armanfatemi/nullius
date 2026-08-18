# Changelog

## 0.5.0 — Make Absence Loud

Two new capabilities, both additive and severable — a document with no
ledger opener and a clone with no canary registry check exactly as before.

### Attestation Ledger ([spec](spec/attestation-ledger.md))

Declared review dispatches become checkable facts: every name under
`**Expected:**` must have a `**Delivered:**` entry attesting findings or the
literal `None`. New check verdicts: `UNDELIVERED`, `EMPTY-DELIVERY`,
`UNKNOWN-REVIEWER` (failing) and `UNDECLARED` (passing). Activation is gated
solely on the `**Ledger:**` opener line. Optional closed `reviewers`
vocabulary in `nullius.config.json`. Typo'd names get a near-match hint in
the verdict detail.

### Canary ([spec](spec/canary.md))

Mutation testing for the review layer: `nullius canary plant` inserts a
registered claim that is false by construction (a real symbol asserted into
a real file that verifiably lacks it), `verify` deterministically scores the
review output — `CANARY-CAUGHT` (exit 0), `CANARY-MISSED` (exit 1),
`CANARY-TAINTED` (exit 3, probe machinery leaked into the review), taint
tested before caught — and `clear` restores the document byte-identically.
Probe state lives under `.git/nullius/`, outside the working tree. While a
canary is registered, `check` fails the planted document with
`CANARY-PRESENT` (suppress with `--probing`); `canary status` is the
scriptable guard.

### Also

- `demo` now covers every check verdict class, grouped by capability.
- The report's verdict column widened to fit the new names.

### Compatibility notes

- **Strict-mode Action users:** the Action runs the latest checker unpinned
  (`npx -y`), so the new failing verdict classes arrive without a version
  bump on your side. Blast radius is near zero — a repo with no `**Ledger:**`
  lines and no local canary registry sees no new verdicts — but if you carry
  documents with ledger-shaped content behind a `**Ledger:**` opener, they
  are now checked.
- **`reviewers` config key:** older checkers reject unknown config keys, so
  a `nullius.config.json` carrying `reviewers` hard-fails on a pinned
  pre-0.5.0 install (`NULLIUS_BIN`). Upgrade the pin before adopting the key.

## 0.4.0

Evidence Anchors: spec, deterministic checker, GitHub Action, Claude Code
plugin. See the [README](README.md).
