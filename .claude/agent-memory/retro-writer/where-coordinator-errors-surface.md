---
name: where-coordinator-errors-surface
description: review-evidence.md now carries "## Coordinator corrections since last append" blocks and [corrected-coordinator] finding tags — read them, and know what they still cannot show
metadata:
  type: project
---

Grep `review-evidence.md` for `## Coordinator corrections since last append` and
for the `[corrected-coordinator]` tag on finding headers before writing anything
about the coordinator's own errors.

**Why:** the standing blind spot in this role is "an error the coordinator
noticed and fixed before committing, which appears in no artefact". As of
`add-probe-visibility` (PR #43, 2026-08-29) that is only *mostly* true: eight
corrections blocks and eight `[corrected-coordinator]`-tagged findings existed in
one run. But nearly all of them record an error a *reviewer* caught. Genuinely
self-caught entries were rare (two: a zsh `$cmd` word-splitting loop that falsely
reported gates failing, and a probe-scoring citation truncation). So the blind
spot is narrower than it was and is still non-empty, and its size is unknown.

**How to apply:** mine these blocks — they are the densest source of real
findings in the file, and they are where cross-round patterns get named (this run
named "local edit where a document-wide sweep was needed" and "a reviewer's
finding tightened into a claim the reviewer never made", the latter three times
in one run, once reaching the implementation). Then still write the blind spot
under `## Uncertainty`: a corrections block is evidence of what was caught, never
of what was not. See [[probe-state-vs-artefact]] and
[[scope-claims-need-checking]].

**`add-journal-identity` (PR #53, 2026-08-29) — six blocks, eight tagged
findings, and several genuinely self-caught** (the Decision 6 unit
contradiction, a count carried forward instead of re-derived, "I asked the user
to decide before measuring", "I shipped a fix that broke the feature and my own
verification did not catch it"). The blocks are where the run's two worst
findings are stated most plainly; quote them rather than paraphrasing.

New failure mode to check for: **a global rename can sweep through the record of
the defect it repaired.** `review-evidence.md:248` reads "`VOCABULARY` does not
exist. The map is `VOCABULARY`" — the invented symbol was replaced everywhere,
including inside its own correction, so the wrong name is unrecoverable. When a
corrections block records an invented identifier, check whether the wrong name
is still legible; if it is not, that is its own finding.

**`add-canary-status-redaction` (PR #58, 2026-08-31) — six blocks, ~18 entries,
and the coordinator named its own cross-cutting pattern and did not stop.**
Iteration 3: "in each case I wrote an argument from the part of the code I had
already read, instead of opening the part the argument was actually about." By
iteration 5: "This is the fifth instance in this run of the same failure, and it
happened inside a paragraph whose subject is another party's citation being
wrong." Naming a pattern four rounds running did not prevent the fifth instance —
every catch still came from a reviewer opening the file.

New check that paid off: **a correction that sweeps several documents usually
misses one, and the coordinator's own recorded failure mode is the tell.** That
run corrected an "eight sites" ledger in CHANGELOG.md, proposal.md and design.md
and left `progress.md` saying eight — one commit after recording about itself
"the correction was performed where I happened to be editing rather than
everywhere the claim lived." After reading a corrections block that names a
document-wide sweep, grep the change folder for the old value.

**`add-run-ledger-producer` (PR #74, 2026-08-31) — nine blocks, 28 entries, 16
tagged. The densest disclosure yet, and it exposed the next failure mode: the
corrections are append-only, so the false version stays unmarked where a reader
meets it.** Stage 8 recorded that a claim stated four times was false and had
overridden a reviewer who was right — but `review-evidence.md:451` still reads as
fact, 440 lines before its correction, and one round later the coordinator's false
version appears *attributed to that reviewer* as its own concern. Two checks that
paid off: (1) grep the change folder for the corrected claim's key token (here a
commit hash) and note every site still carrying the old version; (2) when a
correction names the round a reviewer was right, check that the reviewer's entry
is actually in that round — the Stage 8 note said "iteration 4" and the entry sat
in iteration 3. Also: a `## Reviewer error, noted` section is a claim about an
agent, not a fact — re-verify it. This run's was the coordinator's error, filed
under the reviewer's name.

**`add-pr-process-report` (PR #75, 2026-09-02) — 12 blocks, 36 bullets, 7 tagged.
The densest yet, and the first where the coordinator's own words are the best
statement of the run's two findings.** Quote these rather than paraphrasing:

> each time, I read exactly as deep as the correction I had just received and no
> deeper — line, then comment, then paragraph — while the governing scope was one
> level further out each time
> — review-evidence.md:133-140

> My own `check` run cannot catch this — anchors verify documents against *code*,
> and nothing verifies a change's documents against *each other*.
> — review-evidence.md:377-383

**New failure mode, and it is this repo's thesis inverted inside the coordinator:
a hand-rolled grep placed over a checker's own output.** It grepped
`FABRICATED|WEAK-ANCHOR|WRONG-LINE` over `check` output and reported "no anchor
defects" while two claims were unverified; the verdict was `UNPINNED`, not in the
pattern (`:114-120`). Whenever a corrections block says the coordinator "ran a
check and it was clean", ask what it read — the tool's exit code and summary, or
its own filter over the tool.

**Also: mid-run countermeasures are worth grading, not just noting.** That run
adopted two. "Read, then cite" cut anchor errors and did not close the class —
seven anchor defects still reached the checker. The post-design grep sweep caught
one line, then MISSED two the next round because it swept abandoned *phrasings*
rather than abandoned *nouns*; the corrected form then worked once. Both are
recorded only in `review-evidence.md`, i.e. nowhere the next run reads. A
countermeasure that exists only in the artefact of the run that invented it is a
rule proposal, and saying so is more useful than saying "the coordinator adapted".
