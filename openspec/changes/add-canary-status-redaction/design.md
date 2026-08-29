# Design — add-canary-status-redaction

## Context

`canary status`'s current handler, in full:

**Evidence:** `packages/claims/src/cli.ts:1026@2792fa1` — `  if (sub === "status") {`

```ts
  if (sub === "status") {
    if (entry === null) {
      console.log("no active canary");
      return 0;
    }
    console.log(
      `active canary: ${entry.doc}:${entry.line} (planted ${entry.plantedAt})`,
    );
    return 1;
  }
```

This proposal only changes the second branch (`entry !== null`) — the
`"no active canary"` message and both exit codes are unchanged.

**Every consumer of this command in this repository was checked before
writing this proposal, not assumed:**

- CI's dogfood gate calls it with no output capture at all — the step's
  correctness depends only on `canary status` running without erroring as
  part of the plant/guard/probing/verify/clear round trip
  (`.github/workflows/ci.yml:180`).
- `SKILL.md`'s Stage 8 Step 1 checks the exact phrase `"no active canary"` —
  the unaffected branch (`.claude/skills/proposal-to-pr/SKILL.md:915`).
- `SKILL.md`'s Resume semantics checks only the exit code (`exits 1`) —
  (`.claude/skills/proposal-to-pr/SKILL.md:1139`).

No consumer reads the location text this proposal removes.

## Decisions

### 1. Redact location from the presence branch; leave everything else alone

**Chosen:**

```ts
console.log(`active canary (planted ${entry.plantedAt})`);
```

`entry.doc`/`entry.line` are dropped from the printed line. Exit code stays
`1`. The absence branch, exit codes, and every other `canary` subcommand are
untouched.

**Alternatives considered:**
- **Gate the full message behind a flag** (e.g. `canary status --reveal`,
  defaulting to redacted) — rejected as unnecessary complexity. No
  legitimate caller in this repository needs `status` to reveal the location
  at all: the coordinator already has it from `canary plant`'s own output at
  plant time (Stage 2 Step 3), and no other automation reads it. A flag that
  nothing in this repository ever passes is a flag that exists only as a
  reviewer-accessible bypass of the redaction — the opposite of the point.
- **Remove `canary status` entirely, replacing it with an exit-code-only
  probe** — rejected. Human operators legitimately run `status` to check
  environment state during manual debugging (per `.nullius/README.md`'s own
  documented workflow), and the redacted message still answers that
  question. Removing output entirely would regress a real, unrelated use
  case to fix a probe-specific concern.
- **Redact in `canary verify`'s CAUGHT/MISSED messages too**, closing that
  vector in the same change — considered and deferred to `proposal.md`'s
  Non-goals: `verify` is exclusively a coordinator action, no observed run
  used it as a leak, and bundling an unobserved fix with an observed one
  makes this change's justification weaker for the part that has evidence.

**Rationale:** The fix removes exactly the information a reviewer would need
to fake detection, and nothing else — it is scoped to the leak that was
actually observed being exploited (per `proposal.md`'s Problem section),
rather than a general "canary output should be secret" policy that would
also break the legitimate human-debugging use case `status` exists for.

## Open questions

None beyond the two named in `proposal.md`'s Non-goals (registry-file direct
read; `review-evidence.md` history), which are scoping decisions for
separate follow-up work, not open questions about this proposal's own
approach.
