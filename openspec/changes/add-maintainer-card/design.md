# Design — add-maintainer-card

## Context

The JSON report is a **wire** contract, not an importable one: nothing in
`packages/claims/src/checkReport.ts` is re-exported from the package index, so
a consumer reads `check --format json` from stdout and gets no types. The
document is version-tagged and its compatibility policy is written down —
adding a field is non-breaking, renaming or removing one bumps `version`, and
growing the `Verdict` union also bumps it.

Everything an annotation needs is already on the wire, in two forms. Each
result carries where the anchor sits *in the markdown document*
(`checkReport.ts:196`, cited in `proposal.md`) and, inside `claim`, the path
and line it cites in the source tree. These are different anchor points and
Decision 3 turns on the difference.

The Action pins the checker it fetches:

**Evidence:** `action/action.yml:47@5f88e21` — `    default: '0.8.0'`

and exposes strictness as a single boolean:

**Evidence:** `action/action.yml:28@5f88e21` — `    description: Fail the job when any claim is unverified. Default false (advisory).`

## Decisions

### 1. Parse stdout only; keep stderr out of the parse

**Chosen:** drop `2>&1` for the JSON invocation, capture stdout and stderr
separately, parse the former, and surface the latter as a diagnostics line
under the card.

**Alternatives considered:**

- **Keep `2>&1` and parse leniently** — rejected: any diagnostic written to
  stderr corrupts the document, and a lenient parser that recovers from that is
  a parser that will also silently accept a truncated report.

**Rationale:** the CLI already guarantees the split
(`packages/claims/src/cli.ts:1086`, cited in `proposal.md`); the current merge
in `action.yml:86` exists only because human format has no such contract.

### 2. The card names what was proven, and names what was not

**Chosen:** the card's rows are *anchor integrity* rows — checked, verified,
failed, by verdict. It carries one line stating that verdicts certify the
citation and not the argument, linking to `audit`.

**Alternatives considered:**

- **A "Premise Validity ✅ Passed" row** (as originally suggested) — rejected,
  because it asserts something the checker does not compute:

  **Evidence:** `spec/evidence-anchors.md:363@5f88e21` — `Verdicts certify form, never entailment — a real line, quoted accurately, under`

- **Say nothing about the limit** and let the maintainer infer it — rejected:
  the whole hazard of a card over a text dump is that a tidy green table reads
  as a stronger claim than the prose it replaces.

**Rationale:** the modesty is load-bearing rather than decorative. A card that
overstates what a green check means manufactures the exact failure this
repository exists to prevent, in the one place a maintainer will actually look.

### 3. Annotations anchor to the markdown document, not the cited file

**Chosen:** emit `::error file=<source.doc>,line=<source.line>::`.

**Alternatives considered:**

- **Anchor to `claim.path` / `claim.line`** (the cited source file) — rejected:
  GitHub renders inline annotations on lines present in the diff, and an
  Evidence Anchor by construction cites code the pull request did *not* change.
  The annotation would land on the one file range that is invisible in Files
  Changed.

**Rationale:** the failing artifact is the document making the claim, not the
file it misquotes, so the document is also the correct place to put the marker.
This does not rescue every case — a PR-body anchor has no file at all, and a
failing anchor in an unmodified document still renders nothing. Those are
accepted limitations, and Decision 4 requires the card to remain the complete
record precisely because annotations are partial.

### 4. The card is the source of truth; annotations are a convenience

**Chosen:** every failing result appears in the card. Annotations are emitted
for the subset GitHub can render, and their absence is never load-bearing.

**Rationale:** falls directly out of Decision 3's limitations.

### 5. Escape at both boundaries, and treat it as security work

**Chosen:** two distinct escapers. Markdown-cell escaping for card values
(pipes, newlines, backticks, angle brackets, leading control characters), and
workflow-command escaping for annotation values (`%25`, `%0A`, `%0D`, and the
`::` sequence).

**Rationale:** `spec/evidence-anchors.md:398` (cited in `proposal.md`)
classifies the checked document as untrusted, and both `result.detail` and the
`claim` fields originate there. The current fenced dump neutralizes this by
accident; a structured renderer must do it on purpose.

### 6. Refuse to render an unrecognized report version

**Chosen:** read `.version`; if it is not a version this Action understands,
skip the card, fall back to the human-format dump, and say why.

**Rationale:** see Compatibility risks — this is the mitigation.

### 7. Do not render canary results into a public comment

**Chosen:** `canary-present` results are counted in the failure total but
their `source.doc` and `source.line` are not printed.

**Rationale:** the canary's value depends on its location not being published,
and `add-canary-status-redaction` is narrowing exactly this exposure elsewhere.
A card that faithfully renders every result would reopen it in a more public
place than the command that change is fixing.

## Compatibility risks

**Risk:** the Action parses a JSON document produced by a separately versioned
npm package, and a consumer may set `claims-version: latest`. A checker whose
`REPORT_VERSION` has moved past what the Action understands would be parsed
with the wrong field expectations — silently, since `jq` returns `null` for a
missing field rather than failing.

**Binds at:** `inter-service-skew`

**Skew path:** `@nullius-inverba/claims@<newer>` → the JSON document on stdout → `armanfatemi/nullius/action@v1`

**Symptom:** a card whose counts are empty or zero on a pull request that
actually has failing anchors — a green-looking table over a red run. Visible
only by comparing the card against the job's exit code.

**Mitigation closes it because:** Decision 6 reads `.version` *before* reading
any other field, and an unrecognized value routes to the human-format fallback
rather than to a partially-parsed card. The failure becomes "nullius could not
render a card for checker version X", which names the skew instead of
displaying its result.

**Evidence:** `action/action.yml:47@5f88e21` — `    default: '0.8.0'`

## Open questions — resolved at implementation

All three were open when this was written. They are answered below, and the
answers are recorded here rather than only in the code, because two of them are
decisions a reader would otherwise have to reconstruct from a diff.

### 1. Where the rendering and escaping live — RESOLVED: in the kernel

**Chosen:** `checkReport.ts` renders the card, exposed as `check --format card`.
The Action invokes it and posts the result. Workflow-command escaping for
annotations stays in the Action, because a `::error` line is a workflow concern
that no kernel output should be emitting.

**Rejected:** `jq` inside `action.yml`. Tasks 4 and 5 of this change require an
adversarial fixture and assertions that the escaped output cannot terminate a
table — and a jq pipeline embedded in YAML has nowhere to put them. That gap is
not hypothetical: the run report's Action-side version gate was reviewed and
flagged for exactly it, "nothing in `packages/*/src/*.test.ts` exercises
`action/action.yml`'s shell gate".

**Cost, stated plainly:** the Action runs the *published* checker, so a card
rendered in the kernel is invisible until a release — the same gap that made the
run report's own card absent from its own pull request. That is a real cost and
it is worth paying here: an untested escaper on untrusted input is a worse
trade than a release cycle.

**Precedent:** `witness report` renders its card in the kernel and the Action
posts it. This change follows the shape that already shipped rather than
inventing a second one.

### 2. `::error` versus `::warning` in advisory mode — RESOLVED: match the gate

**Chosen:** `::error` when `strict: true`, `::warning` otherwise.

**Rationale:** the annotation's severity should never disagree with whether the
run actually blocks. A red annotation on a green job teaches a reader that
annotations are decorative, which costs more than the loudness gains.

### 3. How the card presents a PR body — RESOLVED: by Decision 4

A PR-body anchor has no file for GitHub to annotate, so it gets no annotation
and appears in the card like any other result. This needs no new mechanism:
Decision 4 already requires the card to be the complete record precisely
because annotations are partial. The card names the PR description as the
document rather than omitting the row.
