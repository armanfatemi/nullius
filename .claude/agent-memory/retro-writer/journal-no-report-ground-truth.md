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
