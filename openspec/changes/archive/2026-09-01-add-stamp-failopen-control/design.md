# Design — add-stamp-failopen-control

## Decision 1 — The discriminator is the clone, never the citation

A rev in a document cannot be evidence about whether that rev is trustworthy;
it is supplied by the party being checked. Any rule of the form "soften when
THIS rev is unreadable" is therefore controlled by the author, which is the
defect.

The question that is not author-controlled is **can this clone read history at
all**. That is a property of the checkout, established once per run, and no
document can influence it.

- `git rev-parse --is-shallow-repository` answers it directly.
- The probe runs at most once per run and is cached, alongside the existing
  git helpers:

**Evidence:** `packages/claims/src/runners.ts:238@8211685` — `const result = spawnSync("git", ["-C", base, "rev-parse", "--short", "HEAD"], {`

**Rejected: "do other stamps in this run resolve?"** It is a genuine control
and it was tempting, because this repository already likes that shape — the
relaxed-control re-run for absence searches is the same idea. It fails here for
a reason specific to this attack: the set of stamps is also author-controlled.
A document carrying only forged stamps looks exactly like a shallow clone under
that rule, and the one document where every claim is invented is precisely the
one this change exists to catch.

## Decision 2 — Failing open is preserved where it was earned, not removed

The three cases the fail-open protects are kept:

| Case | Clone state | Outcome |
| --- | --- | --- |
| Shallow checkout (`fetch-depth: 1`) | shallow | fails open, unchanged |
| git absent, or no rev reader supplied | cannot probe | fails open, unchanged |
| Fork or squash, full clone | full history | working-tree verdict stands |

Only the third row changes, and it is the only row where the clone has
demonstrated it can read history. The squash case keeps a documented remedy
that predates this change: re-pin the anchors to the squash commit.

The asymmetry the Aug-19 review proposed still holds and is now conditional
rather than absolute: **a stamp can win an anchor the permanent gate; it can
never lose it the ordinary one — on a clone that can see history.**

## Decision 3 — The unhonoured count is reported, because silence is the sibling defect

A shallow CI run currently softens every stamped anchor and says nothing about
it. That is the same shape as the defect this repository is named for: a gate
that stopped applying looks identical to a gate that had nothing to say.

The run reports the count of stamps it could not honour. It is a number, not a
verdict, and it never fails a run on its own — the point is that a maintainer
who sees "34 stamps unhonoured" goes and sets `fetch-depth: 0`.

## Decision 4 — `unverifiable-rev` keeps its name and its passing status

Renaming it would break `.claude/rules/merge-never-squash.md`, whose anchors
cite it by name, and would cost more than it buys. Its meaning narrows: it now
marks an anchor the clone genuinely could not settle, rather than any anchor
whose rev did not resolve.

It stays in the passing set. On a shallow clone it is the honest verdict, and
a shallow clone is a configuration mistake rather than an authoring one.

## Decision 5 — The spec paragraph is corrected, not deleted

**Evidence:** `spec/evidence-anchors.md:131@8211685` — ``fetch-depth: 0`. There is a forgery surface here too (an author could hunt`

That paragraph weighs one forgery — hunting history for a commit where a claim
happens to be true — and concludes it costs more than opening the file. True,
and it stayed true. What it never considered is the cheap forgery: naming a
commit that does not exist at all. The paragraph is corrected to name both and
to say which one this change closes, because a spec that quietly drops a
falsified argument teaches nobody why the code looks the way it does.
