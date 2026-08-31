---
name: project-add-run-ledger-producer
description: Post-review audit of add-run-ledger-producer (HEAD 7968594, uncommitted) — one real blocker, three unstamped proposal.md anchors
metadata:
  type: project
---

Audited 2026-08-31, post-review (uncommitted diff) mode, dispatched from
`proposal-to-pr` on branch `feat/add-run-ledger-producer`. Findings:

- **Real blocker:** `openspec/changes/add-run-ledger-producer/proposal.md`
  gained 3 new `**Evidence:**` lines with no `@hash` stamp, citing code that
  now exists post-implementation (`record.ts:763`, `hooks.json:3`,
  `cli.ts:168`) — replacing older *absence* anchors (`grep ... → 0 results`)
  that had also been unstamped. Every sibling anchor in this same change
  (design.md, tasks.md, review-evidence.md, most of proposal.md) IS stamped
  `@c8305b1`. `rev-stamp-change-anchors.md` draws no exception for anchors
  added post-hoc to describe completed work vs. anchors citing code "about
  to be modified" — the rule's own text says "every anchor... from the
  first draft," full stop. Worth checking on future proposal-mode audits of
  this change once it's fixed: did the author stamp these at commit time or
  leave them bare.
- Also unstamped: a superseding `**Evidence:**` added to an **archived**
  change's `review-evidence.md`
  (`openspec/changes/archive/2026-08-30-add-journal-identity/`), citing
  `record.ts:763` with no `@hash`, while the rest of that file's anchors are
  stamped `@bcf228f`/`@f1b8211`. Editing an archived proposal to append a
  superseding note (rather than rewriting history) is itself fine and not a
  rule violation — the missing stamp on the *new* content is the issue.
- Everything else checked out as `[looks-good]`: `hooks.json` gained
  `UserPromptSubmit` pointing at the plugin's own `witness-record.sh`,
  `.claude/settings.json` untouched (`one-delivery-mechanism.md`);
  README/kit-README/plugin-README/spec/witness-journal.md anchors citing
  uncommitted code are correctly *unstamped* (those files aren't under
  `openspec/changes/**`, so no stamp rule applies — they're checked against
  working tree at commit time); no anchor was repointed under an old stamp
  (`git diff` shows zero removed `@c8305b1` lines — all such anchors are net
  new, so STALE verdicts on them are passive drift, not violations); every
  new `witness.ts` rejection (expects, per-record origin, user.name, prompt
  shape) has both a fixture (`spec/fixtures/v0.6-{run,broken-run}.jsonl`,
  `v0.5-compat-run.jsonl`) and a named unit test in `witness.test.ts`;
  `pnpm build` (ci.yml:70) precedes every new CLI-invoking step;
  `extractFindings` in `record.ts` is pure regex extraction of a reviewer's
  `[tag]` lines into structured records — no model judgement re-enters as a
  trusted verdict (`model-proposes-code-verifies.md`).

See also [[feedback_anchor_verification_method]] for the diff-based
"no removed `@hash` line at that stamp" trick used to rule out repointing
without opening every file.
