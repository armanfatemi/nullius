# Add oracle conservation — a change to the thing that grades the work is accounted for

## Why

An agent's work is graded by an artifact the agent can edit. Tests, golden
files, snapshots, fixtures — all of them are the oracle, and all of them are
writable by the thing being measured. When a change makes a test fail there are
two ways to get back to green, and they produce identical output: fix the code,
or fix the test.

Sometimes editing the test is right — an implementation may genuinely change
the contract. That is why the blunt check is wrong here: "no test changed" is a
port-time invariant, not a development rule, and a gate that forbids all test
edits gets disabled in a week.

The tractable question is not whether the oracle changed. It is **whether the
change was accounted for.** A machine cannot decide that an assertion *should*
have been loosened; it can decide, completely and deterministically, whether
anybody said why.

That failure has a shape this repo already refuses elsewhere: something
happened, and nothing in the record answers it. `SUPPRESSED-FINDING` is a
blocker no resolution answers. This is a weakened oracle no decision justifies.

### Why the journal cannot be the source

The obvious source is the `mutation` record, which already carries
`{path, hash}`. It cannot do this job. Mutations come from tool-call hooks, and
the matcher covers editing tools only:

**Evidence:** `plugin/hooks/hooks.json:25@012786a` — `        "matcher": "^(Task|Agent|Edit|Write|MultiEdit|NotebookEdit)$",`

Nothing in the hook pack or the recorder watches `Bash`:

**Evidence:** `grep -rn 'Bash' plugin/hooks/hooks.json packages/kit/src/record.ts` → 0 results

So `rm test/foo.test.ts`, `git rm`, a `mv`, or any script-driven deletion
leaves no record at all — and deletion is the highest-risk edit there is. The
tier that is normally the *stronger* attestation, because the agent cannot
decline it, is the weaker one for this single question, because its coverage
has a hole exactly where the risk lives.

**Git is the better witness here.** History is the one artifact an agent cannot
quietly revise, and a diff over a commit range is complete: it sees deletions,
renames, and edits made by any means, including ones no hook fired for. The
kernel already reads git under a timeout:

**Evidence:** `packages/claims/src/runners.ts:149@012786a` — `export function revFileReader(root?: string, timeoutMs = DEFAULT_GIT_TIMEOUT_MS) {`

## What Changes

- **`oracles` config key** (kernel): declared globs naming what grades this
  project, alongside the eight keys the config already knows:

  **Evidence:** `packages/claims/src/config.ts:51@012786a` — `const KNOWN_KEYS = new Set([`

  Optionally per-glob `weakening` patterns — a declared regex whose match count
  is compared across the range. A project with no `oracles` configured reports
  `??`, never a silent zero: a config that matches nothing must not be able to
  say "no oracle changed".
- **`nullius oracle <range>`** (kernel): diffs the range against the declared
  globs and classifies each change from a closed vocabulary — `deleted`,
  `skipped`, `weakened` are **hard**; everything else is listed and advisory.
  Hard changes are the whole point of the split: flagging every test touch
  trains readers to skim, which is how the last gate died.
- **`decision.justifies`** (kernel, schema): an optional object
  `{path, change}` on the existing `decision` kind, naming the hard change a
  decision accounts for. Reusing `decision` rather than adding a kind is
  deliberate — the vocabulary does not grow, and `choice` plus `rationale` is
  already the shape "why we did this" wants:

  **Evidence:** `packages/claims/src/witness.ts:997@012786a` — `            detail: 'a decision needs a non-empty "choice" — the approach taken',`

- **`UNJUSTIFIED-ORACLE-CHANGE`** (kernel): a hard change no `decision`
  justifies. It lands in a new `OracleVerdict` union rather than the kernel's
  exported `Verdict`, following the precedent set for rules:

  **Evidence:** `openspec/changes/add-rules-compliance/tasks.md:7@012786a`

  ```
  - [ ] 1.2 `RuleVerdict` union (separate from `Verdict`): `UNGROUNDED-RULE`,
  ```

- **No schema version bump.** `justifies` is additive optional metadata that no
  journal verdict reads, and no record parser rejects unknown fields. The rule
  this change follows was written down one commit ago:

  **Evidence:** `openspec/changes/add-journal-identity/design.md:115@012786a` — `> A version bump is required when the set of valid records changes — a new`

## Impact

- Affected specs: `oracle` (new), `witness` (modified — `decision.justifies`).
- Affected code: kernel (`config.ts`, a new `oracle` module, `cli.ts`), and the
  Action, which gains the range it already has on a pull request.
- `witness validate` is unchanged and emits no new verdict. A journal carrying
  `justifies` validates identically to one without it.
- Composes with the existing verbs rather than duplicating them. The weakening
  comparison is a declared pattern counted at two revisions, which is the
  absence lane's arithmetic pointed at history rather than at the working tree:

  **Evidence:** `packages/claims/src/commandSafety.ts:31@012786a` — `const ALLOWED_BINARIES = ["grep", "rg"] as const;`

## Non-Goals

- **Judging whether the change was correct.** The verdict certifies that a
  reason was recorded, never that the reason is good — the same limit `check`
  advertises, in a new place. What this buys is a set small enough that a human
  will actually read it.
- **A verdict for a justification with no matching change.** The inverse
  failure (a decision accounting for an edit that never happened) is real and
  cheap, and is deferred so that v1 ships one verdict people can learn.
- **Language-aware assertion parsing.** `weakened` is a declared pattern's
  count, not a parsed syntax tree. A project that wants precision writes a
  better pattern; the checker never grows a parser per language.
- **Blocking by default.** Advisory first, like every other gate here.
