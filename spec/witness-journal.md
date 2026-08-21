# The Witness Journal

**Version 0.2 — draft.** The record a multi-agent run leaves behind, and the
three invariants [`nullius witness validate`](../packages/claims/) enforces on
it. Companion to [Evidence Anchors](./evidence-anchors.md), which does the same
job for documents.

## The problem this solves

[Evidence Anchors](./evidence-anchors.md) treat a design document as untrusted:
it is text an agent wrote about code, so every load-bearing claim gets
re-verified. A run journal is the same kind of object one level up — text an
agent wrote about work agents did — and it is usually trusted completely,
because it looks like machinery rather than prose.

It is not machinery. Three specific things go wrong, and all three are
invisible in a summary:

1. **Silence reads as a clean result.** Twelve agents are dispatched, nine
   report findings, one reports "nothing", and two never come back. If the
   journal has two states — findings or not — the run summarises as "nine
   found something, three found nothing", and the two that died are laundered
   into evidence of absence. The absence claim is the load-bearing one.
2. **A verification is quoted after its subject changed.** Something is
   checked, the thing changes, and the earlier "verified" keeps being cited by
   everything downstream. Nothing in a flat log makes that visible: both
   records are true, and their order is the entire defect.
3. **A field that can be silently absent always will be.** "What did you
   correct since the last entry?" answered with nothing at all is
   indistinguishable from nothing to correct — and the second one is the
   reading everybody takes.

## The format

JSON Lines: one JSON object per line, append-only, **in time order**. Order is
load-bearing — invariant 2 is a question about what happened *between* two
records — so a reordered journal is a different journal.

Every record carries `kind`, and every record but the header carries a unique
`id`. Six kinds:

| Kind | Purpose | Required fields |
| --- | --- | --- |
| `journal` | The header: which schema, and whose account | `version`, `origin` |
| `dispatch` | A unit of work handed to an agent | `id` |
| `report` | The terminal record for one dispatch | `dispatch`, `outcome`, and `findings` or `statement` |
| `verification` | Something was checked against an artifact | `target: {path, hash}` |
| `mutation` | An artifact was changed | `target: {path, hash}` |
| `reliance` | A later step resting on a verification | `relies_on` |
| `append` | An entry added to the run's ledger | `corrections_since_last_append` |

```jsonl
{"kind":"journal","version":"0.2","origin":"hooks","session":"2f9c1a4e","source":"startup"}
{"kind":"dispatch","id":"d1","task":"find consumers of legacy.published"}
{"kind":"report","id":"r1","dispatch":"d1","outcome":"empty","statement":"None."}
{"kind":"verification","id":"v1","target":{"path":"src/probe.ts","hash":"9f2c…"},"verdict":"safe"}
{"kind":"reliance","id":"x1","relies_on":"v1"}
{"kind":"mutation","id":"m1","target":{"path":"src/probe.ts","hash":"7ab2…"},"tool":"Edit"}
{"kind":"append","id":"a1","corrections_since_last_append":"None."}
```

## The header — which schema, and whose account

The first record may be a `journal` header. It carries `version` (the schema
the records below are written to; this build reads `0.1` and `0.2`), `origin`,
and optionally `session` and `source` (`startup` / `resume` / `clear` /
`compact`). A resumed session gets a new id and therefore a new journal file, so
recording `source` makes a fork in journal identity visible rather than
mysterious.

A journal with **no header is read as 0.1** — everything that existed before
the header did. A header naming a version this build does not know produces
exactly one finding, `UNSUPPORTED-VERSION`, and validation stops there: the
records below are not malformed, this build is old, and a cascade of
`MALFORMED` findings would bury the one fact worth acting on. The version
record exists so that schema growth is *diagnosable*, not merely loud — which
is why it had to land before any third-party producer existed.

The header must be the **first** record. A `journal` record further down is
`MALFORMED`: it governs nothing, and a reader would have to guess which of two
accounts applies.

### `origin` — the harness attests, or the agent says so

| Origin | Means | Worth |
| --- | --- | --- |
| `hooks` | Records were emitted by harness runtime hooks | The agent had no opportunity to decline to write them |
| `self-reported` | An agent wrote the records about its own work | Internally consistent; not evidence the run went this way |

This distinction is the tool's entire subject, so it is printed in the summary
on every run and not only when it is flattering. A `self-reported` journal that
passes has demonstrated that its own account holds together — which is what
`check` demonstrates about a design document, and no more.

A journal that omits `origin` is `MALFORMED`. A field that may be left out gets
left out, and its absence would be read as the better of the two tiers.

Unknown kinds, duplicate ids, and unparseable lines are **reported, not
skipped**. A validator that quietly ignores half a journal is worse than no
validator, for the same reason a checker that quietly checks fewer documents
than you configured is.

## Invariant 1 — three states, never two

Every `dispatch` must reach exactly one terminal `report`, whose `outcome` is
one of:

- **`found`** — the agent reported something. Requires a non-empty `findings`.
- **`empty`** — the agent came back and explicitly said there was nothing.
  Requires a `statement`; `"None."` is the canonical one.
- **`no-report`** — the agent never came back. Requires a `statement` saying
  what was dispatched and what happened.

An outcome outside those three is `COLLAPSED-STATE`: the collapse itself, since
`{"ok": true}` and a missing report then read alike. A dispatch with no terminal
record at all is `NO-TERMINAL` — the one failure a summary can never surface on
its own, because the missing record is missing. An `empty` or `no-report` with
nothing said about it is `SILENT-EMPTY`: the explicit "None." *is* the record,
and its absence is not.

The three states are a closed list in the validator, not a convention:

**Evidence:** `packages/claims/src/witness.ts:80@7412847` — `const OUTCOMES = ["found", "empty", "no-report"] as const;`

`witness validate` prints the three counts separately for the same reason.
Added together they are the bug.

## Invariant 2 — verified once is not verified

A `verification` names the artifact it verified **and that artifact's hash**. A
`reliance` on it is invalid — `STALE-VERIFICATION` — when any later record has
recorded a different hash for that path before the reliance.

A `mutation` is how an edit enters that arithmetic. It advances the latest-known
hash for its path and does nothing else: it is not a check, so it can never be
the object of a `reliance`, and naming one is a `DANGLING-REFERENCE`. Recording
an edit as a `verification` would be the convenient lie — the hash map would
work and the journal would claim something was examined when nothing was.

A verification that does not name what it verified is `MALFORMED`, because it
can never be invalidated: it is a claim that something was checked, with no way
to find out whether the check still covers anything.

This is the destructive-probe shape, mechanically: something is verified, the
thing changes, and the verification keeps being quoted by everything
downstream. Both records are honest; the defect lives in the gap between them.

The check is a hash comparison against the latest recorded state of that path,
so it costs nothing and cannot be argued with:

**Evidence:** `packages/claims/src/witness.ts:342@7412847` — `if (latest !== undefined && latest.hash !== source.hash) {`

## Invariant 3 — omission is invalid

Every `append` must carry `corrections_since_last_append`. `"None."` passes; an
absent or blank field is `OMITTED-CORRECTIONS`.

The rule is about which way silence resolves. A field that may be left out gets
left out, and a reader takes its absence as "nothing to report" — so absence is
made invalid, and the only way to say nothing is to say it.

## Verdicts

| Verdict | Meaning | Passes? |
| --- | --- | --- |
| `NO-TERMINAL` | A dispatch never reached a terminal record | ❌ |
| `COLLAPSED-STATE` | An outcome outside the three states, or `found` with no findings | ❌ |
| `SILENT-EMPTY` | An `empty`/`no-report` with nothing said about it | ❌ |
| `DUPLICATE-TERMINAL` | Two terminal records for one dispatch | ❌ |
| `STALE-VERIFICATION` | Reliance on a verification whose artifact changed since | ❌ |
| `OMITTED-CORRECTIONS` | An append that does not say what it corrected | ❌ |
| `DANGLING-REFERENCE` | A reference to a record that is not in the journal | ❌ |
| `DUPLICATE-ID` | Two records claiming one id — references become ambiguous | ❌ |
| `MALFORMED` | Not JSON, unknown kind, or a required field missing | ❌ |
| `UNSUPPORTED-VERSION` | The header declares a schema this build cannot read | ❌ |

## Fixtures

Four journals live next to this spec:

| Fixture | What it is for |
| --- | --- |
| [`valid-run.jsonl`](./fixtures/valid-run.jsonl) | A v0.2 journal exercising all three terminal states, a mutation, and a live reliance |
| [`broken-run.jsonl`](./fixtures/broken-run.jsonl) | Breaks each invariant at least once, including both mutation failures |
| [`v0.1-run.jsonl`](./fixtures/v0.1-run.jsonl) | Headerless, to keep v0.1 compatibility a thing CI checks rather than a thing README claims |
| [`future-run.jsonl`](./fixtures/future-run.jsonl) | Declares version `9.0`, so the one-finding stop stays one finding |
| [`hooks-run.jsonl`](./fixtures/hooks-run.jsonl) | Not written by hand: what the Claude Code hook pack actually produced from a real two-subagent session. Exercises correlation, not the invariants — see below |

```sh
nullius witness validate spec/fixtures/valid-run.jsonl   # exit 0
nullius witness validate spec/fixtures/v0.1-run.jsonl    # exit 0, read as 0.1
nullius witness validate spec/fixtures/broken-run.jsonl  # exit 1, six findings
nullius witness validate spec/fixtures/future-run.jsonl  # exit 1, one finding
nullius witness validate spec/fixtures/hooks-run.jsonl   # exit 0, and nobody typed it
```

`hooks-run.jsonl` is the only one nobody typed, and it is worth being exact
about what that buys. It is evidence about the **recorder**: that a producer
exists, that the harness sends what the probes say it sends, and that two
subagents running at once land on the right dispatches — none of which a
hand-written fixture can show, and one of which reasoning got wrong until a
real run said so ([the probes](./fixtures/probes/claude-code/README.md)).

It is not evidence that the invariants bite. Its outcomes are `2 found, 0
empty, 0 no-report`, so invariant 1's three-way distinction is degenerate
there; it carries no `verification`, `reliance`, or `append`, so invariants 2
and 3 are untouched, and its single `mutation` advances a hash map nothing
reads. That is a property of the tier, not of the fixture: hooks emit
`dispatch`, `report`, and `mutation` and can emit nothing else, because no tool
call states that something was *checked*, *relied upon*, or *corrected*. Those
records need an author with intent — the self-reported tier — and the
hand-written fixtures above are what exercise them until a producer for that
tier exists.

Worth wiring into CI alongside the document check — a validator that stops
catching these is one nobody would notice going quiet.

## Scope

The validator checks that a journal's own account of itself holds up. It cannot
tell you the recorded work was done well, that a `found` finding is real, or
that a `statement` is honest — those are claims about the world, and the way to
check one of those is an [Evidence Anchor](./evidence-anchors.md).

What it does buy: a run that dropped agents on the floor stops summarising
identically to one that finished.
