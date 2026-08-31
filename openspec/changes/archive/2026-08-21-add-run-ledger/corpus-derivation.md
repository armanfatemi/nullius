# Corpus derivation — where the ledger vocabulary comes from

The proposal committed to deriving the record vocabulary from the existing
corpus rather than inventing it:

> **Method, carried over from the last change**: derive the vocabulary from the
> corpus before designing it, the way the hook pack was built from recorded
> payloads rather than documentation.

This file is that derivation. It is the evidence `design.md` cites.

## Provenance and honesty about the count

The corpus is `review-evidence.md` under `openspec/changes/` in a private
sibling project, **outside this repo**. Counts here are observations from
a specific run, not anchored claims — they cannot be re-verified from this
repository, and they will drift as that project moves.

- **Files: 91** — 14 under active changes, 77 under `openspec/changes/archive`.
- The proposal said 109. That number counted `.claude/worktrees/` copies, which
  are duplicates of the same files. The de-duplicated corpus is 91.

Commands used:

```
find openspec/changes -name review-evidence.md -not -path "*/.claude/*"
```

**Counting method, stated because several numbers below move without it.**
Heading counts are `grep -l` over that file list, case-**sensitive**, anchored
at the heading level named (`^## X`). Tag counts are occurrences, not files, and
are case-**insensitive** (`[blocker]` is 130 plus 6 `[BLOCKER]`). Id counts are
occurrences under `\bB[0-9]+`. Where a number changes under a different method,
this file says so rather than picking the flattering one.

## What is actually universal

Structural coverage, of 91 files:

| Structure | Files | Share |
|---|---|---|
| `## Stage …` heading | 89 | 98% |
| `_Recorded at <ISO-8601>_` | 86 | 95% |
| a looks-good section or tag | 80 | 88% |
| `pr-followup` pass | 62 | 68% |
| `[concern]` tag | 47 | 52% |
| `[blocker]` tag | 39 | 43% |
| `## Blockers` heading | 29 | 32% |
| `## Concerns` heading | 22 | 24% |
| **`**B<n>` identified findings** | **17** | **19%** |
| **`## Decision` heading** | **10** | **11%** |

Two rows in that table contradict the proposal. They are marked in bold and
addressed below.

## Kind 1 — `stage`: confirmed, two axes

Near-universal (98%). Headings carry a **phase** and an **iteration**, and the
pair is what groups a run:

```
## Stage 2 — Pre-review iteration 1
## Stage 4 — Post-review (diff)
## Stage 2 — Pre-review iteration 3 (targeted)
```

Phase frequency, normalized over all `## Stage N — X` headings:

| Phase | Occurrences |
|---|---|
| `verify` | 222 |
| `pre-review` | 193 |
| `post-review` | 105 |
| `address` | 17 |
| `refine` | 11 |

A long tail of ~35 one-off phase names follows (`Polish`, `Docker`, `Section`,
bare agent names). **A closed phase enum would reject 5% of the corpus**, so
phase must be an open string with the five above as the documented set.

`pr-followup` is **not** a `Stage N` — it is a parallel track keyed by date and
PR number, in 68% of files:

```
## pr-followup pass 2026-08-06 (PR #1061)
```

So `stage` needs an optional PR reference, not only phase and iteration.

## Kind 2 — `finding`: confirmed, and the proposal is missing two fields

### Severity is exactly three values, not a scale

| Tag | Occurrences |
|---|---|
| `[concern]` | 248 |
| `[looks-good]` | 238 |
| `[blocker]` | 136 |

`looks-good` carrying a third of all tags matters: **the corpus records
non-findings deliberately.** A schema that only accepts problems would discard
88% of files' looks-good sections, and would make `SILENT-REVIEWER`
unanswerable — an explicit "I looked and found nothing" is exactly how a
reviewer avoids being silent.

### An ID convention already exists

`B1`, `C3`, `F2` — a severity prefix plus a stage-scoped ordinal. Sub-findings
split as `B1b`. Occurrences: `B<n>` 326, `C<n>` 276, `F<n>` 25.

IDs are **stage-scoped, not run-scoped** — each stage restarts at `B1`. A
record's id must therefore be qualified by its stage to be unique in a run.

(`F<n>` is 25 under `\bF[0-9]+` and 27 unbounded. Nothing rests on it — the
convention it evidences is the severity-prefix-plus-ordinal shape, which `B<n>`
and `C<n>` establish on their own.)

### Authors are project-specific — the field must be a free string

| Author | Mentions |
|---|---|
| `rule-auditor` | 667 |
| `architecture-reviewer` | 442 |
| `test-engineer` | 430 |
| `*-domain-engineer` | 234 |
| `security-reviewer` | 193 |
| `*-extraction-engineer` | 189 |
| `graphql-engineer` | 148 |
| `*-infrastructure-architect` | 94 |
| `kubernetes-architect` | 74 |
| `skills-engineer` | 42 |

`graphql-engineer`, `kubernetes-architect`, and `incident-extraction-engineer`
are artifacts of *that* project's stack. Enumerating agent names in a kernel
schema would hard-code one project's org chart. **Free string.**

### The gap: convergence has no field in the proposal

The corpus records, pervasively, *who independently corroborated a finding*:

```
**B2 [rule-auditor + graphql-engineer converge] — Task 2.1 enum …**
3. **[blocker]** Retro path-allowlist tripwire … (rule-auditor +
   architecture-reviewer, independently — convergent)
```

"cross-reviewer" appears 27 times; headings say "cross-reviewer convergence
marked" and "(deduplicated)". This is how the corpus does dedup across
reviewers — and dedup across reviewers is named in the proposal's own Why
section as content that must survive.

**The proposal's `finding` has no field for it.** `design.md` adds one.

## Kind 3 — `resolution`: needed, but the proposal's enum is wrong

The proposal proposed a closed vocabulary of
`accepted` / `rejected` / `escalated` / `fixed` / `withdrawn` /
`deviation-accepted`.

Frequency in the corpus (case-insensitive, whole-corpus term counts — noisy,
since prose reuses these words, but the ordering is informative):

| Term | Count | In proposal's enum? |
|---|---|---|
| resolved | 405 | ✗ |
| fixed | 337 | ✓ |
| dropped | 155 | ✗ |
| duplicate | 140 | ✗ |
| deferred | 114 | ✗ |
| folded in | 79 | ✗ |
| accepted | 79 | ✓ |
| rejected | 48 | ✓ |
| out of scope | 46 | ✗ |
| no action | 37 | ✗ |
| superseded | 21 | ✗ |
| deviation | 17 | ✓ |
| withdrawn | 15 | ✓ |
| escalated | 12 | ✓ |

The proposal **missed five of the six most common outcomes** (`resolved`,
`dropped`, `duplicate`, `deferred`, `folded-in` — only `fixed` was caught), and
the two rarest terms it *did* include are `withdrawn` (15) and `escalated`
(12). Deriving beat guessing, which was the point.

`duplicate` and `folded-in` are structurally distinct from the rest: they do
not close a finding on its merits, they *merge* it into another one. A
resolution kind needs to name the finding it merges into.

## Kind 4 — `check`: confirmed, and distinct from `verification`

Counts appear as free text attached to commands:

```
860 tests pass · 12 files passed · 4 tests green · 1 test fail
pnpm nx test article · pnpm format:check · pnpm nx build dev-documentation
```

This confirms the proposal's claim that `check` is not `verification`: "860
tests pass" is an outcome with counts, not a claim about a file's hash.

## Kind 5 — `decision`: needed, but the proposal's justification is false

The proposal says:

> `decision` — … **The most common section in the existing corpus.**

**It is not.** `## Decision` appears in 10 of 91 files (11%) — the lowest
coverage of any structure in the table above.

That superlative is method-dependent, and the honest version is narrower.
Counting *any* heading level, `Decision` appears in 19 files (21%) — more than
identified findings (17, 19%), so it is not then the rarest of everything
measured. What survives every method is the part that matters: `decision` is a
**rare** explicit section, nowhere near the most common one, and the proposal's
stated reason for including the kind was false either way.

The underlying need is real, but it lives in prose, not sections: "instead of"
43, "deferred to" 52, "out of scope" 46. And where a Decision section does
exist it references a *numbered design decision* and the agent consulted:

```
## Decision-8 tripwire-vs-structural assessment (architecture-reviewer, asked directly)
```

So `decision` should carry an optional reference to the design decision it
resolves. But the "most common section" claim should be struck from the
proposal — it is the opposite of true, and it was the stated reason for
including the kind.

## The verdicts

### `SUPPRESSED-FINDING` is justified — and will be loud

Measured over the 17 files that use identified findings: of **97** findings
declared, **38 (39.2%)** are mentioned anywhere later in the same file.
**59 (60.8%) are never mentioned again.**

That is the strongest single result here. The hand-written corpus leaves three
of every five identified findings unanswered *in the document that exists to
account for them* — exactly the failure the proposal predicted, and not
something the author of the synthesis would report on themselves.

Two consequences for design:

1. The verdict is **empirically earned**, not speculative.
2. It will fire on a majority of findings on day one. A verdict that fires
   everywhere gets ignored. Design must scope it — the recommendation in
   `design.md` is to gate it on `blocker` severity, where the burden of a
   close-out is defensible.

Caveat, stated plainly: "mentioned again in the same file" is a *proxy* for
"resolved". A finding may be answered in a commit, a PR thread, or a later
file. The honest claim is narrower than the number looks — within the evidence
file itself, the loop is left open 61% of the time.

### `SILENT-REVIEWER` is supported by the looks-good data

238 `[looks-good]` tags across 80 of 91 files show reviewers *do* file explicit
nothing-found results when the format invites it. The verdict is answerable.

## The split decision

The proposal left this open:

> **Possible split.** If deriving the vocabulary shows the schema is larger
> than the projections, this splits.

The corpus answers it — **in the other direction, and the split still holds.**

The *schema* is tractable: five kinds, three severities, one open phase set,
one resolution enum, all derived above.

The *projections* are not. 91 files produced roughly 40 distinct heading
variants for the same handful of concepts. Only 19% use identified findings.
Only 11% have a Decision section. There is no single house style to render
back to, so "reads no worse than a hand-written one" has no fixed target.

**Recommendation: split.** Land the kernel schema (v0.3 kinds + two verdicts)
first, where the corpus gives firm answers. Defer `witness harvest` and the
producer skill to a second change, once real v0.3 records exist to render from
— rendering is much easier to design against actual records than against 91
hand-written files that disagree with each other.

## Corrections this derivation makes to the proposal

1. Corpus is **91 files, not 109** — the larger count double-counted worktrees.
2. `finding` needs a **convergence/corroboration** field. Not in the proposal.
3. The `resolution` enum in the proposal **misses five of the six most common
   outcomes**, and the two rarest terms it includes are `withdrawn` and
   `escalated`.
4. `decision` is the corpus's **rarest** explicit section, not "the most
   common" — the proposal's stated reason for the kind is factually wrong,
   though the kind is still worth having.
5. `stage` phase must be an **open string**, not a closed enum, or it rejects
   5% of the corpus. It also needs a **PR reference** for `pr-followup` passes.
6. `SUPPRESSED-FINDING` should be **gated to blockers**, or it fires on 61% of
   findings and becomes noise.
7. The **split is recommended** — schema now, harvest later.
