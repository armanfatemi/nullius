---
description: Check a plan's or diff's compliance with this repo's rule files — deterministic selection, one starved brief per rule, verdicts re-checked against the plan
---

Rule compliance is checked in deterministic steps around one dispatch step.
The protocols live in the CLI so they cannot drift from the checker. Emit
them and follow them exactly.

## Determine the touch-list

`$ARGUMENTS` names either a plan and lets its touch-list be derived, or the
touch-list itself:

- If `$ARGUMENTS` is one or more repo-relative paths (no spaces, each ending
  in a known extension), use them directly as the touch-list.
- If `$ARGUMENTS` names one markdown file, treat it as the plan and derive
  its touch-list from every backticked, repo-relative path with a known
  extension (`.ts`, `.md`, `.json`, `.jsonl`, `.yml`/`.yaml`, `.sh`) that it
  mentions — the same convention `nullius-kit pipeline touched-areas` uses to
  derive a proposal's own touched paths.
- If `$ARGUMENTS` is empty, use the most recently modified `.md` file in the
  plans directory (`.claude/plans` or `~/.claude/plans`, newest first) as the
  plan, and derive its touch-list the same way.

Call the touch-list `<paths...>` below and the plan (if one was used) `<plan>`.

## 1. Select the rules that bind

```sh
npx -y @nullius-inverba/claims rules select --paths <paths...>
```

Deterministic, no model involved: it prints the id of every rule under
`.claude/rules/` whose `applies_to` matches at least one path in the
touch-list, then the excluded count. Keep the excluded count — report it to
the user later even if it is zero, because a selection that silently narrows
is the failure this verb exists to prevent.

If zero rules are selected, say so and stop: there is nothing to dispatch,
and that is a real answer, not a failure to find work.

## 2. Dispatch one starved brief per selected rule

For **each** rule id `rules select` printed:

```sh
npx -y @nullius-inverba/claims rules select --paths <paths...> --emit-brief <rule-id>
```

This prints one starved compliance brief on stdout, and nothing else — the
rule's id and full text, plus the touch-list, with no sibling rules, no plan
rationale, no narrative.

Dispatch each brief to its **own** subagent, and give that agent the brief
and nothing else — no plan, no other rules, no summary of what you are doing.
The starve is the mechanism: rules presented together imply a story, and a
model handed a story reconciles them into one. Do not "helpfully" add
context.

When you dispatch, set the Task/Agent tool's `description` parameter
explicitly to the **bare rule id, and nothing else** — e.g.
`description: "one-delivery-mechanism"`, not `"comply:
one-delivery-mechanism"` or any other prefixed form. Step 4 below matches a
journal's dispatch `task` field against a rule id by **exact string
equality** — a prefix, a label, or any other decoration breaks that match
silently: every dispatch would report `SILENT-RULE`, and CI's fixtures
(which use bare ids) would stay green while every real run failed. This is
not cosmetic: the run's journal records a dispatch's `task` field from
`description` if given, and only falls back to the first line of `prompt`
otherwise — and a starved brief's rule id sits on its 7th rendered line, not
its first. Skip the explicit `description` and the journal carries the
brief's generic opening sentence instead of the rule id, and step 4 has
nothing to match against either way.

## 3. Collect verdicts

Each subagent's answer quotes the rule id back — a read-receipt proving the
rule reached it, not one recalled from memory — followed by exactly one
verdict:

- **COMPLIANT** — the rule binds, and the touch-list honors it. Carries an
  anchor into the specific text that shows this.
- **VIOLATION** — the rule binds, and the touch-list does not honor it.
  Carries an anchor into the specific text that violates it.
- **NOT-APPLICABLE** — nothing in the touch-list triggers this rule. No
  anchor — it asserts an absence, not a finding.

`COMPLIANT` and `VIOLATION` both require an anchor, and both are re-verified
the same way, not `COMPLIANT` on a lighter gate: verify each anchor exactly
as `/audit` re-verifies a `REFUTED` counter-claim.

```sh
npx -y @nullius-inverba/claims check <plan>
```

Never overrule a subagent's verdict from your own reading of the plan — that
is the correlation the split exists to break. If a `COMPLIANT` or `VIOLATION`
anchor fails to verify, say so specifically: a `FABRICATED` or
`COUNT-MISMATCH` verdict is not a citation typo, and the finding it supported
needs re-examining, not silent acceptance.

## 4. Verify journal coverage

Close the loop against the run's own journal: did every rule dispatched in
step 2 actually reach a delivered verdict, not just get sent out.

Journals are keyed by session id, and there is no environment variable or
other mechanism that exposes the current session's id to a command's
shell-based instructions. So locate the journal the way `/audit` and
`/ground` locate a plan with no reliable pointer: the most recently modified
`.jsonl` file under `.nullius/runs/`, newest first. **This is a heuristic,
not a guarantee** — under concurrent sessions or worktrees the newest file
need not be *this* run's journal, so treat a surprising result with that in
mind rather than as settled fact.

If `.nullius/runs/` does not exist at all, `.nullius/` is not opted into for
this repository. Say so plainly and stop here — there is nothing to check,
which is a real answer, not an error to work around.

Otherwise, run:

```sh
npx -y @nullius-inverba/claims witness validate <journal> --expect-rules <rule-ids...>
```

against the journal located above, passing every rule id `rules select`
printed in step 1 as `<rule-ids...>` — the same ids dispatched in step 2, not
the excluded ones. This re-derives, from the journal's own bytes, whether
each rule's dispatch actually reached a delivered verdict — catching a rule
that never got dispatched, was dispatched but never reported, or reported
without a recognized verdict keyword, none of which step 3's collection
would notice on its own since it only sees the verdicts subagents actually
returned.

## 5. Report

One line per rule: its id, its verdict, and — for `COMPLIANT`/`VIOLATION` —
the anchor. Then the excluded count from step 1, so a silently-narrowed
selection stays visible to the user even when every reported rule passed.

Report any `SILENT-RULE` finding from step 4 with **exactly the same
prominence as a `VIOLATION`** — not a footnote, not folded into a closing
caveat. `SILENT-RULE` means a rule this run was supposed to check never
actually delivered a verdict; burying it defeats the entire point of running
step 4.

If the `rules` command is unavailable (older package version), tell the user
to update `@nullius-inverba/claims` rather than improvising the protocol.
The same applies to `--expect-rules` in step 4 specifically: it is newer
than `rules select` itself, so a published version recent enough for step 1
can still predate it. On an older version the failure reads `unknown option
for \`witness\`: --expect-rules` — an update problem, not a sign step 4's
instructions are wrong.
