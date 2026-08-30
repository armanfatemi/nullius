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

**Every consumer of this command in this repository, re-checked at pre-review
and cited as stamped anchors.** The first draft of this section named all three
sites as bare parentheticals, and all three had drifted to the wrong line by the
time it was reviewed — the grounding gate cannot check a parenthetical, so the
drift was silent. They are anchors now for that reason, not for tidiness.

CI's dogfood gate calls `canary status` as the last command of its step:

**Evidence:** `.github/workflows/ci.yml:200@3f64b6e` — `          node packages/claims/dist/cli.js canary status`

Its **exit code** is load-bearing, not merely its not-erroring: it is the last
command of a step that runs under `set -euo pipefail` (`.github/workflows/ci.yml:189`,
one of three such lines in the file, so not anchored here — the distinctive
claim is the step it belongs to):

**Evidence:** `.github/workflows/ci.yml:187@3f64b6e` — `      - name: nullius canary (self)`

The step passes because `canary clear` runs immediately before it, putting that
call on the absence branch this change does not touch:

**Evidence:** `.github/workflows/ci.yml:199@3f64b6e` — `          node packages/claims/dist/cli.js canary clear`

`SKILL.md`'s Stage 8 Step 1 matches the exact phrase `no active canary` — again
the unaffected branch:

**Evidence:** `.claude/skills/proposal-to-pr/SKILL.md:1000@3f64b6e` — `node packages/claims/dist/cli.js canary status    # must print "no active canary"`

`SKILL.md`'s Resume semantics reads only the exit code:

**Evidence:** `.claude/skills/proposal-to-pr/SKILL.md:1234@3f64b6e` — ``(`canary status` exits 1), clear it before running any `check`.``

No consumer parses the location text out of `canary status`'s stdout. That is a
narrower statement than the one this section made in its first draft — "no
consumer reads the location" — which was false in a way that mattered: `check`
prints the plant's document itself, on its own initiative, and Decision 2 below
is the consequence.

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

### 2. Redact the plant's document from `check`'s two canary warnings as well

**Added at refinement iteration 1**, after pre-review established that
redacting `status` alone leaves the observed vector open. `check` prints the
plant's document on its own initiative, in two branches. The first also names
the redacted command as its remedy:

**Evidence:** `packages/claims/src/cli.ts:1107@3f64b6e`

```ts
        `warning: the registered canary points at a document outside the matched set (${activeCanary.doc}) — not read; run \`canary status\``,
```

**Evidence:** `packages/claims/src/cli.ts:1111@3f64b6e`

```ts
        `warning: the registered canary is no longer present in ${activeCanary.doc} — stale registry; delete .git/nullius/canaries.json after restoring the document`,
```

**Why this is not scope creep.** The first branch fires when the registered
canary's document is *outside* the matched set — which is what happens when a
reviewer runs this repository's other documented gate,
`check 'README.md' 'spec/**/*.md'`, while a canary sits in a proposal. The
reviewer is then handed the plant's document path unprompted, and told to run
`canary status` for more. Shipping the `status` redaction alone would leave a
reviewer a shorter path to the answer than the one being closed, while the
change reported that it had closed it.

**Chosen:** both branches drop `${activeCanary.doc}`, and the first branch's
`run \`canary status\`` remedy is removed, since after Decision 1 that command
can no longer answer the question the warning raises. The warnings keep their
diagnostic purpose — something is registered, and it is in an unexpected state —
without naming where.

**Alternatives considered:**

- **Fix only the broken remedy string, leave the document path.** Rejected: the
  document path *is* the leak; the remedy string is only how a reviewer learns
  there is more to fetch.
- **Suppress the warnings entirely when a canary is active.** Rejected — it
  trades a leak for a silence, and the stale-registry warning is the only signal
  a human gets that the registry has desynchronized from the tree.

**`canary verify` remains unredacted, and this is now a two-against-one split
rather than a one-against-one**, so it needs the stronger argument
`proposal.md`'s Non-goals gave it: `verify` is invoked only by the coordinator,
at Stage 2 Step 5, *after* the review has already been written and scored. There
is no ordering in which a reviewer's report could benefit from reading it.
`status` and `check` are both commands a reviewer runs *during* the review.
The split is on when the command runs, not on how secret its output is.

## Open questions

None beyond the two named in `proposal.md`'s Non-goals (registry-file direct
read; `review-evidence.md` history), which are scoping decisions for
separate follow-up work, not open questions about this proposal's own
approach.
