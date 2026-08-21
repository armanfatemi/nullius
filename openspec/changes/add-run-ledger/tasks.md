# Tasks — add-run-ledger

Scope is the kernel only. The producer skill, `witness record`, and
`witness harvest` are a follow-up change — see the proposal's deferred section.

## 1. Version plumbing

- [x] 1.1 Add `KINDS_V03` (v0.2 kinds plus `stage`, `finding`, `resolution`,
      `check`, `decision`) and `"0.3"` to `VERSIONS`
- [x] 1.2 Replace the version→vocabulary ternary at `witness.ts:307` with a
      lookup — it stops scaling at three versions
- [x] 1.3 Regression test: a ledger kind in a v0.2 journal is `MALFORMED` and
      names `0.3`, exactly as `mutation` does under v0.1

## 2. Record parsers

- [x] 2.1 `stage` — non-empty `phase` (open string), optional `iteration`,
      `pr`, `change`
- [x] 2.2 `finding` — closed `severity`, free-string `author`, required `text`;
      optional `stage`, `dispatch`, `subject`, `ref`, `convergence[]`
- [x] 2.3 `resolution` — closed `outcome`, required `finding` ref and `text`;
      `merges_into` required when `outcome` is `duplicate` or `folded-in`
- [x] 2.4 `check` — `command`, `outcome` (`pass`/`fail`), `text`, optional
      `counts`; excluded from `STALE-VERIFICATION`
- [x] 2.5 `decision` — required `choice` and `rationale`; optional
      `departed_from`, `resolves`
- [x] 2.6 Wire `stage` / `dispatch` / `finding` / `merges_into` references into
      the existing `DANGLING-REFERENCE` check

## 3. The two verdicts

- [x] 3.1 `SUPPRESSED-FINDING` — a `blocker` finding no `resolution`
      references. Gated to `blocker`; `concern` and `looks-good` unpoliced
- [x] 3.2 `SILENT-REVIEWER` — a `dispatch` with a `found` report that no
      `finding` references. A `looks-good` finding discharges it
- [x] 3.3 Gate both on the journal declaring `0.3`, so no existing journal
      acquires a finding

## 4. Spec and fixtures

- [x] 4.1 `spec/witness-journal.md`: the five kinds, the two verdicts in the
      verdict table, and v0.3 in the format section
- [x] 4.2 `spec/fixtures/v0.3-run.jsonl` — a valid run exercising all five
      kinds, both merge outcomes, and a `looks-good` discharging a dispatch
- [x] 4.3 `spec/fixtures/v0.3-broken-run.jsonl` — trips both new verdicts plus
      every new `MALFORMED` and `DANGLING-REFERENCE` path (26 findings)
- [x] 4.4 Re-pin the two `spec/witness-journal.md` anchors. Both moved
      (`123`→`127`, `546`→`689`) and were reported `STALE`, which is advisory.
      Re-stamped at `e20533f`, the commit the file was read at, so both now
      verify `OK` — a bare line number would have gone stale again on the next
      edit. Note the trap: repointing the line while keeping `@e505e32` would
      have turned an advisory `STALE` into a hard `FABRICATED`, because the
      text was not on that line at that commit.


## 5. Verification

- [x] 5.1 Prove the compatibility claim: all five pre-existing fixtures keep
      their exit codes and verdicts. Proven by diffing a HEAD build against the
      working tree. Not byte-identical, and it must not be: `UNSUPPORTED-VERSION`
      enumerates the readable schemas, so `future-run`'s message gains `0.3`
- [x] 5.2 `pnpm build && pnpm type-check && pnpm test` green, with counts
      recorded
