# Design — add-diff-scoped-strictness

## Context

The exit code has exactly one source, and it reads two aggregate fields:

**Evidence:** `packages/claims/src/checkReport.ts:137@5f88e21` — `export function exitCode(run: CheckRun): 0 | 1 {`

Everything it reads is derived in `summarize`, which means a scoping filter
applied before summarization changes the exit code without touching the
renderers, the verdicts, or the wire format. Consumers that need pass/fail are
already directed at the stable predicate rather than at verdict names:

**Evidence:** `packages/claims/src/checkReport.ts:239@5f88e21` — ` * - Consumers that only need pass/fail should read `failing`, which is stable`

Commit-range handling exists in the tree, but only under `oracle`, a separate
verb with its own argument surface; none of it is reachable from `check`.

## Decisions

### 1. Scope by document, not by cited path

**Chosen:** a result is in scope when the **markdown document containing the
anchor** is touched by the range.

**Alternatives considered:**

- **Scope by the anchor's cited path** (`claim.path` in the diff) — rejected as
  the default: it inverts the incentive, because changing a source file would
  pull every document citing it into the strict tier, and a refactor would fail
  on documents its author never opened. That is precisely the dynamic the
  kernel already warns about at `checkClaims.ts:165` (cited in `proposal.md`).
- **Union of both** — rejected for the same reason; the union is dominated by
  the cited-path term.

**Rationale:** the unit of authorship is the document. A contributor is
answerable for claims in a document they edited, and scoping should track
authorship rather than blast radius.

**Note:** Open question 2 in `proposal.md` argues against this decision from
the opposite direction — scoping by document gives contributors a reason not to
edit documents. The decision stands as the default, but it is the one most
likely to be revisited in Stage 3.

### 2. Scoping filters the failure count; it does not add a verdict

**Chosen:** every claim is checked and every result is rendered, exactly as
today. Scoping partitions results into in-scope and out-of-scope, and only the
former feeds `exitCode`.

**Alternatives considered:**

- **A new `Verdict` member such as `out-of-scope`** — rejected: growing the
  exported union is breaking (`checkReport.ts:236`, cited in `proposal.md`),
  and the precedent has already been paid for once — `add-rules-compliance`
  gives rules verdicts their own union for this reason.
- **Skip out-of-scope documents entirely** — rejected: not checking them makes
  the debt invisible, which is the failure this change is supposed to avoid.

**Rationale:** the scoping question is about which failures *count*, not about
what is *true* of an anchor. Encoding it as a verdict would confuse a property
of the run with a property of the citation.

### 3. An unresolvable range is a usage error, not a silent widening

**Chosen:** when the base cannot be resolved, `check` exits 2 with a message
naming the range it could not resolve. It neither falls back to advisory nor
escalates to repository-wide strict.

**Alternatives considered:**

- **Fail open (treat everything as out of scope)** — rejected. This is the
  `unverifiable-rev` shape: a gate that quietly stops gating while still
  reporting green. In that case failing open is right because a missing commit
  is not evidence about the author; here it is wrong, because the operator
  explicitly asked for a scoped gate and would be given an ungated run under
  the same flag.
- **Fail closed (treat everything as in scope)** — rejected: turns a shallow
  clone into a repository-wide red build, which is the exact day-one failure
  this change exists to prevent.

**Rationale:** the two silent options are wrong in opposite directions, which
is the signal that neither should be chosen. Exit 2 is already the CLI's
"cannot proceed" code, and a CI configuration error is something the operator
can fix — unlike the fork/shallow-clone cases the kernel legitimately fails
open on, which the contributor cannot.

### 4. A flag, not a config key

**Chosen:** a `check` flag. No `nullius.config.json` key.

**Rationale:** `nullius.config.json` is closed-key and older published kernels
reject unknown keys (`render.ts:81`, cited in `proposal.md`), so a config-borne
option would break CI on repositories running an older pinned checker — the
population least equipped to diagnose it. This is not hypothetical; the kit has
already made the mistake once and left the incident in its regression test:

**Evidence:** `packages/kit/src/init.test.ts:183@5f88e21` — `   * added the key. init briefly wrote `configVersion`, and every published`

A flag is inert to a kernel that does not know it only if the caller does not
pass it, which is under the Action's control via its version pin.

### 5. The out-of-scope failure count is published, not suppressed

**Chosen:** the human report, the JSON summary, and the maintainer card each
carry the out-of-scope failure count as a named number.

**Rationale:** this is the only mitigation on offer for the strongest objection
to the whole change — that the advisory tier becomes permanent and invisible.
Publishing the count does not repair the tier, but it gives the debt a
denominator, which is the same move the kernel already makes for dispatch
silence. Stated plainly because it is a mitigation, not a solution.

## Compatibility risks

**Risk:** the JSON report gains fields for the scope partition. A consumer
written against the current shape — including `add-maintainer-card`'s renderer,
if it lands first — reads a report whose `summary.failures` may no longer equal
the number of failures shown, because some are out of scope.

**Binds at:** `inter-service-skew`

**Skew path:** `@nullius-inverba/claims@<with scoping>` → the JSON document on stdout → `armanfatemi/nullius/action@v1` (a card renderer written before scoping existed)

**Symptom:** a card reporting a failure total that disagrees with the job's
exit code — the run passes while the card shows failures, with nothing naming
the discrepancy.

**Mitigation closes it because:** adding fields is explicitly non-breaking in
the report's own policy, so the fix is to make the *existing* fields keep their
current meaning: `summary.failures` continues to mean "failures that decide the
exit code", and the out-of-scope count arrives as a new sibling field. A
renderer that never learned about scoping then shows a total that still matches
the exit code, and simply omits the debt line.

**Evidence:** `packages/claims/src/checkReport.ts:239@5f88e21` — ` * - Consumers that only need pass/fail should read `failing`, which is stable`

## Open questions

Mirrored from `proposal.md`:

1. Whether publishing the out-of-scope count is enough to keep the advisory
   tier from becoming permanent, or whether a tightening ratchet is required.
2. Whether Decision 1 gives contributors an incentive not to edit documents,
   and whether that argues for cited-path scoping after all.
3. What a fork pull request without a fetched base should do, given Decision 3
   makes it a hard error.
