# Wiring

**Version 0.1 — draft.** What [`nullius wiring`](../packages/claims/) checks in
a harness's own configuration: agent, skill, rule, and command definitions,
and the hook JSON files that dispatch work between them. Part of the same
family as [Evidence Anchors](./evidence-anchors.md),
[Binding Moments](./binding-moments.md), and
[The Witness Journal](./witness-journal.md) — anchors catch a false claim
about code, witness catches a run's account of itself not holding together,
and wiring catches a harness instruction addressed to something that was
never there.

## The problem this solves

A skill's frontmatter can declare `dispatches: [rule-auditor]`. If no
`.claude/agents/rule-auditor.md` exists, nothing in the harness raises an
error when that dispatch fires. It does not fail loudly — it no-ops. The run
that used it reports a completed review; the transcript shows a dispatch and
a terminal record; by every signal a summary would surface, the review
happened. It did not. The agent that was supposed to read the code never
existed, so nothing read it.

[Witness](./witness-journal.md) cannot catch this on its own: a no-op
dispatch still produces a `dispatch` and a `report`, and a `report` with
outcome `empty` and statement `"None."` is indistinguishable, to the journal,
from an agent that genuinely looked and genuinely found nothing. The defect
is not in how the run was recorded — it is that the instruction the run acted
on named something absent, and that is a fact about the filesystem, knowable
before any dispatch is attempted. It belongs to a checker that runs on every
commit, not to a runtime error path that only fires the one time the dispatch
happens to be tried.

`nullius wiring` is that checker. It reads a harness's own artifacts and
reports every reference among them that does not resolve against the working
tree: an agent name with no definition file, a skill with no `SKILL.md`, a
declared read path that is not there, an `applies_to` glob matching nothing,
a hook command that does not resolve or is not executable, and a
`{{TOKEN}}` placeholder left behind by a copy from scaffolding.

Two of them are references it cannot even read: a hooks or settings file whose
JSON does not parse, and a markdown artifact whose frontmatter fence opens and
never closes. Both destroy the declared half of an artifact wholesale rather
than one reference within it, and both are reported for the same reason as the
rest — what the artifact declares does not resolve, and here the checker cannot
determine how much of it failed.

## Declared references, and prose

An artifact carries two different kinds of text that can look like a
reference. Frontmatter fields — `dispatches:`, `skills:`, `reads:`,
`applies_to:` — are the author affirmatively choosing structured syntax over
a sentence: writing `dispatches: [rule-auditor]` is a commitment in a way
that writing "see the rule-auditor agent" in a paragraph is not. Body prose,
by contrast, can quote a path as a live pointer or as an illustrative example
(`` `src/example/Thing.ts` `` in a comment explaining a convention), and
nothing about the syntax tells those two apart. Only the author's intent
does, and that is exactly the thing a deterministic checker cannot read.

So the hard half of this checker — the verdicts that fail a build — reads
**only** declared frontmatter. An unresolvable path quoted in a body is still
worth surfacing, because it is very often a stale pointer left behind by a
rename, but failing the build on every unresolvable backticked path would
also fail it on legitimate examples. A heuristic that fails a build on a
judgment call is a check people turn off. Body prose therefore gets a single
advisory verdict, `LOOSE-REFERENCE`, that is reported but never fails a run —
and is not counted among the "declared references checked" a clean run
reports, because it was never a declared reference to begin with.

## The declared fields

Frontmatter is read by a hand-rolled parser (see
[`frontmatter.ts`](../packages/claims/src/frontmatter.ts)) that covers
scalars, inline flow lists (`dispatches: [a, b]`), and block lists
(`dispatches:` followed by `- a` / `- b`) — no YAML nesting, no anchors, no
multi-line scalars. A field that can legitimately be written any of those
three ways is read through one function, `declaredList`, so a scalar and a
one-item list mean the same thing to every caller rather than one of them
silently reading the field as absent:

**Evidence:** `packages/claims/src/frontmatter.ts:121@3cc0290` — `export function declaredList(front: Frontmatter | null, key: string): Located[] {`

Five fields are read off an artifact's frontmatter:

| Field | Declared as | Resolved against | Verdict on failure |
| --- | --- | --- | --- |
| `name` | scalar `name:` | nothing — see below | none |
| `dispatches` | list | `.claude/agents/<name>.md` | `DANGLING-AGENT` |
| `skills` | list | `.claude/skills/<name>/SKILL.md` | `DANGLING-SKILL` |
| `reads` | list | the literal path, on disk | `MISSING-PATH` |
| `applies_to` | list | the glob, expanded | `EMPTY-GLOB` |

`name` is read and carried on every scanned artifact, but as shipped, nothing
currently checks it against anything: no verdict fires because a name is
missing, because it collides with another artifact's, or because it disagrees
with the artifact's own filename. It is data captured for a consumer that
does not yet exist, not a reference this checker resolves — worth being
precise about, since it sits in the same struct as the four fields that are.

`reads` and `applies_to` both route their value through `isSafeRepoPath`
**before** touching the filesystem — the same containment guard [Evidence
Anchors uses for a citation's path](./evidence-anchors.md#security-model):
no absolute paths, no `~`, no `..` traversal, nothing inside `.git`. An
`applies_to` glob is not exempt from this because it looks like a scoping
rule rather than a citation — a rule file is repo-controlled content a pull
request can add, and an escaping glob is a defect regardless of what it would
have matched:

**Evidence:** `packages/claims/src/wiring.ts:282@3cc0290` — `const globSafety = isSafeRepoPath(ref.value);`

An unsafe `reads` or `applies_to` value is reported as `MISSING-PATH` /
`EMPTY-GLOB` with the safety guard's own reason string, and the file is never
opened and the glob is never expanded to find out.

## Hook commands

`.claude/settings.json` and `plugin/hooks/hooks.json` are scanned
separately from the markdown artifacts above — there is no frontmatter to
read, only a `hooks` object whose shape nests commands at varying depth
(`hooks.PreToolUse[].hooks[].command`, and similar). Rather than assume that
shape, every `command` key's string value is collected by parsing the file as
JSON and walking the parsed structure recursively:

**Evidence:** `packages/claims/src/wiringScan.ts:78@3cc0290` — `function collectCommands(node: unknown, found: string[]): void {`

A file that fails to parse as JSON still yields no hooks out of
`hookCommands` itself — that half of the old claim above stayed true even
after this changed:

**Evidence:** `packages/claims/src/wiringScan.ts:138@9b90b33` — `return [];`

What did not stay true is the rest of it, that the parse failure produced
*no finding*. The scan now hands `hookCommands` a callback that fires on the
same `JSON.parse` failure, and it is the caller — not the function — that
records what happened:

**Evidence:** `packages/claims/src/wiringScan.ts:204@9b90b33` — `      const hooks = hookCommands(content, "plugin", () => {`

`checkWiring` checks for that record ahead of every per-field loop and
reports it as `MALFORMED-HOOKS`:

**Evidence:** `packages/claims/src/wiring.ts:258@9b90b33` — `if (item.parseError !== null) {`

A hooks or settings file that will not parse now fails the run instead of
passing it in silence.

### `hookTarget`: collect, then decline unless exactly one

Each collected command string is a shell command line — `node
${CLAUDE_PLUGIN_ROOT}/hooks/run.js --flag`, `sh -c "…"`, and everything
between — and the checker needs the one path in it that names the script
that will actually run. `hookTarget(command, pluginRoot)` is not a shell
parser. It does not attempt to understand the command line; it filters the
command line's words down to the ones that are unambiguously a repo-relative
script path, and answers only when **exactly one** survives:

**Evidence:** `packages/claims/src/wiring.ts:213@3cc0290` — `return candidates.length === 1 ? (candidates[0] ?? null) : null;`

Zero candidates and two-or-more candidates both return `null` — the same
answer as "this command line names nothing checkable." Nothing distinguishes
"no script found" from "too ambiguous to tell," because the earlier design
did try to pick a winner among several candidates, and every heuristic for
"most plausible" lost to an ordinary command form: a flag's argument, a
scoped package name, a loader flag that happens to carry a real extension, an
interpreter followed by a preload script and then the real one. Each miss
returned a **wrong but confident** path, which fails a hook that works — the
one failure mode this function is built not to have. Declining is the
correct answer to ambiguity; picking is not.

The command line is first split into words with a small tokenizer that
treats a quoted run — including any spaces inside it — as one word (so
`sh -c "node hooks/run.js"` becomes one fused token, not several), and
`${CLAUDE_PLUGIN_ROOT}` / `$CLAUDE_PLUGIN_ROOT` are substituted with the
caller-supplied `pluginRoot` before anything else runs. `pluginRoot` is taken
on faith — the scan passes the fixed repo-relative literal `"plugin"`; a
caller that ever derives it dynamically is responsible for validating it
first, because `hookTarget` has no way to.

**Backslash quoting refuses the whole command line, unconditionally:**

**Evidence:** `packages/claims/src/wiring.ts:203@3cc0290` — `if (command.includes("\\")) return null;`

This was the point four separate attempts at reading these command lines
went wrong. A partial shell parser's real failure mode is never the cases it
rejects — it is the cases it is confident about and gets wrong. So rather
than parse backslash quoting (POSIX gives it different meaning inside single
quotes, double quotes, and bare), the function refuses to read any command
line that contains one at all, and returns `null`.

Each surviving word is then checked against every clause below, and **each
clause is a refusal, not a match** — a candidate must clear all of them to be
considered a script:

- Starts with `-` → refused (a flag, not a target — `--loader=./x.mjs` is a
  flag whether or not it ends in an extension).
- Contains whitespace, including the invisible zero-width space / ZWNJ / ZWJ
  characters JavaScript's `\s` does not match → refused. A token containing a
  real space is, on this side of the tokenizer, indistinguishable from a
  quoted command line that got fused into one word — and declining a real
  path with a space in it is the direction this function is built to be
  wrong in.
- Carries a URI scheme prefix (`mailto:`, `data:`, `https:`, …) → refused as
  a class.
- Contains no `/` → refused; a bare word is not a path.
- Fails `isSafeRepoPath` → refused; the same containment guard applied to
  `reads` above (no absolute path, no `~`, no `..`, nothing inside `.git`) —
  but not the same outcome, as the paragraph below states plainly.
- Does not end in a recognised script extension (`.sh`, `.bash`, `.zsh`,
  `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.py`, `.rb`, `.pl`, `.cmd`,
  `.ps1`, `.bat`) → refused.

**The accepted consequence:** several shapes of command line go unchecked.
An extensionless hook script, a real path that contains a space, and a
command line with two-or-more qualifying tokens each make `hookTarget`
return `null`, exactly as it would for a one-liner with no path in it at
all, and `wiringScan` drops a `null` result rather than recording a finding
for it. `null` is the intended *only* failure mode: `hookTarget` must never
hand back a token that is not the script that runs.

A fourth case reaches `null` the same way, through a different door: a
candidate that fails `isSafeRepoPath` — `/absolute/path/hook.sh`, or
`../../outside/hook.sh` — is dropped from the candidate set before the count
is taken, so a command whose only word is such a path also lands on zero
candidates. The outcome this produces is **not** the outcome the bullet
above's "same containment guard" might suggest: a `reads` or `applies_to`
value that fails `isSafeRepoPath` is reported, with the guard's own reason
string, as `MISSING-PATH` or `EMPTY-GLOB`. A hook command that fails the
identical check produces **no finding at all** — no verdict, no line, not
even a count toward "declared references checked." It goes silent the same
way the first three cases do, despite failing the same guard that, on
`reads` and `applies_to`, speaks. That guard is not loud everywhere else in
the checker, either: `looseCandidates` — the scan behind the advisory
`LOOSE-REFERENCE` verdict for backticked paths in prose — filters out any
candidate that fails `isSafeRepoPath` the same way, so a prose path like
`/etc/passwd` or `../../secret` is dropped before it is ever considered and
produces no advisory either, a third site with the identical silence.

That silence is easiest to defend for the absolute-path half of it: a hook
that runs `/usr/bin/some-tool` is naming a system binary, and whether that
exists on the machine running the check is not a fact about this
repository's wiring, so the guard catching it is closer to a side effect
than a decision this checker made on purpose. It is harder to defend for the
traversal half: a hook command reading `../../outside/hook.sh` points *out
of* the repo, which looks like exactly the kind of thing this checker exists
to catch — but `isSafeRepoPath` returns the same `safe: false` for both, and
`isHookScript` discards the reason string along with the token, so an
absolute path and an escaping one are indistinguishable by the time either
goes quiet. Whether that pair deserves to be split — a verdict for one, the
current silence for the other — is a real design question this document is
not the place to settle.

A command that does resolve is then checked the same way a `reads` path is:
missing → `DEAD-HOOK` ("if this is a build output, run `pnpm build` first");
present but not executable → `DEAD-HOOK` ("exists but is not executable —
the harness fails this open, so it would never run and never say so").

## Unsubstituted tokens

A `{{TOKEN}}`-shaped placeholder (`/\{\{[A-Z_]+\}\}/`) is scanned for across
an artifact's **entire raw text** — frontmatter and body for a markdown
artifact, the whole file for a hooks/settings JSON file — not only inside the
declared fields above. Any match is `UNSUBSTITUTED-TOKEN`: a placeholder a
scaffold left behind and a port never replaced, which means the instruction
around it was written for a different repository and is not addressed to
this one. Unlike `LOOSE-REFERENCE`, this is a hard verdict and is counted
among declared references checked — a token has no legitimate reading as an
illustrative example the way a backticked path does.

## Verdicts

This checker answers in its own verdict vocabulary, not the kernel's. Evidence
Anchors' checker exports a public `Verdict` union (`OK`, `STALE`,
`FABRICATED`, and the rest) that other tooling already depends on; growing
that union for an unrelated checker would be a breaking change to every
consumer of it, for a concept — "does a harness reference resolve" — that has
nothing to do with anchor verification. `WiringVerdict` is its own type for
exactly that reason, declared where the rest of this checker's shape is:

**Evidence:** `packages/claims/src/wiring.ts:22@3cc0290` — `export type WiringVerdict =`

| Verdict | Meaning | Passes? |
| --- | --- | --- |
| `DANGLING-AGENT` | A declared `dispatches` name has no `.claude/agents/<name>.md` | ❌ |
| `DANGLING-SKILL` | A declared `skills` name has no `.claude/skills/<name>/SKILL.md` | ❌ |
| `MISSING-PATH` | A declared `reads` path is unsafe, or does not exist | ❌ |
| `EMPTY-GLOB` | A declared `applies_to` glob is unsafe, or matches no file | ❌ |
| `DEAD-HOOK` | A resolved hook script does not exist, or is not executable | ❌ |
| `UNSUBSTITUTED-TOKEN` | A `{{TOKEN}}` placeholder survived a port | ❌ |
| `MALFORMED-HOOKS` | A hooks or settings file failed to parse as JSON | ❌ |
| `UNCLOSED-FRONTMATTER` | A frontmatter fence opened but never closed | ❌ |
| `LOOSE-REFERENCE` | An unresolvable backticked path in prose, not a declared field | ✅ |

The union carries a tenth member, `ok` — the reference resolves — but as
shipped, `checkWiring` never emits it as a finding; a reference that resolves
produces no output at all, and only the eight failures plus the one advisory
above ever reach the report:

**Evidence:** `packages/claims/src/cli.ts:367@3cc0290` — ``checker never emits an `ok` finding``

That is why the table above lists nine rows and not ten, and it is the
same shape [the witness journal's verdict table](./witness-journal.md#verdicts)
takes for its own `ok`. The type exists so `isWiringFailure` has a defined
answer for it and so the union stays honest about what a reference *could*
be, not because the checker ever prints it.

`nullius wiring [root]` (default root `.`) scans four markdown globs
(`.claude/agents/*.md`, `.claude/skills/**/SKILL.md`, `.claude/rules/*.md`,
`.claude/commands/**/*.md`) and two hook JSON files
(`.claude/settings.json`, `plugin/hooks/hooks.json`), reports a line per
finding, and exits non-zero whenever any hard verdict fired — `LOOSE-REFERENCE`
findings print but never flip the exit code.

## Scope: resolves, not happened

`nullius wiring` checks that a reference **resolves against the working
tree**. It does not check that a dispatch **happened**, that the agent it
named did anything once it ran, or that the run's own record of that work
holds together — those are [witness](./witness-journal.md)'s subject, and
keeping the two apart is what stops this checker from becoming a second,
worse witness.

Concretely: a passing `nullius wiring` run says every `dispatches`, `skills`,
`reads`, and `applies_to` reference in the scanned artifacts names something
that exists right now, and every hook command resolves to an executable
script. It says nothing about whether any of those artifacts were ever used
in an actual run, what the agent found when it read the file `reads`
declared, or whether a run that used them left behind a journal that
satisfies witness's three invariants. Those are different failures, caught
by different tools, on purpose: this one is a filesystem fact, checkable
without running anything; witness's are facts about a specific run's own
account of itself, checkable only after one exists.
