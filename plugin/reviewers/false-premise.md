# The `[false-premise]` reviewer kit

Your review agents are almost certainly **normative** — they check whether
the plan complies, whether the design is sound, whether the code will break.
None of them re-checks whether the document's claims about the _existing_
codebase are true, and a false premise supporting a correct conclusion is
invisible to a reviewer who agrees with the conclusion.

Fix it by adding a descriptive pass. Two pieces:

## 1. The severity — add to your reviewer agent's taxonomy

> `[false-premise]` — a load-bearing claim about the existing codebase that is
> uncited, contradicted by the code, or whose named binding moment is wrong.
> **Report it even when the conclusion it supports still looks right** — a
> correct conclusion reached from a false premise is precisely the case every
> other reviewer waves through, and the next change will reason from the
> premise. Treat `[false-premise]` as a blocker. When trimming a report to
> fit, drop `[looks-good]` entries first and keep every `[false-premise]` —
> an unchallenged false premise outlives this review.

## 2. The question — inject verbatim into every review brief

Paste this into the prompt of every reviewer you dispatch on a design doc or
proposal. Do not paraphrase it — paraphrases drift back into normative
review:

> Separately from whether the plan is correct: is what this document says
> about the **existing** codebase actually true? Open the cited files. Flag
> any load-bearing claim that is uncited, contradicted by the code, or whose
> named binding moment is wrong, as `[false-premise]` — including when the
> conclusion it supports still looks right.

## Where to spend the reads

A reviewer cannot verify every sentence. A claim is worth opening the file
for when it is **surprising**, when it is the **sole support for a rejected
alternative**, or when it asserts that something does **not** exist.

## Division of labor with the checker

`npx @nullius-inverba/claims check` deterministically verifies every claim written in
the structured `**Evidence:**` / `**Binds at:**` form — run it BEFORE
dispatching reviewers, because fixing a false premise changes the design the
reviewers would be reading. The reviewer's job is the remainder: load-bearing
claims asserted in bare prose with no anchor. A document with no grounding
markers at all is not a pass — it is a document whose claims nobody has
checked.
