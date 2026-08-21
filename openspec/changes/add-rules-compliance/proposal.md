# Add rules compliance — rules as checkable objects

## Why

Rule files today are ambient text: loaded whole into every session, present
but unconsulted, competing with survey results for attention — and a plan
touches no code, so edit-time rule loading never fires for the artifact where
violations are cheapest to catch. Presence is not a check. The fix follows the
house pattern: make rules objects a machine can select, hold a plan against,
and refuse — with the model only ever proposing, never verifying.

Rules also rot. A "never do X" whose motivating incident has been refactored
away is folklore with a severity label. The repo already has the machinery to
say so: an anchor into the incident, re-verified forever.

## What Changes

- **Rule headers** (kernel): rule files gain a strict flat frontmatter —
  `id`, `applies_to` globs, `severity`, and an Evidence Anchor to the
  motivating incident. Parsing follows the config module's strictness (closed
  keys, unknown keys rejected):

  **Evidence:** `packages/claims/src/config.ts:41@3f40733` — `const KNOWN_KEYS = new Set([`

  New advisory verdicts: `UNGROUNDED-RULE` (no incident anchor — folklore,
  flagged not failed) and `RULE-ROT` (the incident anchor no longer verifies
  against the working tree). Rules verdicts get their **own union** — the
  kernel's exported `Verdict` union is public API whose growth is breaking,
  a lesson already paid for:

  **Evidence:** `CHANGELOG.md:139@3f40733` — ``command string, and the `Verdict` union gained members.``

- **`rules select --paths <globs>`** (kernel): deterministic, no model — emit
  exactly the rules whose `applies_to` matches what the plan touches. The
  anti-crowding half: a session gets the rules that bind, not the rulebook.
- **`/comply`** (kit + plugin): one rule per starved subagent, following the
  audit brief discipline — the brief carries the rule text and the plan's
  touch-list, no siblings, no narrative; brief emission reuses the existing
  builder pattern:

  **Evidence:** `packages/claims/src/audit.ts:127@3f40733` — `export function buildAuditBrief(`

  Verdicts are `COMPLIANT` / `VIOLATION` / `NOT-APPLICABLE`; a `VIOLATION`
  must come back as an anchor into the plan, which `check` re-verifies — no
  model in the verification path. The agent quotes the rule id back
  (a deterministic read-receipt: the rule reached the reviewer; it was not
  audited from memory).
- **`SILENT-RULE`** (kernel, sequenced last): every rule id emitted by
  `select` must reach a delivered verdict, or the run fails. This is
  invariant 1 wearing a different hat, and it is a **journal query** — it
  lands only after `add-witness-recording` puts rule dispatches on the record.
  It is issue #8's ledger with the closed vocabulary that issue's design
  question was missing: the expected-reviewer list is exactly `select`'s
  output.

## Impact

- Affected specs: `rules` (new).
- Affected code: kernel (`rules` module: header parser, select, new verdict
  union), kit/plugin (`/comply` command), docs.
- Subsumes the `/rule-audit` half of issue #11; gives issue #8 its closed
  vocabulary. The `/advocate` half of #11 stays deferred with the run
  sequencer (see project.md deferred ledger).
- Dependency: `SILENT-RULE` requires witness recording; everything else in
  this change stands alone.
