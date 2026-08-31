<p align="center">
  <img src="docs/icon.svg" alt="" width="132">
</p>

<h1 align="center">nullius</h1>

<p align="center">
  <strong>Epistemic discipline for agent systems — mechanically enforced.</strong>
</p>

<p align="center">
  <em>Nullius in verba</em> — take nobody's word for it.
</p>

<p align="center">
  <a href="https://github.com/armanfatemi/nullius/actions/workflows/ci.yml"><img src="https://github.com/armanfatemi/nullius/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@nullius-inverba/claims"><img src="https://img.shields.io/npm/v/%40nullius-inverba%2Fclaims" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/%40nullius-inverba%2Fclaims" alt="license"></a>
  <a href="#roadmap"><img src="https://img.shields.io/badge/status-work%20in%20progress-orange" alt="status: work in progress"></a>
</p>

> [!NOTE]
> **This project is a work in progress.** The conventions here are in daily
> use by the pipeline they came from, and still moving. Both releases so far
> carried breaking changes — read [the changelog](CHANGELOG.md) before
> upgrading. Issues and pushback welcome.

---

## 🧭 What it does

An agent's claim about your code is not knowledge. It is text.

nullius makes that text refusable. A load-bearing claim carries a citation —
an **Evidence Anchor** — in a fixed grammar:

```markdown
**Evidence:** `k8s/base/settings/deployment.yaml:12` — `  replicas: 2`
```

A checker then opens the file and re-verifies it. Every time. Forever.

```
OK          design.md:7   src/app.ts:1
FABRICATED  design.md:15  src/app.ts:2
          ! text does not appear anywhere in src/app.ts
```

That is the entire mechanism. Everything below is what gets built on top of it:
seven commands that ask seven different deterministic questions, and three
places to plug them in.

**The boundary that defines this project:** a model may propose, argue, draft,
and extract. Nothing a model returns is ever trusted as a result. Every verdict
that decides an outcome is produced by code re-reading the artifact.

---

## 👥 Who it's for

Find your row. Each links to the part you need — the sections stand alone, so
you can read one and stop.

| If you… | You get | Start with |
| --- | --- | --- |
| 📝 use **plan mode** (Claude Code) | Plans verified *before* you hit approve | [plugin](#plugin) → [`check`](#check) |
| 🤖 run **multi-agent sessions** | A journal of what the harness actually did, not what it says it did | [plugin](#plugin) → [`witness`](#witness) |
| 🔀 have agents write **PR descriptions** | "Safe — nothing else reads this field" becomes a checkable claim | [GitHub Action](#action) |
| 📐 have a **spec / RFC / ADR culture** | Fabricated premises die at authoring time; CI becomes a drift alarm | [`check`](#check) + [Action](#action) |
| 💬 **just ask the agent to do things** | A retrofit lane — no doc culture required | [`audit`](#audit) |
| 🧩 maintain **agent harness config** (skills, subagents, hooks) | Dangling references caught before they silently no-op | [`wiring`](#wiring) |
| 🧪 run **agent code review** | Proof the review pipeline is alive, rather than the assumption | [`canary`](#canary) |
| ✅ worry your **tests are being edited to pass** | Weakened graders raised as an obligation someone has to discharge | [`oracle`](#oracle) |

---

## ⚡ Quickstart

**1. Wire it into your repo.**

```sh
npx @nullius-inverba/kit init            # detects your repo, prints every file it writes
npx @nullius-inverba/kit init --dry-run  # or see the plan first, and write nothing
```

`init` picks a profile from what is actually on disk — `openspec/` means the
specs profile, `docs/` means prs, neither means plans — and tells you which
and why. Override with `--profile plans|prs|specs`.

Two things it deliberately **will not** do, and prints instead of doing:

- **It writes no hooks.** On Claude Code the plugin delivers those, and a
  second copy is a path nothing can tell apart from the first. It shows you
  the two `/plugin` lines instead.
- **It does not edit your agent instructions beyond one line.** Content goes
  in a kit-owned file under `.nullius/`; your CLAUDE.md gets a pointer at it,
  so upgrades never need merging.

**2. See it work — no adoption required.**

```sh
npx @nullius-inverba/claims demo
```

This builds a sandbox document plus a sandbox source file, then checks one
claim per verdict class.

<details>
<summary>📋 <strong>Every verdict class, as <code>demo</code> prints them</strong></summary>

```
OK            design.md:7  src/app.ts:1
DRIFT         design.md:11  src/app.ts:3
              ~ text is on line 1, not 3 — update the citation
FABRICATED    design.md:15  src/app.ts:2
              ! text does not appear anywhere in src/app.ts
WEAK-ANCHOR   design.md:20  src/app.ts:1
              ~ quote is 1 character(s) — quote enough of src/app.ts to be wrong if the code changes
WRONG-LINE    design.md:25  src/app.ts:5
              ~ text is on line 1, not 5 — the quote still identifies real code, so this is stale rather than wrong; update the citation
UNPINNED      design.md:30  src/app.ts:5
              ! quote matches several lines in src/app.ts and is on none of them at line 5 — neither half of this citation identifies anything
SEARCH-CLEAN  design.md:34  grep -rn 'MAX_RETRIES' src/ → 1
COUNT-MISMATCH design.md:38  grep -rn 'retry' src/ → 0
              ! claimed 0, actual 1
UNSAFE        design.md:42  grep -rn 'x' src/ && rm -rf / → 0
              ! not executed — contains forbidden character '&'
OK            design.md:46  binds at rollout-window
UNKNOWN-MOMENT design.md:47  binds at partial-composition
              ! 'partial-composition' is not a binding moment; use one of: build-time, rollout-window, inter-service-skew, event-consumption, replay-migration, data-at-rest
STALE         design.md:52  src/legacy.ts:1@782d707
              ~ verified at 782d707; that text is no longer in src/legacy.ts — the code moved on, so re-read it before relying on this claim
FABRICATED    design.md:57  src/legacy.ts:1@782d707
              ! text does not appear anywhere in src/legacy.ts as of 782d707 — that commit is immutable, so no later edit can explain this
```

</details>

**3. Check something of your own.**

```sh
npx @nullius-inverba/claims check 'docs/**/*.md'
```

**4. When something stops working.**

```sh
npx @nullius-inverba/kit doctor          # and `--fix` to re-render what it manages
```

Every mechanism here fails open — a hook that cannot run must never break your
session — so every failure is silent by design. `doctor` is where that silence
gets a voice. It checks only what local state can prove, labels the rest `??`
rather than guessing, and ends by running a fixture through your installed
recorder and validator, so the last line is a verdict you can re-run.

---

<a id="verbs"></a>

## 🧰 The verbs

Seven commands, one binary. Each asks a question that has a deterministic
answer — which is why none of them needs a model to decide anything.

| Verb | The question it answers | Is a model involved? |
| --- | --- | --- |
| [🔍 `check`](#check) | Did the author actually look? | **No.** It opens the file |
| [⚖️ `audit`](#audit) | Is the claim true? | Proposes only — `check` disposes |
| [📓 `witness`](#witness) | Did the checking actually happen? | **No.** A run's own journal, validated |
| [📉 `oracle`](#oracle) | Did the thing that grades the work get weaker, and did anybody say why? | **No.** A range diff against declared globs |
| [🔌 `wiring`](#wiring) | Do the harness's references point at things that exist? | **No.** Resolution against the filesystem |
| [📋 `rules`](#rules) | Which rules apply to these paths, and are they grounded? | **No.** Glob matching, then anchor verification |
| [🐤 `canary`](#canary) | Is the review pipeline that should catch this actually alive? | **No.** A registered plant, then a string search |

---

<a id="check"></a>

### 🔍 `check` — did the author look?

**What it does.** Re-verifies every Evidence Anchor in the matched markdown
against the working tree: the quoted text must be in that file, at that line.
It also runs *absence* claims — a declared `grep` whose result count the
document asserts — so "nothing else consumes this event" becomes falsifiable
too.

**Why it matters.** The value lands at a moment the checker never sees: **to
write a citation that will survive `check`, the agent has to open the file.**
Fabrication dies at authoring time, before any reviewer reads a word. This is
not a prompt trick — an instruction to "verify your claims" decays like every
instruction. What makes this one hold is that skipping it now produces a
deterministic `FABRICATED` verdict on the record instead of a private shortcut.
The checker is the ratchet; the authoring behavior is the product.

**Useful if you** write design docs, RFCs or ADRs · review agent-written plans ·
want a CI gate that cannot be argued with.

```sh
npx @nullius-inverba/claims check 'docs/**/*.md' --require-markers
```

```
OK           docs/rfcs/0004-cache.md:22  src/cache/index.ts:88
STALE        docs/rfcs/0004-cache.md:31  src/cache/evict.ts:14@a1b2c3d
             ~ verified at a1b2c3d; that text is no longer in src/cache/evict.ts
FABRICATED   docs/rfcs/0004-cache.md:44  src/cache/evict.ts:9
             ! text does not appear anywhere in src/cache/evict.ts
```

#### Two axes, which is why you stamp the commit

A citation asserts two different things, and they should not fail the same way.
Adding the commit you read at — `src/app.ts:12@a1b2c3d` — splits them:

- **"This text was in this file at this commit"** is a claim about the
  *author*. It is settled forever against something immutable, and it fails
  forever. Hard gate.
- **"It is on line N of the working tree"** is a claim about the *repository*.
  Once stamped it degrades only to the advisory `STALE`.

So a document cannot be turned red by someone else's refactor, and a
fabrication cannot be excused by one. Get the hash with
`git rev-parse --short HEAD` when you read the file, and check out with
`fetch-depth: 0` in CI so the history an anchor names is actually present. A
commit the clone does not have is never held against the author — the verdict
fails open as the advisory `UNVERIFIABLE-REV`, with the remedy in the message.

#### Coverage: the problem `check` cannot solve alone

An agent can anchor three easy truths and leave the load-bearing claim bare.
Three layers handle that:

1. **Anchor density.** `check` reports every document's anchor count against
   its length, with zero-anchor documents listed by name — so a 900-line plan
   with no checkable claims is visible at a glance. The checker never judges
   how many is enough; it makes the number legible. `--require-markers` sets
   the floor at one, **per document**, so one anchored file cannot license the
   rest.
2. **The [`[false-premise]` reviewer severity](plugin/reviewers/false-premise.md)**
   catches bare-prose claims the anchors missed.
3. **[`audit --propose`](#audit)** retrofits documents that were never
   anchored at all.

<details>
<summary>⚙️ <strong>Verdicts, and which ones fail</strong></summary>

| Verdict | Means | Fails? |
| --- | --- | --- |
| `OK` | Verified exactly as written | ✅ passes |
| `DRIFT` | Text found within a few lines of the cited one | ✅ passes (advisory) |
| `WRONG-LINE` | Text is in the file but nowhere near the cited line; the quote still identifies real code | ✅ passes (advisory) |
| `WEAK-ANCHOR` | Verified, but the quote is too short or too repeated to pin a line | ✅ passes (advisory) |
| `STALE` | Verified at the stamped commit; the working tree has moved on | ✅ passes (advisory) |
| `UNVERIFIABLE-REV` | The stamped commit is not in this clone — shallow checkout, fork, rewritten history | ✅ passes (fails open) |
| `UNPINNED` | The quote is **both** non-distinctive **and** not where it was cited — neither half identifies anything | ❌ **fails** |
| `FABRICATED` | The text is not in that file at all | ❌ **fails** |
| `COUNT-MISMATCH` | An absence search returned a different count than claimed | ❌ **fails** |
| `UNSAFE` | The declared search was refused by the sandbox | ❌ **fails** |
| `UNKNOWN-MOMENT` | A binding moment outside the project's closed vocabulary | ❌ **fails** |

`UNSAFE` is the security model working. Checked documents are untrusted,
PR-controlled input, so absence searches are parsed into an argv vector and
spawned **without a shell**, against a per-binary flag allowlist, and every
cited path — presence and absence lane alike — is validated before any file is
read.

</details>

<details>
<summary>⚙️ <strong>Flags</strong></summary>

| Flag | What it does |
| --- | --- |
| `--require-markers` | Fail when any matched document carries no grounding markers (floor is per document) |
| `--fix` | Repoint `DRIFT` / `WRONG-LINE` anchors that carry no `@rev` to the line their quote uniquely matches. Stamped anchors are never moved |
| `--stamp` | Add `@<head>` to unstamped anchors that hold at HEAD as well as in the working tree. A locally failing anchor is never stamped |
| `--format json` | One version-tagged JSON document on stdout and nothing else |
| `--config <path>` | Config file (default `nullius.config.json` if present) |
| `--probing` | Suppress the `CANARY-PRESENT` merge guard, for the one run deliberately checking a planted document |

</details>

---

<a id="audit"></a>

### ⚖️ `audit` — is the claim *true*?

**What it does.** Lists a document's claims as one dispatch each, for a model
to try to **refute**. Refutations come back as Evidence Anchors, so `check`
re-verifies them.

**Why it matters.** `check` certifies **form** — the text is at the cited
location. It deliberately never certifies **entailment**: a real line, quoted
accurately, sitting under a sentence it does not support, passes. `audit` is
that second half.

The design detail that makes it work is *starvation*. Each claim goes to its
own agent, alone — no title, no surrounding paragraph, no sibling claims — and
is told to refute it. Claims presented together imply a narrative, and a model
handed a narrative argues for it. One starved sentence has nothing to be loyal
to. And because refutations return as anchors that `check` re-runs, **no model
is ever in the verification path.**

**Useful if you** inherited documents that were never anchored · want a second
pass on claims that already verify · are retrofitting a repo with no doc
culture at all.

```sh
npx @nullius-inverba/claims audit design.md                  # the claims, one dispatch each
npx @nullius-inverba/claims audit design.md --emit-brief c1  # the starved brief for one claim
```

#### The retrofit lane

`--propose` is the confirmation-shaped mode: point it at any existing document
and the model hunts evidence **for** it, proposing anchors the checker then
verifies.

```sh
claude -p "$(npx @nullius-inverba/claims audit design.md --propose)"
```

Or `/audit <doc>` with the plugin installed. `REFUTED` claims come back with
counter-evidence; `SUPPORTED` claims get proposed anchors — yours to adopt, and
adopting them **is** the entailment review. Everything else moves to "Open
questions".

It is deliberately a peer of the refute-first default rather than the main
road, because a model sent to find support will find support.

<details>
<summary>⚙️ <strong>Flags</strong></summary>

| Flag | What it does |
| --- | --- |
| `--emit-brief <id>` | Print the starved brief for one claim — no siblings, no surrounding document |
| `--extract` | Print the brief that pulls **unanchored** claims out of the prose (extraction only; it may not judge them) |
| `--propose` | Hunt evidence *for* the document and propose anchors — the retrofit mode |

</details>

---

<a id="witness"></a>

### 📓 `witness` — did the checking actually happen?

**What it does.** Validates the journal a multi-agent run leaves behind: every
dispatch terminated, no verification cited after the thing it verified changed,
no omitted corrections.

**Why it matters.** A run's own account of itself is exactly as trustworthy as
a design doc. A session that dropped three agents on the floor summarises
identically to one that finished — unless something recorded the dispatches
independently. That is what the journal is for, and why the producer is a
**harness hook** rather than the agent: the record is not the agent's account
of itself, and the agent gets no opportunity to decline being recorded.

**Useful if you** run orchestrated multi-agent pipelines · have ever wondered
whether a "review" actually dispatched anything · want retros grounded in
dispatch counts rather than recollection.

```sh
npx @nullius-inverba/claims witness validate .nullius/runs/<session>.jsonl
npx @nullius-inverba/claims witness survey '.nullius/runs/*.jsonl'
```

`survey` validates every matched journal **independently** and adds up the
reports. Records are never merged into one timeline: two journals are two
worktrees, and a mutation in one must not stale a verification in the other.

#### Turning recording on

Recording needs the [plugin](#plugin), plus one directory:

```sh
mkdir .nullius
```

**The `.nullius` directory is the opt-in, not a config file.** Recording writes
a journal into your project, so it happens only where a human asked for it —
the hooks check for the directory and exit silently otherwise. Set
`NULLIUS_WITNESS=1` instead if you would rather not commit the directory. The
agent still cannot decline to be recorded; a person decides which repos keep
journals.

By default the hooks fetch the published recorder. To pin a local build, set
`NULLIUS_KIT_BIN` in `.claude/settings.json`:

```json
{ "env": { "NULLIUS_KIT_BIN": "node packages/kit/dist/cli.js" } }
```

> [!WARNING]
> **Do not copy hook entries into `.claude/settings.json`.** The plugin
> delivers them keyed on `${CLAUDE_PLUGIN_ROOT}`, and a second copy is a path
> nothing can tell apart from the first — including `doctor`.

<details>
<summary>⚙️ <strong>Flags, and the tier that does not ship yet</strong></summary>

`--expect-rules <rule-id...>` (validate only) fails the run if any named rule
id never reached a delivered verdict in this journal — `SILENT-RULE`
otherwise. The ids are what [`rules select`](#rules) named for that run.

Recording is the **hooks tier**: what the harness attests, and the agent had no
opportunity to decline. The **self-reported tier** — where an agent states what
it raised and whether anyone answered — is [schema v0.3](spec/witness-journal.md)
and has no producer yet. Journals not emitted by the harness must say so:
`--origin self-reported` certifies internal consistency and nothing about what
happened.

</details>

---

<a id="oracle"></a>

### 📉 `oracle` — did the graders get weaker?

**What it does.** Classifies every changed path across a git range against the
`oracles` globs you declare. `deleted`, `skipped` and `weakened` raise an
**obligation**, discharged by a witness-journal `decision` naming the same
`{path, change}` pair. Everything else is listed and raises nothing.

**Why it matters.** This is the question the other verbs cannot ask: **the
artifact that decides whether work is done is writable by the thing being
measured.** When a change makes a test fail there are two ways back to green,
and they produce identical output — fix the code, or fix the test.

Editing the test is *frequently correct*, so the check is not "did the oracle
change" but **was the change accounted for**. Git is the source rather than the
journal's own `mutation` records, because those come from hooks that watch
editing tools only: a `rm`, a `git rm`, or a script-driven deletion leaves no
record — and deletion is the highest-risk edit there is.

**Useful if you** let agents modify tests · maintain golden files or snapshots ·
have ever merged a green PR that got green by deleting an assertion.

```sh
npx @nullius-inverba/claims oracle main...HEAD --journal .nullius/runs/latest.jsonl
```

```json
{ "oracles": [{ "glob": "test/**/*.test.ts", "weakening": "\\bexpect\\(" }] }
```

#### Two honest limits

`weakened` is a declared pattern's match count compared across two revisions,
not a parsed syntax tree.

- A refactor merging two assertions into one is a **false positive**.
- An assertion gutted from `expect(x).toEqual(full)` to `expect(x).toBeDefined()`
  is a **false negative** the count cannot see.

It catches deletion-shaped weakening, which is the common case, and never
pretends to catch the rest — which is why it is advisory by default, and why
the message names the pattern and both counts, so a false positive is
dismissible in seconds.

And a project that declares no `oracles` is **told so** rather than shown a
clean zero:

```
no `oracles` declared in nullius.config.json — this run checked nothing.
  An unconfigured project and a project whose oracle held still are different
  facts, and only one of them is evidence.
```

<details>
<summary>⚙️ <strong>Flags</strong></summary>

| Flag | What it does |
| --- | --- |
| `--journal <path>` | Journal to read justifications from. Omitted, none is read — and the run says so rather than reporting a clean zero |
| `--strict` | Also fail on `UNJUSTIFIED-ORACLE-CHANGE`, which is advisory by default. `MALFORMED-JUSTIFICATION` fails either way — a mistyped class is an authoring error |

</details>

---

## 🛠️ Also shipped

Three narrower verbs. They matter most once you are running an agent harness
with its own configuration, rather than just checking documents.

<a id="wiring"></a>

### 🔌 `wiring` — do the references resolve?

**What it does.** Verifies that harness artifacts point at things that exist —
subagents, skills, read paths, `applies_to` globs, hook commands.

**Why it matters.** A dispatch naming a subagent with no definition file does
not error at runtime. **It no-ops.** The orchestration reports a completed
review and nothing reviewed anything, which looks exactly like the review that
found no problems.

**Useful if you** maintain `.claude/` config, custom subagents, or skills that
reference each other.

```sh
npx @nullius-inverba/claims wiring .
```

```
LOOSE-REFERENCE  .claude/skills/openspec-explore/SKILL.md:106  openspec/changes/<name>/proposal.md
                 ~ looks like a repo path but does not resolve — an example, or a pointer that moved
```

<a id="rules"></a>

### 📋 `rules` — which rules apply, and are they grounded?

**What it does.** Two subcommands. `select` emits the id of every rule under
`.claude/rules/` whose `applies_to` matches at least one given path, in a
stable order, then prints the excluded count. `rules check` verifies each
rule's frontmatter and its incident anchor, the same way [`check`](#check)
verifies any other document.

**Why it matters.** Rule selection is the step most often handed to a model,
and it is the step where a quiet miss is invisible — a rule that was never
selected and a rule that was selected and satisfied produce the same silence.
`select` is glob matching, no model involved, and it prints what it **excluded**
so a selection that silently narrows is visible. `rules check` then asks
whether each rule is grounded at all: a rule with no anchor anywhere in its
body is folklore.

**Useful if you** keep written engineering rules that agents are supposed to
follow, and want to know they were actually consulted.

```sh
npx @nullius-inverba/claims rules select --paths packages/claims/src/cli.ts
npx @nullius-inverba/claims rules check .
```

```
build-before-cli
model-proposes-code-verifies
verdict-needs-fixture-and-test

3 rule(s) selected, 5 excluded — a selection that silently narrows is the failure this verb exists to prevent.
```

Pair it with [`witness validate --expect-rules`](#witness) to fail a run where
a selected rule never reached a delivered verdict.

<a id="canary"></a>

### 🐤 `canary` — is the review pipeline alive?

**What it does.** `plant` inserts a registered, plausibly-false claim into a
document. You then run your review against it. `verify` reads the review's
report and exits `0` **CANARY-CAUGHT**, `1` **CANARY-MISSED**, or `3`
**CANARY-TAINTED** — the report named the probe machinery, so the probe is
invalid rather than passed.

**Why it matters.** A review pipeline that has silently stopped reviewing
produces the same output as one that found nothing wrong. A pipeline that flags
the plant is **demonstrably** alive; one that misses it has been *measured*
dead rather than *assumed* alive.

**Useful if you** run automated review as a gate and have no independent
evidence it still works.

```sh
npx @nullius-inverba/claims canary plant docs/design.md
# ... run your review, capture its report ...
npx @nullius-inverba/claims canary verify report.md
npx @nullius-inverba/claims canary clear
```

`status` shows the active canary and exits 1 while one is planted, so a planted
document cannot be merged by accident.

---

## 🔗 Where it plugs in

<a id="plugin"></a>

### Claude Code plugin

```
/plugin marketplace add armanfatemi/nullius
/plugin install nullius@nullius
```

Both lines are needed: `install` resolves `nullius@nullius` as
*plugin@marketplace*, so the marketplace has to be registered first.

| It delivers | What that gets you |
| --- | --- |
| `ExitPlanMode` hook | Every plan's anchors checked before you approve it (fail-open — it never breaks plan mode) |
| Authoring skill | The agent writes anchors in the first place |
| Witness recording hooks | The journal [`witness`](#witness) validates — see the `.nullius` opt-in |
| `/ground`, `/audit` | Check or audit any file on demand |
| `[false-premise]` reviewer block | A severity your reviewer agents can raise |

Details: [plugin/](plugin/).

<a id="action"></a>

### GitHub Action

```yaml
# .github/workflows/claims.yml
on: pull_request
permissions: { contents: read, pull-requests: write }
jobs:
  claims:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # `git show <rev>:<path>` needs the commit an anchor names
      - uses: armanfatemi/nullius/action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Zero further config: `pr-body` defaults to true, so this already checks the PR
description itself — **advisory only**. It comments; it never blocks until you
set `strict: true`.

| Input | Default | What it does |
| --- | --- | --- |
| `globs` | *(from config)* | Documents to check, space-separated and quoted |
| `pr-body` | `true` | Also check the PR description — the one claim-carrying document every workflow has |
| `strict` | `false` | Fail the job when any claim is unverified |
| `require-markers` | `false` | Fail when any matched document carries no anchors |
| `comment` | `true` | Upsert a PR comment with the report |
| `claims-version` | pinned | Pinning the action without pinning its checker is not a pin |

### Configuration

Optional. Lives in `nullius.config.json` at the repo root.

| Key | Default | What it sets |
| --- | --- | --- |
| `docs` | — | Glob patterns to check when none are given on the command line |
| `exclude` | — | Documents to skip — e.g. review logs that *quote* findings rather than assert them |
| `driftWindow` | `3` | How far from the cited line a match still counts as `DRIFT` |
| `moments` | six defaults | The project's closed binding-moment vocabulary |
| `minAnchorChars` | `8` | Shortest quote that reads as a real citation |
| `relaxedControl` | `true` | Re-run a zero-result absence search with a broadened pattern, as a control against a search pointed at nothing |
| `searchTimeoutMs` | `10000` | Wall-clock budget for a single absence search |
| `oracles` | — | The artifacts that grade this project — see [`oracle`](#oracle) |

Unknown keys are a **hard error**, deliberately. Details:
[packages/claims/](packages/claims/).

---

## 📚 What's here

| Piece | What it is |
| --- | --- |
| [Evidence Anchors spec](spec/evidence-anchors.md) | The authoring convention: load-bearing claims about existing code carry a re-verifiable citation |
| [Binding Moments spec](spec/binding-moments.md) | The companion for compatibility risks: name *when* the risk binds, from a closed per-project vocabulary |
| [Witness journal schema](spec/witness-journal.md) | What a run records, and the invariants `witness validate` enforces |
| [`@nullius-inverba/claims`](packages/claims/) | The CLI and library — all seven verbs plus `demo` |
| [`@nullius-inverba/kit`](packages/kit/) | `init`, `doctor`, and `witness record` — the producer that writes the journal from harness hooks |
| [GitHub Action](action/) | Advisory PR comments, `pr-body` mode, a hard gate when you opt in |
| [Claude Code plugin](plugin/) | Authoring skill, plan-approval hook, witness recording, `/ground`, `/audit`, `[false-premise]` |
| [Adopting the pipeline](docs/adopting-the-pipeline.md) | The longer walkthrough |
| [Known defects](docs/known-defects.md) | What is currently broken, recorded rather than hidden |

---

<br>

# Why it is built this way

*Everything above is what you install. Everything below is why the format is
shaped like that. Neither needs the other to be useful.*

---

<a id="why"></a>

## 🧠 The incident

Agents state things about your codebase constantly — in plans, PR descriptions,
design docs. *"Nothing else consumes this event."* *"The helper for X doesn't
exist yet."* *"This enum is `@shareable`."*

Some of those claims are wrong, and in multi-step, multi-agent development the
wrongness is invisible. Every later step reasons from the recorded claim rather
than the code, and every reviewer — human or LLM — checks whether the *plan* is
good, not whether its *premises* are true.

> **A false premise that supports a correct conclusion is invisible to every
> reviewer who agrees with the conclusion.**

We watched exactly that pass three review gates in the pipeline this tool was
extracted from. The incident is told in full in
[the spec](spec/evidence-anchors.md).

The fix is not a smarter reviewer. It is a citation convention plus a
deterministic checker that re-executes every citation, forever.

**At length:**
[Nobody Opposed the Delay](https://armanfatemi.substack.com/p/nobody-opposed-the-delay)
— why the useful question about a wrong claim is not why it was made but what
happened to the objection, and why the answer turned out to be a pipeline
rather than a better reviewer. It also tells the second incident behind this
repo: a rule checker that went quiet for a week while everything looked fine,
which is where the insistence on making absence loud comes from.

---

## 🤔 Why not transclusion?

Tools already exist that pull real source into a document — `embedme`, Sphinx
`literalinclude`, mdBook `{{#include}}`. They keep the snippet in sync
automatically. So why write the citation by hand?

**Because a transcluded snippet is true by construction, and that is exactly
why it proves nothing.**

The build step guarantees the text matches the file. It guarantees nothing
about whether anyone read it — a generated snippet attests that a build ran. An
Evidence Anchor is written by the author and can therefore be **wrong**, which
is what makes writing one require opening the file. Falsifiability is the
product.

So the two compose rather than compete: **transclude for documentation, anchor
for claims.**

| Approach | Drift-proof? | Catches fabrication? | Machine-re-checkable? |
| --- | --- | --- | --- |
| Prose claim | — | ❌ | ❌ |
| Transclusion (`embedme`, `literalinclude`) | ✅ | ❌ — generated text cannot be wrong | ✅ |
| GitHub permalink | ✅ | ❌ — nobody clicks it | ❌ |
| Link checker | — | ❌ — existence, not content | ✅ |
| Doctest | ✅ | ❌ — behaviour, not the claim | ✅ |
| **Evidence Anchor** | via `@rev` + `STALE` | ✅ | ✅ |

"A falsifiable, machine-re-checkable assertion about code" is the empty cell.

Which makes the modest description the accurate one, and it is worth saying
plainly: **this is a linter for a citation format.** The epistemics are why the
format is shaped this way; the linter is what you install.

---

## 📐 Design principles

1. **Deterministic over model-judged.** No model certifies truth anywhere in
   the loop — the checker opens the file. A verdict you can re-run is a verdict
   you can trust in CI.
2. **Verdicts certify form, never entailment.** A real-but-selectively-quoted
   line passes; whether the evidence supports the decision stays with
   reviewers. Advertised limits are the credibility.
3. **Untrusted input.** Checked documents are PR-controlled content: path guard
   before any read, grep/rg-only command sandbox, no chaining or redirection.
4. **Closed vocabularies.** An invented binding moment fails loudly instead of
   sliding through as plausible prose.
5. **Advisory first, facts only.** Report-only in CI until the team trusts the
   verdicts — and no anchors on judgment calls; citation theater trains readers
   to skim.
6. **Absence is loud.** A check that stopped running and a check that found
   nothing must never produce the same output. This is what `doctor`,
   `canary`, `rules select`'s excluded count, and the "no oracles declared"
   message all exist for.

---

<a id="roadmap"></a>

## 🗺️ Roadmap

- **`witness harvest`** — the other half of the retro kit: a bounded
  PR-evidence harvester plus the "bad witness" retro-agent conventions. The
  journal validator ships now; the harvester is held back until its conventions
  have more real-world mileage.
- **Self-reported witness tier** — [schema v0.3](spec/witness-journal.md) is
  written; no producer yet.
- **Open threads:** [`init`](https://github.com/armanfatemi/nullius/issues/1) ·
  [embedded `--eager`](https://github.com/armanfatemi/nullius/issues/6).

---

## 🏷️ The name

**nullius** is the first word of the motto the Royal Society chose in the 1660s
— coined for eminent men asserting things fluently while rooms of other eminent
men nodded. The npm scope
[`@nullius-inverba`](https://www.npmjs.com/org/nullius-inverba) takes the whole
of it.

Extracted from a working agent pipeline, where it gates every proposal before
any reviewer reads it.

---

## 🤝 Contributing

Issues and pushback are welcome — including on the conventions themselves.

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — setup, the house rules, and the one
  test failure that is not your fault (6 `flagConformance` tests fail on macOS
  with ugrep installed; that is environmental, and the table should not be
  changed to match).
- **[SECURITY.md](SECURITY.md)** — checked documents are untrusted input, so
  the interesting boundary is everything a document can reach. Report privately;
  never in a public issue.
- **[Code of conduct](CODE_OF_CONDUCT.md)** — criticise work, not people.

PRs land as **merge commits, never squashed**: a squash orphans the commits that
rev-stamped anchors name, and the checker then fails open — a disarmed gate and
a satisfied one produce the same green check.

---

## License

MIT © Arman Fatemi
