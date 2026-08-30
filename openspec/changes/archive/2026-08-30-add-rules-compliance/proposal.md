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

- **Rule headers** (kernel): every rule file in `.claude/rules/` already
  carries a flat frontmatter — `id`, `applies_to` globs, `severity` — and, by
  convention, an Evidence Anchor to the motivating incident in the body. This
  bullet is not about adding that shape; it is about the kernel gaining code
  that reads it, since nothing parses it today:

  **Evidence:** `.claude/rules/build-before-cli.md:2@d83ad69` — `id: build-before-cli`

  Parsing follows the config module's strictness (closed keys, unknown keys
  rejected):

  **Evidence:** `packages/claims/src/config.ts:41@3f40733` — `const KNOWN_KEYS = new Set([`

  New advisory verdicts: `ungrounded-rule` (no incident anchor — folklore,
  flagged not failed) and `rule-rot` (the incident anchor no longer verifies
  against the working tree; the trigger is the kernel's own `isFailure`,
  never a bare "not ok" check — see design.md Decision 3 for why that
  distinction is load-bearing). Rules verdicts get their **own union**, led
  by `ok` like every sibling union — the kernel's exported `Verdict` union is
  public API whose growth is breaking, a lesson already paid for:

  **Evidence:** `CHANGELOG.md:139@3f40733` — ``command string, and the `Verdict` union gained members.``

- **`rules select --paths <globs>`** (kernel): deterministic, no model — emit
  exactly the rules whose `applies_to` matches what the plan touches. The
  anti-crowding half: a session gets the rules that bind, not the rulebook.
- **`/comply`** (kit + plugin): one rule per starved subagent, following the
  audit brief discipline — the brief carries the rule text and the plan's
  touch-list, no siblings, no narrative; brief emission reuses the existing
  builder pattern:

  **Evidence:** `packages/claims/src/audit.ts:127@3f40733` — `export function buildAuditBrief(`

  Verdicts are `COMPLIANT` / `VIOLATION` / `NOT-APPLICABLE`; both `COMPLIANT`
  and `VIOLATION` must come back as an anchor into the plan, which `check`
  re-verifies — a `COMPLIANT` trusted on the agent's word alone would leave a
  model in the verification path for the passing case, which is exactly the
  gap this proposal exists to close everywhere else. Only `NOT-APPLICABLE`
  is unanchored, since it asserts nothing in the plan for the rule to bind
  to. The agent quotes the rule id back (a deterministic read-receipt: the
  rule reached the reviewer; it was not audited from memory).

  `/comply`'s job is not new in kind: the `rule-auditor` subagent already
  reads every rule's frontmatter and matches `applies_to` against in-scope
  files, dispatched from `proposal-to-pr` Stage 2/6 today. What's missing is
  that a model does the glob-matching. `routeAgents` already names this gap
  in its own comment:

  **Evidence:** `packages/kit/src/pipeline.ts:141@d83ad69` — ``matching its `applies_to` globs, and that is `rules select`'s job in the``

- **`routeAgents` pre-filter** (kit): once `rules select` exists,
  `packages/kit/src/pipeline.ts`'s `routeAgents` calls it to pre-filter which
  rules are in scope before `rule-auditor` is dispatched, per the same
  comment:

  **Evidence:** `packages/kit/src/pipeline.ts:144@d83ad69` — `` `rules select` lands, this row can pre-filter instead.``

  Without this, the change ships a deterministic selector whose one real
  consumer keeps doing selection by agent judgement — the exact gap this
  change exists to close, left open at its only call site.
- **`SILENT-RULE`** (kernel, sequenced last): every rule id emitted by
  `select` must reach a delivered verdict, or the run fails. This is
  invariant 1 wearing a different hat, and it is a **journal query**.
  `add-witness-recording` has already landed
  (`openspec/changes/archive/2026-08-21-add-witness-recording`), so rule
  dispatches can go on the record now — this section is unstarted, not
  blocked. It is issue #8's ledger with the closed vocabulary that issue's
  design question was missing: the expected-reviewer list is exactly
  `select`'s output.

## Impact

- Affected specs: `rules` (new).
- Affected code: kernel (`rules` module: header parser, select, new verdict
  union), kit/plugin (`/comply` command, `routeAgents` pre-filter), docs.
- Subsumes the `/rule-audit` half of issue #11; gives issue #8 its closed
  vocabulary. The `/advocate` half of #11 stays deferred with the run
  sequencer (see project.md deferred ledger).
- Dependency: none. `add-witness-recording` — the one thing `SILENT-RULE`
  needed — already landed (`openspec/changes/archive/2026-08-21-add-witness-recording`).
  Nothing in this change is blocked on an unmerged prerequisite; Section 3 is
  simply unstarted work, not gated work.
