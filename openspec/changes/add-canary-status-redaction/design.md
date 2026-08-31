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
- **Redact in `canary verify`'s CAUGHT/MISSED messages too** — this bullet
  originally deferred that to Non-goals on the grounds that `verify` is
  exclusively a coordinator action. **Superseded by Decision 3**, which found
  that reasoning to be a convention mistaken for a guard. `verify` is in scope.

**Rationale:** The fix removes exactly the information a reviewer would need to
fake detection, and nothing else. Note that this decision was drafted when
`status` was believed to be the only leaking surface; Decisions 2, 3 and 4 are
the record of that belief being wrong three times in succession. What survives
from it is the shape of the fix — redact the location, keep the command and its
exit codes — not its claim about scope.

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

### 3. The boundary is reachability, not convention — so `verify` is in scope too

**Rewritten at refinement iteration 2.** Iteration 1's version of this section
argued that `canary verify` could stay unredacted because it "is invoked only by
the coordinator, at Stage 2 Step 5, after the review has already been written
and scored," and that "there is no ordering in which a reviewer's report could
benefit from reading it."

**That argument was wrong, and it is recorded here rather than quietly deleted
because the way it was wrong is the point.** It described a convention in a
skill document as though it were a guard in code. Nothing sequences `verify`.
The handler reads the registry, prints the location on both outcomes, and never
clears the entry:

**Evidence:** `packages/claims/src/cli.ts:1322@3f64b6e` — ``        console.log(`CANARY-CAUGHT — the review flagged ${entry.doc}:${entry.line}`);``

**Evidence:** `packages/claims/src/cli.ts:1326@3f64b6e` — `          `CANARY-MISSED — nothing in the review references ${entry.doc}:${entry.line} or the planted claim`,`

It takes a report-file operand and nothing else, so a reviewer can write one
line to a scratch file, run `verify` on it, and be handed the plant's document
and line. The score it costs them is a `MISSED` against a file that was never a
review.

**Chosen boundary: a command is in scope if a reviewer can reach the location
through it.** By that test all four surfaces are in scope — `status`, both of
`check`'s warnings, `check`'s `CANARY-PRESENT` guard row (Decision 4), and
`verify`'s two messages. The redaction is applied uniformly rather than
per-command, so the next renderer of a registry entry does not silently
reintroduce the leak.

**What this boundary does not claim.** `.git/nullius/canaries.json` stays
readable by `cat`, as `proposal.md`'s Non-goals already conceded, so a
determined reviewer is not in the threat model and this change does not pretend
otherwise. What it removes is *incidental* exposure: the case where a reviewer
running the repository's own documented commands, as part of an ordinary review,
is handed the answer without having sought it. Both of this change's own
pre-review rounds produced exactly that case, which is the evidence the boundary
rests on.

### 4. The `CANARY-PRESENT` guard row carries the plant's line, and must stop

**Added at refinement iteration 2.** This is the shortest path of the four and
the one both pre-review rounds actually travelled. The guard result is built
with the plant's line as its source:

**Evidence:** `packages/claims/src/canary.ts:367@3f64b6e` — `    claim: { kind: "canary", source: { doc, line: entry.line } },`

which `check` renders as an ordinary result row naming the document and the
exact line.

**The redaction must happen here, at construction, not at rendering.** The same
`source` field feeds `--format json`, so a fix applied only to the human
formatter would leave `check --format json` reporting the location — the same
whack-a-mole this change has already played three times.

**Chosen:** `canaryGuardResult` stops putting `entry.line` into `source.line`
and uses `0`, meaning *document-level, no specific line*. There is no existing
`line: 0` convention in the package and nothing validates `line > 0` — both
checked — so this introduces the sentinel rather than borrowing one, and it is
called out here for that reason rather than left as an implementation detail.

**Why the guard loses nothing it needs.** Its own remedy is `canary clear`,
which takes no argument and needs no line number:

**Evidence:** `packages/claims/src/canary.ts:369@3f64b6e`

```ts
    detail: `a registered canary is planted in this document (planted ${entry.plantedAt}) — run \`canary clear\` before approval, or \`check --probing\` during a probe`,
```

The document stays named — it is the document the reader just asked `check` to
read, and it heads the group the row prints under, so suppressing it would cost
the guard its legibility while hiding nothing.

**Alternatives considered:**

- **Suppress the row entirely when a canary is present.** Rejected: `check`
  would then fail with no stated reason, which is worse than a located warning.
- **Redact in the human formatter only.** Rejected: `--format json` carries the
  same `source`, and a JSON consumer is exactly the sort of reader that would
  quietly keep working while the guarantee stopped holding.
- **Use `line: 1`.** Rejected as actively misleading — it points at real content
  in the document, which the sentinel is meant not to do.

## Open questions

None beyond the two named in `proposal.md`'s Non-goals (registry-file direct
read; `review-evidence.md` history), which are scoping decisions for
separate follow-up work, not open questions about this proposal's own
approach.
