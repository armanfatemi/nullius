# Canary

**Version 0.1 — draft.** Mutation testing for the review layer, checked and
driven by [`@nullius-inverba/claims`](../packages/claims/). Companion to
[Evidence Anchors](./evidence-anchors.md) (which keeps claims honest) and the
[Attestation Ledger](./attestation-ledger.md) (which keeps report *delivery*
honest) — this one measures whether the reviewers behind those reports can
still catch anything.

## The problem this solves

A review pipeline fails in a way a green run conceals: the reviewer that
would have objected is dead — misconfigured, starved of its inputs, silently
erroring — and from the outside its silence is indistinguishable from
"nothing to report." Mutation testing answered this for test suites: plant a
known bug, and a suite that stays green is *measured* dead instead of assumed
alive. Same move, one layer up.

## The probe

```sh
nullius canary plant docs/design.md   # insert one registered false claim
# ... run your review of docs/design.md ...
nullius canary verify review.txt      # did the review flag it?
nullius canary clear                  # restore the document exactly
nullius canary status                 # scriptable guard: exit 1 while planted
```

**The planted claim is false by construction.** Plant harvests a real symbol
from a real source file and asserts it also lives in another real file that
verifiably lacks it — checked at plant time, no model anywhere:

```markdown
Note that `MAX_RETRIES` is also defined in `src/extra.ts`, so the two definitions must stay in sync.
```

A diligent reviewer refutes this with one grep. That is the point: the claim
sits in exactly the jurisdiction of the
[`[false-premise]` reviewer pass](../plugin/reviewers/false-premise.md) —
bare prose, contradicted by the code, invisible to anchor verification
because it carries no anchor. A fabricated `**Evidence:**` line would be
caught by the deterministic checker in the same run, which would prove the
checker works (already known) instead of probing the reviewer layer (the
unknown).

## Probe state lives outside the working tree

The registry is written under `.git/nullius/` — per-clone, never committed,
invisible to any gitignore-respecting tool:

**Evidence:** `packages/claims/src/canary.ts:77` — `const REGISTRY_REL = join("nullius", "canaries.json");`

No marker or annotation is added to the document; the inserted diff is the
claim line and nothing else. Both choices serve one invariant: a reviewer
with repo access must not be able to *find* the probe. An in-document marker,
an in-tree registry, or the `.gitignore` entry an in-tree registry would need
are each a tell that invalidates the measurement.

One canary is active per repository at a time — `plant` refuses while one is
registered, so `verify` is never ambiguous about which claim was caught.

## Verify is three-valued, and taint wins

`verify` scans the review output with literal substring matching (never a
pattern built from registry or report content) and reports exactly one
outcome:

| Outcome          | Meaning                                                        | Exit |
| ---------------- | -------------------------------------------------------------- | ---- |
| `CANARY-CAUGHT`  | The report cites the planted `doc:line` or quotes the claim    | 0    |
| `CANARY-MISSED`  | Nothing references the planted location or claim               | 1    |
| `CANARY-TAINTED` | The report references the probe machinery — the probe is void  | 3    |

Exit **2** means *the probe could not run* — no active canary, an unreadable
report or registry, bad usage. A gate script must treat 2 as "measurement
unavailable", never as a measured miss.

Taint is tested **before** caught, and the taint tokens are the machinery's
own names:

**Evidence:** `packages/claims/src/canary.ts:83` — `const TAINT_TOKENS = ["canaries.json", ".git/nullius", "CANARY-"];`

A reviewer that saw the probe and cites the canary must not read as a healthy
reviewer — a false `CANARY-CAUGHT` is manufactured confidence in a dead
detector, the precise failure this convention exists to prevent.

## The merge guard

While a canary is registered, `check` reports a failing `CANARY-PRESENT` on
the planted document, so a probe cannot leak into an approved artifact. The
probe runner — the one actor who knows a probe is live — suppresses it with
`check --probing`; everyone else's `check`, the CI Action, and the
plan-approval hook stay loud. `canary status` is the scriptable form for
approval gates.

`clear` restores the document byte-identically and refuses if edits moved the
planted line — it will never delete a line it cannot prove is the canary.

**An unreadable registry fails closed.** A corrupt or invalid
`canaries.json` means probe state is unknown: `canary status` and `verify`
exit 2 instead of reporting all-clear, and `check` fails with instructions —
a guard that silently stands down is the failure mode this convention exists
to prevent.

## Advertised limits

- **The guard is local-plus-hook, not adversarial.** The registry lives in
  *this clone's* `.git`; CI on another clone cannot detect an unregistered
  canary, and committing the registry to enable that would tip off the
  reviewers it measures. The guard prevents accidents, not sabotage.
- **Matching is lexical.** A reviewer that catches the canary but describes
  it in words sharing nothing with the claim or its location scores as
  missed. Ask reviewers to cite `doc:line` — a discipline worth having
  anyway.
- **A probed reviewer that runs unsuppressed `check` itself** sees
  `CANARY-PRESENT`; if any of that leaks into its report, the probe scores
  `CANARY-TAINTED` rather than caught. The residual risk — a tipped-off
  reviewer that never echoes the machinery — is real and unmeasured.
- **Canaries are a genre.** Templates plus lexically harvested facts produce
  recognizable shapes over time. Detectability is a measured property to
  revisit, not a reason to reach for a model — an LLM-authored canary would
  put a model inside a loop whose whole design principle is that no model
  judges anything.
