# Add witness recording — journal schema v0.2 and the hook-pack producer

## Why

`witness validate` ships with hand-written fixtures and nothing in the world
that emits journals — a validator without a producer. Worse, a journal written
by the agent being witnessed is exactly the object the witness spec distrusts:
text an agent wrote about work agents did. The trust upgrade comes from records
emitted by the **harness runtime** (hooks), which the agent cannot decline to
write.

Two blockers sit in the current code. The journal's record kinds are a closed
list, so the producer cannot add the record types it needs without a schema
revision:

**Evidence:** `packages/claims/src/witness.ts:83@3f40733` — `const KINDS = ["dispatch", "report", "verification", "reliance", "append"] as const;`

And there is no version field anywhere in the format, so any schema growth
would make old validators reject new journals with a cascade of `MALFORMED`
findings instead of one clear message. Versioning must land **before**
third-party journals exist.

## What Changes

- **Journal schema v0.2** (kernel): a `journal` header record carrying
  `version`, session metadata, and `origin` (`hooks` | `self-reported`); a new
  `mutation` kind so file edits update the per-path hash map without being
  recorded as verifications (they verify nothing); explicit
  `UNSUPPORTED-VERSION` handling for future versions. Headerless journals are
  read as v0.1.
- **`witness record`** (kit): a subcommand that takes a hook payload on stdin
  and appends the correct record under an append lock. All correlation logic
  is testable TypeScript; shipped hook files are one-line shims, following the
  existing convention that hooks resolve the CLI rather than embed logic:

  **Evidence:** `plugin/hooks/check-plan.sh:42@3f40733` — `runner="${NULLIUS_BIN:-npx -y @nullius-inverba/claims}"`

- **Claude Code hook pack** (kit + plugin): `PreToolUse` on the subagent tool →
  `dispatch`; `SubagentStop` → `report`, joined by the agent id that
  `PostToolUse` links to the dispatch; `PostToolUse` on `Edit`/`Write` →
  `mutation`; session end → synthesized `no-report` terminals for open
  dispatches. The crash case needs no new machinery — a dispatch with no
  terminal is already a failing finding:

  **Evidence:** `packages/claims/src/witness.ts:38@3f40733` — `| "no-terminal"`

- **Self-reported tier**: journals not emitted by hooks are stamped
  `origin: "self-reported"` and `witness validate` says so in its summary —
  internally consistent is not evidence of process, and the output must not
  let the two be confused.

## Impact

- Affected specs: `witness` (new capability spec in this change; extends
  `spec/witness-journal.md` to v0.2).
- Affected code: `packages/claims/src/witness.ts` (schema v0.2, validator),
  new kit package (`witness record`, hook shims), `plugin/hooks/`
  (new hook entries), `spec/witness-journal.md`, fixtures.
- Non-breaking for v0.1 journals (headerless = v0.1). The `JournalVerdict`
  union gains members — acceptable now precisely because no third-party
  producer exists yet; the same change after the hook pack ships would be
  breaking, which is why this lands first.
- External assumptions to verify during implementation, not assertable from
  this repo: which Claude Code versions include `tool_use_id` in
  `PreToolUse`/`PostToolUse` payloads; `SubagentStop` payload fields;
  `SessionStart` `source` values. `doctor` (see `add-init-doctor`) probes the
  installed harness rather than trusting documentation.

  **Settled during implementation, by probing 2.1.238** — and the correlation
  above is the revised version. Three assumptions in the original proposal were
  wrong: the subagent tool reports `tool_name: "Agent"` though matchers accept
  `Task`; `PostToolUse` on it fires at *launch* and returns an acknowledgement,
  not a result; and `SubagentStop` does carry a join key (`agent_id`) plus the
  subagent's final message, which is what makes it the terminal. Recordings are
  committed under `spec/fixtures/probes/claude-code/`, and the reasoning that
  had to change is in `design.md` Decision 1. This is the item that most
  justified probing over reading: had the launch acknowledgement been recorded
  as a report, every dispatch in every journal would have read `found`.
