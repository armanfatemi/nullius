---
name: probe-leak-side-channels
description: A CAUGHT probe score can come from the per-clone canary registry or from prior probe sections in review-evidence.md, and the taint check cannot see either — score CAUGHT as "not disproven"
metadata:
  type: project
---

Before recording `probe: caught`, read the probe section's `found by:` and
`leak:` lines and ask *how* the reviewer found the plant. Two side channels are
structural in this repo:

1. The per-clone registry — any agent running `nullius check` here trips the
   `CANARY-PRESENT` merge guard (`packages/claims/src/cli.ts:92`, the `--probing`
   flag exists to suppress it for the probe run only).
2. `review-evidence.md` is committed with the previous iterations' probe
   sections, which name the plant location, and reviewers read that file.

`verifyCanary` tests taint before caught, but only against three literal tokens
(`packages/claims/src/canary.ts:49` — `canaries.json`, `.git/nullius`,
`CANARY-`). A reviewer writing "confirmed via the local registry" or "the merge
guard fired" escapes taint and scores CAUGHT.

**Why:** on `add-authoring-ergonomics` (PR #42) the identical sentence was
planted at `proposal.md:6` five rounds running; architecture-reviewer confirmed
it from the registry in iterations 2, 3 and 4 ("third/fourth/fifth successive
plant") and rule-auditor identified iteration 1's plant by reading iteration 0's
probe section. Four CAUGHT scores, none of which measured reading.

**How to apply:** report leaked CAUGHTs explicitly (`probe_leaked`,
`probe_plant_varied` frontmatter fields) rather than passing the score through.
A leaked CAUGHT is a finding, not a healthy probe. See
[[probe-state-vs-artefact]] and [[scope-claims-need-checking]].

**Third occurrence, and it got structural — `add-probe-visibility` (PR #43).**
architecture-reviewer's *durable* memory now carries the leak: commit `045c48a`
added to `project_proposal-injected-prose.md` the line "`canary status` +
`check '<dir>/**/*.md'` in one call confirmed it again … that pairing is now
3-for-3 as the fastest opener", together with the plant's exact fixture path
(`spec/fixtures/rules-valid/src/example.ts`, unvaried across five rounds, and
unvaried across the previous run too). A side channel that was incidental is now
persisted across runs. Treat any future CAUGHT from architecture-reviewer in this
repo as pre-compromised until the plant string is varied.

Also new: this run's probe sections record per-reviewer catch/miss *and* whether
each catch came from reading or the registry. That decomposition is worth more
than the aggregate — 5/5 CAUGHT decomposed to 5/5 for one reviewer (2 leaked),
2/3 for another, 0/4 for a third that was never briefed for the pass at all.

**Fourth occurrence, and a new channel — `add-journal-identity` (PR #53,
2026-08-29).** architecture-reviewer's memory file gained this run's plant host
(`design.md:6`), the same unvaried fixture path, the plant timestamp, and
"`canary status` + `check '<dir>/**/*.md'` in one call: 5-for-5". The counter is
now cumulative across runs.

The new channel is worse and is the pipeline's own: the coordinator wrote "Plant
the iteration-2 canary into design.md" into `progress.md`, which the pipeline
COMMITS into the change folder, so the plant location shipped in the diff the
reviewers read. rule-auditor cited `progress.md` as its confirmation source.
Always grep the committed change folder for the plant document before scoring a
CAUGHT.

Also confirmed empirically: paraphrase defeats taint. That round scored exit 0
while three of four reports were tainted, because the synthesis described the
leak without using any of the three literals. So TAINTED under-reports and
CAUGHT is inflated corpus-wide, not just per run.

Contrast worth keeping: checker-engineer caught the plant on the merits 3 of 3
rounds and its new memory file contains no probe machinery at all — and it
declares no false-premise pass. The declared pass is not what produces catches.

**Fifth occurrence, and the leaker changed — `add-canary-status-redaction`
(PR #58, 2026-08-31).** rule-auditor is now the one taking the shortcut:
iteration 1 it reported the plant with its `plantedAt` timestamp (printed only
by `canary status`'s presence branch), iteration 2 it reported running `check`
and seeing CANARY-PRESENT. architecture-reviewer read the prose all five rounds.

Genuinely good news, with a caveat: architecture-reviewer DELETED the
`canary status` + `check` shortcut from its own durable memory mid-run,
unprompted, and replaced it with a prohibition plus a note that a prior revision
of that file had promoted it. First time an agent closed this channel itself.
The caveat: those memory edits were UNCOMMITTED at end of run (`M`/`??`, absent
from the branch), so verify the file before assuming the channel is closed.

**How to apply, updated:** the taint instrument is wrong in BOTH directions and
one run showed both. Over-reports: any change whose subject is the canary
machinery taints every round, because an accurate synthesis must name it — "the
canary cannot score a review of the canary" (4 of 5 rounds void). Under-reports:
that same run's iteration 1 scored CAUGHT while its synthesis discussed the probe
machinery by name, having dodged all three literals. So CAUGHT vs TAINTED tracks
vocabulary, not contamination. Never read either verdict as a fact about reviewers
without reading the section's narrative.

**New channel, `add-run-ledger-producer` (PR #74, 2026-08-31): `review-evidence.md`
itself.** Between iteration 2's failed dispatch and its re-dispatch, the coordinator
appended a note recording the lost round that named the live plant's existence and
host document. rule-auditor reads the change folder, cited that note, and its catch
had to be excluded from the verdict basis — while the tool still scored the round
CAUGHT. So the taint detector did not fire on a round the coordinator knew was
compromised, and only its own disclosure records it. When a run has a re-dispatched
round, read whatever was appended between the two dispatches before crediting the
second round's catches.

**Seventh occurrence, and the leak is now a shipped product — `add-pr-process-report`
(PR #75, 2026-09-02).** Two things changed the shape of this problem.

1. **The committed run bundle is a new, permanent, PUBLIC channel.**
`nullius.runs/<branch>.json` carries reviewers' `report.findings` entries
verbatim, capped by LENGTH only (`packages/kit/src/bundle.ts:512` —
`clip(entry, EXCERPT_CAP)`, no scrubbing). That run's bundle contains the plant
sentence four times with its host document and line, plus the literal
`CANARY-PRESENT`. It is committed to a public repo, and `init --run-report` +
the Action make committing it routine for every adopter. **Always grep any
committed `nullius.runs/*.json` for the plant text and `CANARY-` before scoring
a probe** — and for `/Users/` while you are there, see [[bundle-leaks-operator-paths]].

2. **architecture-reviewer's memory now encodes the plant SIGNATURE, not just a
technique.** `project_proposal-injected-prose.md:11-17` states the shape "is
always the same: a claim that `retry` is also defined in some fixture file",
names both fixture paths ever used, instructs "Match on the shape, not the path,
and not the host file", and tracks "Seen 7+ times". So the earlier good news —
that the agent deleted the `canary status` shortcut and replaced it with a
prohibition — closed the *registry* channel and opened a bigger one. A CAUGHT
from architecture-reviewer in this repo now measures whether a memorised
signature still matches. It went 5/5 on an unvaried sentence and was the SOLE
catcher in two of five rounds.

**New field worth recording every run: `probe_effective_population`** — the
in-scope agents actually able to score the plant, per round. That run was
[2,2,2,1,1]: rule-auditor dropped at pre-flight in round 4, and dispatched but
briefed OFF the false-premise pass in round 5. A 5/5 streak scored against one
agent in 40% of rounds is not a healthy-layer measurement. The coordinator
disclosed both reductions itself, in the round they happened — so this is
recoverable from the probe sections without extra work.
