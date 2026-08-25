---
name: advise-specialized-agents
description: Get review or advice on your work from this repo's four reviewer agents in `.claude/agents/`. The protocol is: list every candidate whose domain overlaps the change, write a one-line SPECIFIC justification of why each applies to THIS change, drop any whose justification is generic or duplicated by a narrower candidate, and dispatch only the survivors in parallel with focused, well-briefed requests. Use whenever the user says "get advice", "ask the experts", "review with the agents", "what do the specialists think", "second opinion", before committing a non-trivial change, and after finishing work that touches the checker kernel, the kit or the CLI, the plugin hooks, a spec-family document, an OpenSpec proposal, or the fixtures and CI gates. Focused dispatch beats blanket dispatch — value comes from agents that have a concrete piece of the change to look at, not from the count of agents.
dispatches:
  - rule-auditor
  - architecture-reviewer
  - checker-engineer
  - test-engineer
---

# Specialist agent consultation

Four reviewer agents live in `.claude/agents/`. Each reads a different body of
doctrine, and the boundaries between them are drawn in their own files rather
than left to the dispatcher's judgement: `rule-auditor` reads the glob-scoped
rule files, `architecture-reviewer` reads the prose invariants that nothing
scopes, `checker-engineer` reads the four kernel modules that decide a verdict,
and `test-engineer` reads whether the coverage proves what it claims. This
skill is the protocol for asking them to review or advise on work.

`proposal-to-pr` now consumes their reports
(`.claude/skills/proposal-to-pr/SKILL.md`). It dispatches this roster twice — at
Stage 2 against the proposal, at Stage 6 against the diff — routes on the
severity markers below, appends the synthesis to the change's committed
`review-evidence.md`, and hands that file to `retro-writer`. It borrows the
pre-flight and synthesis doctrine from this file rather than carrying a second
copy, so the two must not drift.

That covers work with an `openspec/changes/<name>/` behind it. Everything else
is dispatched by hand through this skill, and there nothing automatic is
watching: you are the reader of every report these agents produce, and the
synthesis step below is the only place their findings get reconciled.

## The roster is declared twice, and the two must agree

The frontmatter above carries `dispatches:`. That list is the roster — the one
`nullius wiring` actually reads, because its hard verdicts resolve declared
frontmatter fields and nothing else:

**Evidence:** `packages/claims/src/wiringScan.ts:156@555e5ee` — `dispatches: declaredList(front, "dispatches"),`

The table further down repeats the same four names for a human deciding whom to
dispatch. A name added to that table and not to the frontmatter is a roster
entry nobody checks: if the agent behind it does not exist, the dispatch
no-ops, and the run reports a review that never happened. That is precisely
what `DANGLING-AGENT` exists to catch and precisely what it cannot see in a
markdown table. Adding a fifth agent means editing both surfaces. Treat the
frontmatter as the roster and the table as its documentation — never the
reverse.

## Focused dispatch beats blanket dispatch

The protocol is **list candidates, justify each specifically, drop the
generics, dispatch the survivors**.

The reason is not economy. It is that a reviewer with nothing concrete to look
at does not fall silent — it writes something. An agent handed a diff outside
its domain restates the change back at you in the register of a review, and in
a synthesis that output is indistinguishable from a review that actually
looked. This is the same failure `spec/wiring.md` was built around, one level
up: there, a dispatch to an agent that does not exist produces a run that
reports a completed review; here, a dispatch to an agent that exists but has
nothing to read produces the same artifact, and no checker can tell the
difference because nothing about it is malformed. The pre-flight is the only
gate on that failure, and it is a gate you operate by hand.

The discipline is not "be stingy." A change that adds a verdict to a checker,
a fixture that trips it, and a unit test that names it legitimately involves
three of the four agents. The discipline is that each one is justified before
it is dispatched. The keep-it-honest test: if you cannot say in one sentence
what *this* agent will look at in *this* change, drop it.

## Pre-flight before dispatch (required)

Before sending any `Agent` tool call, produce this table:

| Candidate | Specific justification for THIS change | Decision |
| --- | --- | --- |
| `checker-engineer` | "Adds `stale-quote` to the exported `Verdict` union in `packages/claims/src/checkClaims.ts` and does not touch its `PASSING` set." | dispatch |
| `test-engineer` | "New tripping line in `spec/fixtures/broken-run.jsonl`; needs a test that names the verdict, not just a non-zero exit." | dispatch |
| `rule-auditor` | "Both `packages/claims/src/**/*.ts` and `spec/fixtures/**/*.jsonl` match `verdict-needs-fixture-and-test`." | dispatch |
| `architecture-reviewer` | "Generic — a union grows, but no seam moves and the change carries no claims about existing code." | skip |

Rules:

- A justification is **specific** only when it names a concrete piece of the
  change: a file, a verdict, a `PASSING` set, a config key, a hook command, an
  Evidence Anchor, a fixture line, a glob. "Touches the kernel" / "might catch
  something" / "good lens" all fail the test, and a candidate whose
  justification fails is dropped rather than softened.
- Where two agents overlap, dispatch the one whose domain is narrower unless
  each has a distinct piece to look at. `checker-engineer` and
  `architecture-reviewer` overlap constantly on kernel diffs by design — the
  first checks a union's local consistency, the second checks whether the seam
  it sits on still holds — so both are right together only when both of those
  questions have an answer in this diff.
- State the table, or at minimum "dispatching X and Y; skipped Z because…",
  in your reply **before** the `Agent` calls fire. The user has to be able to
  redirect while redirecting is still cheap.
- The size of the change does not decide. The justification does. A one-line
  diff to `packages/claims/src/config.ts` earns a dispatch; a fifty-file
  rename earns none.

## The roster

Four agents, all of which exist as files under `.claude/agents/`.

| Agent | Owns | Dispatch it when |
| --- | --- | --- |
| `rule-auditor` | Compliance of a diff, a planned change, or an OpenSpec proposal against the eight glob-scoped rule files in `.claude/rules/`, each of which carries its own `severity:` that decides the finding's label | At least one file the change touches is matched by some rule's `applies_to` glob. That is a mechanical test you can run before dispatching, and it is the entire trigger — the agent derives its applicable set from frontmatter, so a change matching no glob comes back "No files in scope; nothing to audit." In proposal mode it also runs a false-premise pass over the proposal's claims about existing code. |
| `architecture-reviewer` | The five cross-cutting invariants that live as narrative prose in `CLAUDE.md`, the `spec/` family and `openspec/project.md` — the doctrine no `applies_to` scopes, which is why it needs a reviewer instead of a linter — plus the descriptive question about load-bearing claims | The change moves a shape rather than a line: a new checker module, a filesystem call crossing into a pure core, a verdict union growing, a hook gaining a failure path that cannot reach a fail-open exit, a dependency pointing from the kernel back at the kit. Also every design document under `openspec/changes/`, where decisions and the premises they rest on concentrate. |
| `checker-engineer` | The four kernel modules that decide a verdict — `packages/claims/src/checkClaims.ts`, `witness.ts`, `wiring.ts`, `config.ts` — and their internal consistency: which union a verdict belongs to, whether its `PASSING` placement was argued or merely inherited from a set nobody touched, whether a config key landed in both the known-key set and an assignment branch | The diff touches one of those four files. Its questions are local and mechanical, and it is the only agent that will notice a verdict that fails closed correctly *by accident*. It flags that a new verdict needs coverage; it does not go and check whether the coverage exists. Everything under `packages/kit/` is outside its remit — a kernel file reaching into the kit is itself one of its findings, not a place it follows the diff. |
| `test-engineer` | Whether a change's coverage proves what it claims: the fixture trees under `spec/fixtures/`, the test files under both packages, and the dogfooding gates in `.github/workflows/ci.yml` | A change adds a verdict — a negated fixture step only proves the command still exits non-zero, never which check produced that exit, so a fixture without a test naming the verdict is a gap that is real today and invisible in CI. Also when a test is framed as a regression test, where the question is whether it would have failed against the pre-fix code rather than whether it passes now; and when the diff touches the flag table in `packages/claims/src/flagConformance.test.ts`, where six locally-failing tests are a standing invitation to narrow the table for the wrong reason. |

**What is not on this roster is as load-bearing as what is.** There is no
security reviewer, no harness engineer, no spec writer, and no agent that
writes retrospectives. The security gap is the one the agents name themselves:
`rule-auditor` and `architecture-reviewer` both say in their own bodies that this
repo has no security reviewer, and both instruct you to return anything
security-shaped as a `[concern]` for a human to route rather than clearing it as
`[looks-good]` —
so a clean report from those two is not a security review, and must not be
summarised as one. Do not add a row here for an agent that has not been
written: `nullius wiring` will fail the build on it, which is the correct
outcome, but the row would have been a lie either way.

## Routing — what to consult, when

Map the change to agents with these overlapping triggers. **Pick every row that
applies, then run the pre-flight against the result** — this table produces
candidates, the pre-flight produces dispatches.

| If the change involves… | Always consult | Strongly consider also |
| --- | --- | --- |
| A kernel checker module — `checkClaims.ts`, `witness.ts`, `wiring.ts`, `config.ts` | `checker-engineer`, `rule-auditor` | `architecture-reviewer` (if a seam moves: a new core, a new filesystem touch, a union growing), `test-engineer` (if a verdict is added or a decision path changes) |
| A new verdict in any of the three unions | `checker-engineer`, `test-engineer` | `rule-auditor` (`verdict-needs-fixture-and-test` is `severity: blocker` and matches both the source and fixture globs), `architecture-reviewer` (if it hard-fails on a match that could plausibly fire on ordinary prose) |
| A config key added, renamed, or removed | `checker-engineer` | The silent failure is a key that reaches `KNOWN_KEYS` with no matching assignment branch in `parseConfig` — it validates cleanly and its value is never copied into the config. A key the interface declares but `KNOWN_KEYS` omits does not slip through; it throws at `config.ts:77`. Either way that is `checker-engineer`'s own `[blocker]`, not a coverage question — do not route it elsewhere. Add `test-engineer` only if the change also touches a fixture or a gate |
| A kit or CLI change — anything under `packages/kit/`, or `packages/claims/src/cli.ts` | `rule-auditor` | `architecture-reviewer` (the dependency direction, and whether harness coupling stayed on the kit side), `test-engineer` (the `*.test.ts` files under `packages/kit/src/` are named in its own domain, and it is the only agent that claims them). Not `checker-engineer` — it declines `packages/kit/` by its own boundary, and dispatching it there is a pre-flight miss, not a thorough review |
| A plugin or hook change — the scripts and JSON under `plugin/hooks/`, or `.claude/settings.json` | `architecture-reviewer` (can every new failure path still reach a fail-open exit?), `rule-auditor` (`one-delivery-mechanism` matches both `.claude/settings.json` and `plugin/hooks/hooks.json`) | `test-engineer` (if the change alters what a dogfooding gate runs) |
| A plugin skill, command, or reviewer prompt under `plugin/` | `rule-auditor` (`model-proposes-code-verifies` scopes `plugin/**/*.md`) | Nothing else claims these paths. `architecture-reviewer`'s post-review priority list names `plugin/hooks/*.sh` and nothing else under `plugin/`, so a reviewer prompt or a command body is unowned — say so rather than dispatching the hook row's agents by analogy |
| A spec-family document under `spec/` | `architecture-reviewer` | `rule-auditor` (`never-repoint-under-old-stamp` and `merge-never-squash` both scope `spec/**/*.md`) |
| A document under `docs/`, or `README.md` | `rule-auditor` (`never-repoint-under-old-stamp` scopes `docs/**/*.md` and `README.md`; `merge-never-squash` scopes `README.md` too) | `architecture-reviewer` only when the document makes load-bearing claims about existing code — the descriptive question is the reason to dispatch it, not any invariant, and say so in the brief. The recurring defect on this path is a spec that has drifted from what actually shipped, which every anchor in it can verify while the prose around them goes stale |
| An OpenSpec proposal under `openspec/changes/` | `rule-auditor` in proposal mode, `architecture-reviewer` against the design document | `checker-engineer` and `test-engineer` — but only when the plan names kernel files or new verdicts. In pre-review they audit the plan, not code that does not exist yet |
| Fixtures or the CI gates | `test-engineer` | `rule-auditor` (both globs are named by `verdict-needs-fixture-and-test`) |
| A new agent or rule under `.claude/agents/` or `.claude/rules/` | `architecture-reviewer` — those two paths are named in its own post-review priority list, and the question is whether the new artifact duplicates doctrine that already has a home instead of pointing at it | Nothing else, and see the note below |
| A skill definition under `.claude/skills/` | Nothing on this roster claims it. `architecture-reviewer`'s stated priorities stop at agents and rules | Dispatch it anyway only if the skill asserts something about the code, in which case the false-premise pass is the reason — say that in the brief rather than implying the path is in its remit |

**Only one path under `.claude/` is matched by any rule.** That path is
`.claude/settings.json`, named by `one-delivery-mechanism` at `severity: blocker`
— which is why the hook row above sends it to `rule-auditor`. No rule scopes an
agent, a rule, or a skill *definition*: the other seven scope source, fixtures,
workflows, `openspec/`, `spec/`, `docs/`, `README.md`, and `plugin/`. So
`rule-auditor` dispatched against a change confined to `.claude/agents/`,
`.claude/rules/`, or `.claude/skills/` — this file's own commit, for instance —
will correctly return that it has nothing to audit. That is not a fault in the
agent and not a reason to widen a glob; it is a routing fact worth knowing
before you spend the dispatch.

If you are unsure whether a candidate applies, **do not dispatch and find out** —
write a more specific justification first, and drop the candidate when you
cannot. An agent that comes back with "outside my domain" is evidence the
pre-flight failed, not a satisfactory outcome.

### Common shapes

- **A new verdict in an existing checker**: `checker-engineer` + `test-engineer` + `rule-auditor`.
- **A new checker command end to end** — a pure core, its scanner, the CLI wiring, a `spec/` document, and fixtures: all four.
- **A hook or plugin-delivery change**: `architecture-reviewer` + `rule-auditor`.
- **An OpenSpec proposal, before implementation**: `rule-auditor` in proposal mode + `architecture-reviewer` against the design document, adding the other two only if the plan names kernel files or new verdicts.

## Where a green suite is not evidence

Some changes need a reviewer *because* the tests pass. Three seams in this repo
produce defects that a green run cannot speak to, and each one has an agent
whose job it is:

**The binding layer between a pure core and the filesystem.** A checker core's
unit tests hand it a fabricated dependency object rather than a directory:

**Evidence:** `packages/claims/src/wiring.test.ts:28@555e5ee` — `function deps(present: string[] = [], matches: Record<string, string[]> = {}): WiringDeps {`

Those tests can prove the verdict logic given a set of inputs; they cannot
prove the scanner collects the right inputs in the first place, because they
never run it. A change to what gets scanned — which globs count as artifacts,
which frontmatter fields are read — passes the core's whole suite untouched.
Dispatch `test-engineer` on whether the fixture trees actually exercise the new
collection path, and `architecture-reviewer` if the change puts a filesystem
call on the wrong side of the seam.

**The hook delivery boundary.** Hooks fail open by design, and the cost of that
posture is stated where the diagnostic for it lives:

**Evidence:** `packages/kit/src/doctor.ts:7@555e5ee` — `has one cost — every failure is silent.`

A test proving a hook script's logic says nothing about whether the hook is
delivered, executable, and reached — and if it is not, nothing anywhere goes
red. Dispatch `architecture-reviewer` on every change to a hook's failure
paths, and `rule-auditor` on anything that touches how a hook is delivered.

**The published export surface.** `packages/claims/src/index.ts` is the barrel
every external consumer sees, and no test inside the kernel imports through it:

**Evidence:** `grep -rn --include='*.test.ts' 'from "./index"' packages/claims/src/` → 0 results

The kit imports a handful of its symbols by name. The alias package re-exports
the entire barrel wholesale under a second published name:

**Evidence:** `packages/evidence-anchors/index.d.ts:1@555e5ee` — `export * from "@nullius-inverba/claims";`

That republishes every symbol without exercising any of them, so a symbol
dropped from the barrel, or a type widened in it, breaks consumers with nothing
in this repo failing. (The search above sees only this one literal import form
in kernel test files — a differently-spelled import would be a blind spot, and
that alias re-export is exactly such a case.) Dispatch
`architecture-reviewer` when a change edits either file, since the question is
whether the export was public API to begin with.

## How to brief each agent

A bad brief produces a useless review. The agent has zero context from this
conversation — it sees only what you write in the prompt.

All four agents report a **Mode** at the head of their findings, so all four
expect you to set one — but they do not agree on what happens if you don't,
which is how a vague brief becomes a confident review of the wrong thing:

1. **Mode** — diff (a branch, a commit range, or "uncommitted"), planned (a
   list of paths the change will touch), or proposal (a change directory).
   `rule-auditor` and `architecture-reviewer` document a fallback: omit it and
   they diff the current branch against `main`, which is rarely what you meant
   when you were asking about a plan. `checker-engineer` and `test-engineer`
   document no fallback at all, so omitting it there leaves what they review
   unspecified. Set it every time.
2. **Phase** — "I just implemented X" versus "I am about to implement X."
   Review and advice need different framings, and in the second case there is
   no diff to read.
3. **Concrete artifacts** — paths with line ranges, the change directory, the
   fixture, the test file. A reviewer cannot review what it cannot open.

Then add:

4. **Specific question** — not "what do you think" but "does this verdict
   belong in this union", "would this test have failed before the fix", "can
   this new branch still reach a fail-open exit".
5. **Constraints** — trade-offs already weighed and rejected, so the reviewer
   does not spend its report suggesting them.
6. **No length cap of your own.** Every one of the four agents already caps
   itself at 400 words and specifies its own `[blocker]` / `[concern]` /
   `[looks-good]` output shape. Asking for a different budget or a different
   vocabulary fights the agent's own instructions and gets you a worse report,
   not a shorter one.

### Brief template

```
You are being asked to {review | advise on} {short description} as the {agent role}.

Mode: {diff <range> | planned <paths> | proposal <change directory>}

Phase: {already implemented, looking for review | planning, looking for advice before I touch code}

Goal: <one sentence on what the work is meant to accomplish>

Artifacts:
- <path:line range, or the change directory>
- <the fixture or test file, if any>
- <the rule or spec document the change is arguing with, if any>

Constraints / already considered:
- <thing 1>
- <thing 2>

Specifically, I want your judgment on:
1. <focused question, phrased to invite a definite answer>
2. <focused question>
3. <"anything else in your domain I am missing?">
```

Keep the third question. That is where the agent applies its expertise past
what you thought to ask, and where the findings you did not anticipate come
from.

## Dispatching: parallel, single message

Send the requests in **one message containing several `Agent` tool calls**.
Sequential dispatch costs wall-clock time and tokens, because each agent
reloads its base context either way.

The `subagent_type` must exactly match a name on the frontmatter roster —
lowercase and hyphenated, as the files are named. Each agent's response comes
back as a tool result; none of them sees another's output, so any
reconciliation between them is yours to do.

## Synthesizing the feedback

Do not dump raw responses on the user. All four agents emit the same finding
vocabulary, which makes a merged report straightforward:

1. **Deduplicate.** When two agents flag the same thing, state it once and
   credit both. Overlap between `checker-engineer` and `architecture-reviewer`
   on a kernel diff is expected and is not two findings.
2. **Group by the agents' own severities** — `[false-premise]`, then
   `[blocker]`, then `[concern]`, then `[looks-good]`. Do not relabel:
   `rule-auditor`'s severities come from the violated rule's own `severity:`
   field, and a `[blocker]` you found minor is still a `[blocker]`. Only
   `rule-auditor` and `architecture-reviewer` emit `[false-premise]`, and it is
   always a blocker regardless of which rule or invariant it sits near.
3. **Read a `[concern]` as an unconfirmed blocker, not as a nit — with two
   exceptions, both stated by the agent that owns them.** The default reading
   is a finding the agent could not confirm in the time available, which is a
   different thing from a finding it judged small. `checker-engineer` is one
   exception: its `[concern]` marks a calibration call it wants a human to
   weigh, not a finding it ran out of time on. `rule-auditor` is the other,
   and only in one of its two documented cases — a *confirmed* violation of
   `openspec-shall-first-line`, the single rule whose own `severity:` is
   `concern`, is already rated exactly right and must not be escalated; its
   other case, an unconfirmed violation of any rule, is the
   unconfirmed-blocker reading. It says which case applies, so read the
   finding rather than the label.
4. **Surface disagreements; do not average them.** Name the disagreement, quote
   each position, and recommend one side with a specific reason — usually a
   rule file, an invariant, or a spec document. Refuse the anti-patterns:
   blending two positions into a middle nobody argued for, dropping the
   minority view, siding with the warmer tone, or handing every conflict back
   to the user. The user can take a disagreement back from you, but only if you
   surface it first. If the two positions are genuinely equal and the call is
   the user's, say so and tag it `[user-decision]`.
5. **Cite the source** — `[checker-engineer]`, `[test-engineer]` — so the user
   can re-engage that agent directly.
6. **Say what you intend to do.** A plain plan: what you will fix now, what you
   are leaving for the user, and what you disagree with and why. Do not
   silently apply every suggestion.

### Report template

```
## Specialist consultation — <one-line subject>

**Consulted:** checker-engineer, test-engineer, rule-auditor
**Skipped:** architecture-reviewer (no seam moves; the union grows in place)

### False premises
- [rule-auditor] The proposal claims the checker already fails closed on an unreadable rev; the code returns an advisory verdict that is a member of the passing set. The conclusion may still hold, but not for the stated reason.

### Blockers
- [checker-engineer, rule-auditor] The new verdict is added to the union with no `PASSING` decision argued anywhere; it fails closed by accident, and reads six months from now as if someone chose that.
- [test-engineer] The fixture trips it, but no test names the verdict — the negated CI step stays red on the strength of the fixture's other verdicts alone.

### Concerns
- [checker-engineer] The new pattern scans the whole file rather than the body; that may carry the same near-zero false-positive argument the existing hard verdict does, but the diff does not make it.

### Looks good
- [test-engineer] The new fixture line is paired with an assertion naming the verdict directly.

### Disagreements
- checker-engineer reads the verdict as belonging to a new family; architecture-reviewer reads it as a member of the existing one. **Recommendation:** follow checker-engineer — growing an exported union is the breaking change, and a new family is the documented answer.

### My plan
1. Argue the `PASSING` placement in a comment and in the proposal, then re-run checker-engineer.
2. Add the test that names the verdict.
3. Take the union-family question to the user; it is a public API call, not a bug.
```

## When not to consult

- **Pure refactors with no behavioural change.** Usually overkill.
- **Typo and copy fixes.**
- **The user said "just do it, no review."** Respect it.
- **You already consulted and what changed since is small.** Say so rather
  than re-dispatching the same four agents against the same diff.

## Phase-specific notes

**Pre-implementation advice.** Frame it as "I am about to build X — what should
I watch out for in your domain?" and send the plan, not a diff. All four agents
have a documented pre-review behaviour: they audit the plan's described
approach against their own domain, which catches a task that would land a
defect before any code exists to find it in.

**Post-implementation review.** Send the diff, with line numbers rather than
"look at this file." Say what is final and what is still in flight.

**Mid-implementation sanity check.** "Halfway through, here is where I am and
where I am headed — am I on the right track?" Worth it when the work is large
enough that backing out a wrong turn would be expensive.

## Edge cases

- **An agent says the work is outside its domain.** That is a pre-flight miss:
  the justification you wrote for it was wrong. Drop it from the synthesis, note
  it as a skipped miss, and tighten the routing next time. Repeated misses on
  the same agent for the same shape of change mean the routing table above
  needs an edit.
- **An agent returns "looks good" on everything.** Treat it the way this repo
  treats a fixture that stopped failing. An agent that read nothing and an
  agent that found nothing produce identical reports, and the only thing that
  distinguishes them is whether the finding cites specific files and lines.
  Ask for the citations before you record a clean review as a clean review.
- **An agent dispatches its own subagents.** Its prerogative; you receive only
  its final synthesis.
- **The same conflict recurs across iterations.** Escalate to the user with
  both positions stated. Do not pick a side silently because you have picked it
  before.
- **The change touches an area no agent owns** — the GitHub Action in
  `action/action.yml`, the workspace configuration in `pnpm-workspace.yaml`,
  `CHANGELOG.md`. Say so plainly rather than dispatching
  the closest two by analogy. Four agents cover four domains, and the honest
  answer when a change falls outside all of them is that this roster has
  nothing to say about it.
