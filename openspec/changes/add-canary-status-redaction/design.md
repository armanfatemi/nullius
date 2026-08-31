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
  probe** — rejected. `status` has a documented scriptable role, and the
  redacted message still fills it:

  **Evidence:** `spec/canary.md:26@df9a0cb` — `nullius canary status                 # scriptable guard: exit 1 while planted`

  **Evidence:** `spec/canary.md:93@df9a0cb` — ``plan-approval hook stay loud. `canary status` is the scriptable form for``

  Removing the command would regress a real, unrelated use case to fix a
  probe-specific concern. (An earlier draft of this bullet cited
  `.nullius/README.md` for this, which mentions the canary nowhere — a false
  citation that survived three review rounds because it sat inside an
  alternative that was rejected anyway. Corrected at iteration 3.)
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
through it.**

**The boundary was stated at iteration 2 and then applied by hand, which is why
it did not hold.** Iteration 2 applied it to the surfaces already known and
declared the change complete at four. Iteration 3's review found two more —
`canary clear`, which takes no operand and is therefore the shortest path of
all, and `clearCanary`'s refusal message. Six surfaces, found at a rate of about
two per review round, by a process that had no way to know when it was done.

That is the actual defect, and Decision 5 is the response: stop enumerating call
sites and route every render of a `CanaryEntry` through one accessor, so the
boundary is enforced by construction rather than by whoever remembers to apply
it.

**What this boundary does not claim.** `.git/nullius/canaries.json` stays
readable by `cat`, as `proposal.md`'s Non-goals already conceded, so a
determined reviewer is not in the threat model and this change does not pretend
otherwise. What it removes is *incidental* exposure: the case where a reviewer
running the repository's own documented commands, as part of an ordinary review,
is handed the answer without having sought it. Both of this change's own
pre-review rounds produced exactly that case, which is the evidence the boundary
rests on.

### 4. The `CANARY-PRESENT` guard row is deferred to a follow-up change

**Rewritten at refinement iteration 3.** Iteration 2's version of this decision
redacted the guard row here, by changing `canaryGuardResult` to emit a
`line: 0` sentinel. That is withdrawn, and the guard row is now an explicit
non-goal of this change.

The guard row differs in kind from the other five surfaces. They are message
strings, with no consumer contract. The guard row leaks through a structured
field that reaches the published JSON schema:

**Evidence:** `packages/claims/src/checkReport.ts:270@df9a0cb` — `    source: { doc: source.doc, line: source.line },`

`CheckReport`'s v1 compatibility policy covers adding and removing fields; a
change to an existing field's *value semantics* is outside it, and a consumer
computing `lines[line - 1]` from a `0` would index `-1`. The correct fix is an
additive field marking the result document-level, which renderers honour — not
a sentinel overloading `line`. That is a published-schema decision and belongs
with a reviewer whose remit is the kernel's contracts.

**This change therefore ships with a known, measured leak still open, and says
so rather than dressing it up.** An earlier draft of this section argued the
guard row was "the least informative of the six," on the reasoning that it only
adds a line to a document the reader already knows. That is false under the gate
`CLAUDE.md` documents: `check 'openspec/**/*.md'` matches many documents, and the
row names which one carries the plant as well as the line. This change's own
evidence file records it happening — the row appeared as
`CANARY-PRESENT openspec/changes/add-canary-status-redaction/design.md:6` under
a folder glob, and it is how a reviewer reached the plant during iteration 2.

So the honest statement is: the guard row is the shortest measured path, it
stays open after this change, and the reason is that closing it correctly is a
published-schema change rather than a message edit. Not that it does not matter.

The remaining argument for splitting is unaffected by any of that: deferring
removes this change's only breaking edit. `canaryGuardResult` keeps its current
behaviour, so the existing assertion at
`packages/claims/src/canary.test.ts:296-306` — which pins that result's source
line, and which iteration 3's review flagged as unaccounted for — is left
untouched rather than needing a coordinated update.

### 5. One redacting accessor, not six edits

**Added at refinement iteration 3**, and it is the substance of this change.

Every place that renders a `CanaryEntry` for human consumption goes through a
single accessor that returns the redacted form. The five in-scope surfaces call
it; nothing else formats an entry by hand.

The five, all message strings:

**Evidence:** `packages/claims/src/cli.ts:1348@df9a0cb` — ``    console.log(`cleared ${entry.doc}:${entry.line}`);``

**Evidence:** `packages/claims/src/canary.ts:344@df9a0cb`

```ts
      `the registered line no longer carries the planted claim (${entry.doc}:${entry.line}) — clear refused; restore the line or remove it by hand, then delete the registry`,
```

together with `canary status`'s presence branch (Decision 1), `check`'s two
warnings (Decision 2), and `verify`'s CAUGHT/MISSED messages (Decision 3).

**A seventh site, found at iteration 4, and why it was missed.** `plant` refuses
when a canary is already registered, and names the existing one:

**Evidence:** `packages/claims/src/canary.ts:276@3b547b4` — ``      `an active canary is already registered (${active.doc}:${active.line}) — run \`canary status\` or \`canary clear\` first`,``

A reviewer reaches this by running `canary plant` against any file. It throws
before writing, so nothing records the attempt, and the message advertises two
of the commands this change redacts. It is a `throw` rather than a `console`
call, which is precisely why three rounds of grep-driven enumeration passed over
it.

**An eighth site, and a correction to the review that found it.**
`loadActiveCanary` warns when the registry entry's path is unsafe, naming it:

**Evidence:** `packages/claims/src/canary.ts:175@3b547b4` — ``      warning: `canary registry entry has an unsafe path and was ignored: ${entry.doc}`,``

iteration 4's review reported this site as unreachable through `plant` because
`canary.ts:283` rejects. That reasoning is wrong: line 283 validates the *new*
document's path, while this warning is rethrown eleven lines earlier —

**Evidence:** `packages/claims/src/canary.ts:273@3b547b4` — `  if (warning !== undefined) throw new Error(warning);`

— so `plant` does surface it. The conclusion survives for a different reason:
the warning only fires when the registry entry already holds an unsafe path,
which requires someone to have written that registry by hand, and anyone who can
write it can read it. It is routed through the accessor anyway, because "not
currently exploitable" is a weaker property than "cannot leak," and the whole
point of Decision 5 is to stop deciding this site by site.

**`canary plant` is the one exception, and it is explicit.** It prints the
location at the only moment the coordinator legitimately needs it, and
`SKILL.md` Stage 2 Step 3 instructs recording it then. Making the exception a
named argument to the accessor — rather than simply not calling it — is what
keeps `plant` from reading like a site somebody forgot.

**Rationale.** This change tried enumerating call sites three times and shipped
an incomplete set each time. The accessor converts "did the author remember
every site?" into "does this site format an entry?", which is a question a
reader can answer by looking at one function. It also means the seventh render
site, whenever it is written, is redacted by default rather than by diligence.

**Alternatives considered:**

- **Redact at the point the registry is loaded**, so no caller ever holds the
  location. Rejected: `clearCanary` needs `entry.line` to splice the planted
  line out of the document, and `verifyCanary` needs it to match reports. The
  data must remain available; only its *rendering* is the problem.
- **Keep enumerating, but add a test that greps the source for
  `entry.doc` outside the accessor.** Rejected as a worse version of the same
  idea — it enforces the rule from outside the code rather than making the
  wrong thing unavailable, and it would fail confusingly on legitimate uses like
  `clearCanary`'s splice.

## Open questions

None beyond the two named in `proposal.md`'s Non-goals (registry-file direct
read; `review-evidence.md` history), which are scoping decisions for
separate follow-up work, not open questions about this proposal's own
approach.
