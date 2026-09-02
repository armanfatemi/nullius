---
name: journal-no-report-ground-truth
description: The session witness journal's `outcome:"no-report"` records are deterministic ground truth for dispatches that returned nothing — count and timestamp them instead of trusting the evidence file's prose
metadata:
  type: project
---

When `review-evidence.md` claims a dispatch round "returned nothing", verify it
against the live session journal rather than accepting the prose:

```sh
f=$(ls -t .nullius/runs/*.jsonl | head -1)
grep -o '"kind":"[a-z_]*"' $f | sort | uniq -c            # dispatch vs report totals
grep '"outcome":"no-report"' $f | grep -o '"at":"[^"]*"'  # when, and how many
grep '"kind":"dispatch"' $f | grep -o '"agent":"[^"]*"' | sort | uniq -c
```

**Why:** on `add-run-ledger-producer` (PR #74, 2026-08-31) the file claimed two
lost rounds — "dispatched 4, delivered 0" and "delivered 1 of 4". The journal
held exactly 7 `no-report` records, clustered at `T06:29:08Z` (4) and
`T15:59:09Z` (3), matching both claims by code. That turns a coordinator
assertion into a measurement, which is the whole point of this role. The agent
histogram also gives per-agent dispatch counts the evidence file never states
(29 reviewer dispatches there, so 24% returned nothing), and `dispatch` minus
`report` = 1 is normally the retro dispatch still in flight — a useful sanity
check that you are reading the right session's journal.

**How to apply:** the journal is gitignored and its header `branch`/`head` name
where the *session* started, not the PR branch, so identify it by mtime and by
the timestamps lining up with the run — do not expect the branch to match. Cheap
(three greps), and it is the only signal in this role that is not somebody's
account of themselves. See [[where-coordinator-errors-surface]].

**Two refinements from `add-pr-process-report` (PR #75, 2026-09-02).**

1. **`no-report` does not see a dispatch that returned the WRONG thing.** That
run's evidence file records one genuinely lost reviewer round (checker-engineer,
pre-review 4, "returned only a memory-update line and no report"). The journal's
two `no-report` records are *not* it — both are implementer (`general-purpose`)
dispatches sealed at session end ("never terminated; the session ended (other)")
whose code landed, i.e. recorder artefacts, not lost work. So `no-report` is
ground truth for *returned nothing* and blind to *returned the wrong thing*.
Check the statement of every `no-report` record before crediting it to a round
the prose describes.

2. **The per-agent `dispatch` histogram corroborates round COMPOSITION, cheaply.**
That run: checker-engineer 7, architecture-reviewer 6, rule-auditor 5,
test-engineer 5 — which reproduces all six rounds exactly, including a
pre-flight drop, a substitution, and one re-dispatch. One grep turns the whole
dispatch account into a measurement.

3. **`decision` records beat the prose record for human interventions.** Read
them directly as JSON (never through `validate`, which rejects 0.3+ kinds under a
0.2 header). `choice` + `rationale` gave that run's six human decisions verbatim
— including a `--max-refine` raise that appears NOWHERE in `review-evidence.md`.
The ledger caught what the prose missed. Command:

```sh
python3 -c "import json,sys
for l in open(sys.argv[1]):
    r=json.loads(l)
    if r.get('kind')=='decision': print(r['choice'],'|',r.get('rationale'))" .nullius/runs/<id>.jsonl
```
