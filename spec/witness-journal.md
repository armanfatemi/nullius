# The Witness Journal

**Version 0.5 — draft.** The record a multi-agent run leaves behind, and the
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
`id`. Six record kinds, plus the header:

| Kind | Purpose | Required fields |
| --- | --- | --- |
| `journal` | The header: which schema, and whose account | `version`, `origin` |
| `dispatch` | A unit of work handed to an agent | `id` |
| `report` | The terminal record for one dispatch | `dispatch`, `outcome`, and `findings` or `statement` |
| `verification` | Something was checked against an artifact | `target: {path, hash}` (optionally `rev`) |
| `mutation` | An artifact was changed | `target: {path, hash}` (never `rev`) |
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

### The run ledger — five more kinds, v0.3

The kinds above record *that* work happened. They cannot record what an agent
raised, whether anyone answered it, or why an approach was chosen — so a
journal can say `rule-auditor` reported without saying what it said.

Schema `0.3` adds five kinds for that account. Their vocabulary is derived from
a 91-file corpus of hand-written evidence files rather than invented; the
derivation, including four claims it overturned, is in
[`openspec/changes/add-run-ledger/corpus-derivation.md`](../openspec/changes/add-run-ledger/corpus-derivation.md).

| Kind | Purpose | Required fields |
| --- | --- | --- |
| `stage` | A pipeline phase and iteration, so a journal groups the way the run ran | `phase` |
| `finding` | Something an agent raised | `severity`, `author`, `text` |
| `resolution` | A finding's fate | `finding`, `outcome`, `text` |
| `check` | A command ran, and what it showed | `command`, `outcome`, `text` |
| `decision` | An approach was chosen, and why | `choice`, `rationale` |

A `decision` MAY also carry `justifies` (v0.5), an object of `path` and
`change`, naming a hard oracle change the decision accounts for:

```jsonl
{"kind":"decision","id":"dec1","choice":"loosened the retry timing assertion","rationale":"the helper now backs off exponentially, so a fixed bound asserted the old contract","justifies":{"path":"test/retry.test.ts","change":"weakened"}}
```

**`witness validate` does not read this field**, not even to reject a malformed
one, and reports the same findings for a journal carrying it as for one without.
Its meaning and its validation belong to `nullius oracle`, the only consumer that
means anything by it: `change` is closed to `deleted`, `skipped`, `weakened`, and
a blank `path` or an unrecognised class is `MALFORMED-JUSTIFICATION` there.

The referent is a derived pair, never a record id. `oracle` computes
`(path, change)` from a diff and the producer writes the same pair from the same
diff, so the two meet without either knowing the other's ids — which is the
point, because the deletions most worth catching are made by tools that emit no
`mutation` record to refer to.

```jsonl
{"kind":"journal","version":"0.3","origin":"self-reported","session":"2f9c1a4e","source":"startup"}
{"kind":"stage","id":"s1","phase":"pre-review","iteration":1,"change":"add-run-ledger"}
{"kind":"finding","id":"f1","stage":"s1","dispatch":"d1","ref":"B1","severity":"blocker","author":"rule-auditor","convergence":["architecture-reviewer"],"text":"the precheck uses exit 1, which does not block"}
{"kind":"resolution","id":"res1","finding":"f1","outcome":"fixed","text":"flipped both exit paths to exit 2"}
{"kind":"check","id":"c1","command":"pnpm test","outcome":"pass","counts":{"passed":334},"text":"suite green"}
{"kind":"decision","id":"dec1","choice":"gate the verdict to blockers","rationale":"ungated it fires on 60.8% of findings","resolves":"Decision 6"}
```

Three fields carry closed vocabularies, and one deliberately does not:

- `severity` is exactly `blocker`, `concern`, `looks-good`. `looks-good` is not
  decoration — an explicit nothing-found is how a reviewer proves it was not
  silent, which is what discharges `SILENT-REVIEWER`.
- `resolution.outcome` is `resolved`, `fixed`, `dropped`, `duplicate`,
  `deferred`, `folded-in`, `accepted`, `rejected`, `out-of-scope`,
  `deviation-accepted`. `duplicate` and `folded-in` also require `merges_into`:
  they redirect a finding rather than closing it, and without the survivor's id
  a merge is indistinguishable from dropping it.
- `check.outcome` is `pass` or `fail`. A `check` is **not** a `verification` —
  it makes no claim about a file's hash, so nothing goes stale against it.
- `stage.phase` is an **open string**. `pre-review`, `verify`, `post-review`,
  `address`, and `refine` are conventional, but a closed enum would have
  rejected about 5% of the corpus this was derived from, and a schema that
  discards real records to enforce a tidiness nobody practised is worse than an
  untidy one.

`change` binds to `stage` rather than to the header, because one session
touches several changes and one change spans several sessions.

## The header — which schema, and whose account

The first record may be a `journal` header. It carries `version` (the schema
the records below are written to; this build reads `0.1`, `0.2`, `0.3`, and
`0.4`), `origin`, and optionally `session` and `source` (`startup` / `resume` /
`clear` / `compact`) plus the three identity fields below. A resumed session
gets a new id and therefore a new journal file, so recording `source` makes a
fork in journal identity visible rather than mysterious.

Header keys the validator does not recognise are **ignored, not reported**, so
a journal from a newer producer stays readable by an older build. That rule is
what makes the one exception in this schema — a `mutation` carrying `rev` — an
exception that has to be argued rather than assumed; see below.

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

### Where the run began — `branch`, `head`, `worktree` (v0.4)

Three optional header fields recording *place*. The journal already records
time well; without these it cannot answer "which tree was this", "did these two
worktrees agree about `src/parser.rs`", or "where is the journal for the run
that produced this commit".

| Field | Means |
| --- | --- |
| `branch` | The branch checked out when the run began |
| `head` | **The commit the session started from** |
| `worktree` | A stable identifier for the worktree — never a filesystem path |

`head` is defined as *where the run began*, and the definition is the whole of
the field. HEAD moves during a session — in the runs this is built for, many
times an hour — so `head` is true at exactly one instant, and the tempting
second reading ("the tree this record was written against") is stale by
construction for every record but the first. Anything that needs a per-claim
revision uses `verification.rev` instead.

On a detached HEAD, `branch` is **omitted**. Not `"HEAD"`, not `"(detached)"`:
a sentinel invented here would be a fact nobody can check, and absence already
says exactly the right thing. Absence is likewise how a producer says git could
not answer at all — no repository, no git binary, a call that timed out.

No verdict reads any of the three. They are recorded so that a later question
can be asked of a corpus, not so that a journal can fail on them.

**They must not be empty when present.** On a journal declaring `0.4` or later,
`branch: ""` is `MALFORMED`, and the finding names the offending field. An
empty string is a producer asserting it knows the branch and naming none, which
is a different and worse fact than omitting the key.

That is deliberately asymmetric with `session` and `source`, which accept `""`
silently and record it as absent, and the asymmetry is worth stating rather
than leaving to be discovered. `session` and `source` are *labels for this
journal*: a blank one is uninformative, and nothing downstream will be misled
by it, because nothing correlates journals by session id. The identity fields
are *claims about a tree*, and they exist to be compared across journals — so a
blank one is not merely uninformative, it is a value that compares equal to
every other blank one and would group unrelated runs together. The rule follows
the use, not the type. Nothing here proposes tightening `session` or `source`;
doing so would be its own tightening and would take its own version bump.

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

**Evidence:** `packages/claims/src/witness.ts:153@554c3ac` — `const OUTCOMES = ["found", "empty", "no-report"] as const;`

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

**Evidence:** `packages/claims/src/witness.ts:825@554c3ac` — `        if (latest !== undefined && latest.hash !== source.hash) {`

### `rev` — what a verification was checked against (v0.4)

A `verification` may carry `rev`: the revision the claim was checked at, so it
can be re-checked later against something immutable rather than against
whatever the tree says today. It is the only kind that may carry one, because
it is the only kind making a claim intended to be checked again.

`rev` is **lower-case hexadecimal, 7 to 40 characters** — the shape a *stamp*
is written in, and the same constant an Evidence Anchor's rev is validated
against. A ref name such as `main` is `MALFORMED`: it is mutable, it names a
different tree next week, and that staleness is precisely what pinning a
revision exists to escape.

This is deliberately stricter than the grammar an anchor *marker* is parsed
with, which accepts mixed case and folds it on the way in. That leniency is for
a human typing a citation. A journal is written by a machine and has no author
to be lenient toward, and one canonical spelling keeps two `rev` values naming
one commit comparable by string equality.

Absence of `rev` is not a finding. A verdict that reads the field would be a
new verdict, and takes its own version bump with it.

A `mutation` **may not carry `rev` at all**, and one that does is `MALFORMED`
rather than ignored. This is the only place the schema hard-fails a well-formed
extra key, so the criterion is narrow and stated here rather than left to be
generalised:

The criterion is **not** "a known key on a record that cannot carry it". That
would prove far too much — `target` on a `dispatch`, `severity` on a `check`,
`merges_into` on a non-merge `resolution` are all ignored today and stay
ignored, as do header keys this build has never heard of. A future author must
not derive further rejections from this one.

The criterion is the specific false belief the key encodes. `rev` means *this
claim can be checked again*. A mutation asserts that something changed, which
is the opposite of a claim to re-check; its target hash is already the identity
of what changed. So a producer emitting `mutation.rev` is not merely misfiling
a key — it holds a wrong model of what a mutation is, and every record it
writes is suspect for the same reason. Ignoring the key would let that model
persist silently. No other misplacement in this schema carries a comparable
implication about its producer, which is why no other misplacement is refused.

Both rejections apply **only to journals declaring `0.4` or later**. A record
that validated clean under `0.3` does not become invalid because the validator
learned a newer schema.

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
| `SUPPRESSED-FINDING` | A `blocker` no resolution answers (v0.3) | ❌ |
| `SILENT-REVIEWER` | A dispatch that reported `found` and filed no finding (v0.3) | ❌ |

The last two apply to journals declaring `0.3` **or later**. Gating them on the
version is what keeps every earlier journal's output identical: none of them
can carry a `finding`, so ungated, all of them would acquire `SILENT-REVIEWER`
at once.

The gate is a **floor**, not an equality, and that is load-bearing rather than
stylistic. It was written as `version === "0.3"`, and adding `0.4` to the
readable list without converting it would have left every `0.4` journal ungated
for both verdicts with nothing failing: CI green, every fixture exiting as this
table says, and a family of verdicts gone quiet for the newest schema only. The
floor compares by **index into the ordered version list**, never by string —
`"0.10" >= "0.3"` is false, and a lexicographic floor merely defers the same
silent ungating to a version nobody is looking at yet.

`SUPPRESSED-FINDING` is gated to `blocker` for a measured reason. In the corpus
it was derived from, 59 of 97 identified findings (60.8%) are never mentioned
again — so an ungated verdict would fire on three findings in five and be
learned as noise. `concern` and `looks-good` go unpoliced. The honest limit:
"never mentioned again in the same file" is a proxy for "never resolved", since
a finding may be answered in a commit or a PR thread. It justifies the
verdict's existence; it does not predict its rate under a producer that knows
the rule.

## When the schema version bumps

This is the canonical statement of the rule. It lives here rather than in a
change proposal because proposals are archived and a citation into one rots.

The version bumps when **the set of valid records changes**:

1. a new kind;
2. a new member of a closed vocabulary;
3. a **tightening** that makes invalid a record a previous version accepted;
4. a new verdict that can fail a record.

It does **not** bump for additive optional metadata that no verdict reads.

All four triggers travel together, and a restatement that carries three of them
is how this rule decays — it has already happened twice, once by dropping the
tightening clause and once by dropping the new-verdict clause. Any restatement
elsewhere carries all four or points here.

Two clarifications the rule cost something to learn:

- **A field being optional does not exempt a change.** Optionality is a
  property of a field; validity is a property of a record. `verification.rev`
  and the header's identity fields are all optional, and `0.4` is still a bump,
  because refusing a key that was previously ignored makes a previously valid
  record invalid. The v0.4 bump is owed entirely to clause 3 — the additive
  fields alone would not have earned one.
- **A verdict in another command still fires clause 4.** `0.5` is owed to
  `nullius oracle`, which introduces `MALFORMED-JUSTIFICATION` — a verdict that
  reads `decision.justifies` and fails the record carrying it. `witness
  validate` never reads the field, and every `0.4` journal stays valid, so
  clauses 1 to 3 are all untouched. Three drafts of that change argued their way
  to no bump: that it tightens nothing (true, and irrelevant); that clause 4
  means a verdict *this validator* emits (a qualifier the clause does not carry);
  and that nothing previously valid becoming invalid is what every clause
  measures (false — clauses 1 and 2 fire without invalidating anything, and the
  reading collapses clause 4 into clause 3, erasing it). The exemption says
  *no verdict reads it*, without qualification. A verdict reads it, so the
  exemption is unavailable and clause 4 fires on its own terms.
- **A version-gated verdict uses a floor, never an equality.** A later version
  inherits every verdict its predecessor earned. A verdict silently ungated by
  a bump is indistinguishable from a verdict that was never reached, which is
  the failure mode this whole tool exists to refuse.

Bumping is not free, which is why the criterion is the set of valid records
rather than the presence of new fields: an older validator reading a newer
journal stops at `UNSUPPORTED-VERSION` and reports **nothing at all**. A bump
that buys no diagnostic power costs real coverage.

## Fixtures

Ten journals live next to this spec:

| Fixture | What it is for |
| --- | --- |
| [`valid-run.jsonl`](./fixtures/valid-run.jsonl) | A v0.2 journal exercising all three terminal states, a mutation, and a live reliance |
| [`broken-run.jsonl`](./fixtures/broken-run.jsonl) | Breaks each invariant at least once, including both mutation failures |
| [`v0.1-run.jsonl`](./fixtures/v0.1-run.jsonl) | Headerless, to keep v0.1 compatibility a thing CI checks rather than a thing README claims |
| [`future-run.jsonl`](./fixtures/future-run.jsonl) | Declares version `9.0`, so the one-finding stop stays one finding |
| [`hooks-run.jsonl`](./fixtures/hooks-run.jsonl) | Not written by hand: what the Claude Code hook pack actually produced from a real two-subagent session. Exercises correlation, not the invariants — see below |
| [`v0.3-run.jsonl`](./fixtures/v0.3-run.jsonl) | A v0.3 run exercising all five ledger kinds, both merge outcomes, and a `looks-good` finding discharging a dispatch |
| [`v0.3-broken-run.jsonl`](./fixtures/v0.3-broken-run.jsonl) | Trips both ledger verdicts and every new `MALFORMED` and `DANGLING-REFERENCE` path — including a blocker whose only resolutions are themselves malformed, which must not discharge it |
| [`v0.4-identity-run.jsonl`](./fixtures/v0.4-identity-run.jsonl) | A v0.4 run carrying all three identity fields and a rev-stamped verification, and earning a ledger verdict's silence at a version the gate used to exclude |
| [`v0.4-broken-run.jsonl`](./fixtures/v0.4-broken-run.jsonl) | Trips all three of v0.4's new rejections: `branch: ""`, a `rev: "main"` verification, and a `mutation` carrying `rev` |
| [`v0.3-compat-run.jsonl`](./fixtures/v0.3-compat-run.jsonl) | The same bytes as `v0.4-broken-run.jsonl` apart from the declared version — and it must exit 0, because a record valid under `0.3` stays valid |
| [`v0.5-run.jsonl`](./fixtures/v0.5-run.jsonl) | A v0.5 run carrying two `decision` records with well-formed `justifies` — accepted and uninterpreted, because the field belongs to `oracle` and the journal only stores it |
| [`v0.5-broken-run.jsonl`](./fixtures/v0.5-broken-run.jsonl) | Trips v0.4's three rejections at v0.5, since a later version inherits every verdict its predecessor earned |

```sh
nullius witness validate spec/fixtures/valid-run.jsonl   # exit 0
nullius witness validate spec/fixtures/v0.1-run.jsonl    # exit 0, read as 0.1
nullius witness validate spec/fixtures/broken-run.jsonl  # exit 1, six findings
nullius witness validate spec/fixtures/future-run.jsonl  # exit 1, one finding
nullius witness validate spec/fixtures/hooks-run.jsonl   # exit 0, and nobody typed it
nullius witness validate spec/fixtures/v0.3-run.jsonl    # exit 0, all five ledger kinds
nullius witness validate spec/fixtures/v0.3-broken-run.jsonl  # exit 1, 26 findings
nullius witness validate spec/fixtures/v0.4-identity-run.jsonl # exit 0, identity in the header
nullius witness validate spec/fixtures/v0.4-broken-run.jsonl  # exit 1, three findings
nullius witness validate spec/fixtures/v0.3-compat-run.jsonl  # exit 0, the same three records
nullius witness validate spec/fixtures/v0.5-run.jsonl     # exit 0, justifies stored and not read
nullius witness validate spec/fixtures/v0.5-broken-run.jsonl  # exit 1, v0.4's rejections inherited
```

The last two are a pair, and only the pair proves anything: identical records
at two declared versions, one failing three ways and one clean. Either alone
passes with the version predicate written backwards.

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
