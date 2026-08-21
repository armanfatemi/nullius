# Project context — nullius

Deterministic epistemic tooling for agent systems. The shipped surface is a
citation checker (`check`), a premise auditor (`audit`), and a run-journal
validator (`witness validate`), delivered as a CLI, a GitHub Action, and a
Claude Code plugin.

## Product boundary (decided 2026-08)

One repo, two products, one dependency direction:

- **The trust kernel** — `@nullius-inverba/claims`, bin `nullius`. Everything
  that renders a verdict: `check`, `audit` briefs, `witness validate`, `demo`,
  and deterministic authoring ergonomics. Constraints are absolute: no model in
  any verification path, no network, minimal dependencies, closed vocabularies,
  new verdict families get new unions. Its command surface stays small.
- **The kit** — working name `@nullius-inverba/kit` (final name open; the
  `packages/witness` placeholder is resolved into it). Everything that installs
  or produces: `init`, `doctor`, the witness hook pack (`witness record`),
  compliance-brief wiring, and — later, behind evidence of demand — the run
  sequencer, roles, and `learn`. Depends on the kernel; the kernel never
  depends on it. Harness-coupled code (Claude Code hook payload parsing) lives
  here so the kernel's audit surface stays frozen.

A repo split is deferred, with explicit exit criteria: kit issue volume rivals
the kernel's, or a second harness adapter lands. Until then the package
boundary provides the separation (bins, READMEs, versions) without doubling
maintenance.

## Where the witness journal is going (stated 2026-08)

The journal is not an end in itself. It is the capture layer for a **run
ledger**: a machine-readable account of what happened during an agentic
session — which agents were dispatched, what each raised, what became of it,
what was checked, and what was decided — from which human-readable artifacts
are *rendered* rather than hand-written.

The target artifact already exists in the wild, maintained by hand: files like
`openspec/changes/<change>/review-evidence.md`, which record staged reviewer
rounds, findings with severities, dedup across reviewers, conflicts resolved
against code, verification runs, and accepted deviations. Over a hundred of
them exist across projects. **The success test for this line of work is that
such a file becomes generated output.** Rendering must stay deterministic and
model-free, like every other verdict path here.

That destination sets the priorities, and they are not obvious from the
invariants alone:

- The ledger is for **any** agent in a run, not only reviewers — implementers,
  devil's advocates, synthesizers, verifiers. A run may render several
  projections (review evidence, implementation log) from one journal.
- Findings need identity, severity, an author, and a recorded fate, or a
  synthesis can drop one and nothing says so. That is IDEAS.md's *dissent
  conservation*, and it is the invariant this domain most needs.
- Structure earns its keep only if it survives contact with real ledgers. The
  vocabulary comes from the existing corpus, not from first principles — the
  same discipline the hook payload probes enforce.
- Harness hooks can only ever emit `dispatch`, `report`, and `mutation`: no
  tool call states that something was checked, relied upon, or corrected. The
  ledger layer is therefore self-reported by construction, and the attested
  skeleton is what audits it — a reviewer the harness saw dispatched, which
  filed neither findings nor an explicit "None.", is a silent reviewer.

Projections land beside the change they describe so that `learn` can read
across them later, turning per-agent findings into rates rather than
anecdotes.

## Conventions for proposals in this directory

- Proposals dogfood the tool: load-bearing claims about existing code carry
  Evidence Anchors, rev-stamped. Verify with
  `node packages/claims/dist/cli.js check 'openspec/**/*.md'` from the repo
  root (after `pnpm build`). Claims about external systems (e.g. Claude Code
  hook payload shapes) cannot be anchored and are listed as assumptions to
  verify, never asserted as fact.
- Design principles from the README bind here too: deterministic over
  model-judged; verdicts certify form, never entailment; checked documents are
  untrusted input; closed vocabularies; advisory first.
- A new deterministic verdict must be computable from closed vocabularies and
  byte equality/hashes. Anything requiring classification of free text is a
  brief for a model, not a verdict.

## Change sequence

1. `add-witness-recording` — journal schema v0.2 + the producer (hook pack).
   Schema work lands first; everything else stands on it.
2. `add-init-doctor` — the kit's front door; consumes the managed-artifact
   conventions the hook pack defines.
3. `add-rules-compliance` — rules as checkable objects; `SILENT-RULE` depends
   on recording (1).
4. `add-authoring-ergonomics` — kernel-only; independent of the others, can
   land any time.

## Deferred ledger (on the record, not scoped)

Kept out of the current changes deliberately, with the reason:

- **`run` (pipeline sequencer)** — deferred until 1–3 ship; v1 would be a
  four-stage sequencer (ground → comply → audit → gate) over existing verbs,
  not the nine-stage pipeline. Publish the full flow as a documented pattern
  first; build the state machine only if usage demands it.
- **Roles / per-role memory** — the generator (roles → `.claude/agents/*.md`)
  and memory-files-as-anchored-docs are cheap and can ride later changes. A
  content-based `DECORRELATION-BREACH` verdict is rejected as unsound:
  "this brief contains a denied information class" is classification, not a
  deterministic check. Only the provenance form is admissible (the brief
  generator declares which sources it rendered from; the verdict checks the
  declaration against the role's `receives` list) and it arrives with `run`.
- **`learn`** — worthless until journals accumulate in the wild; ships later
  as a local verb (brief out, proposals into `.nullius/proposals/`, adoption
  is always a PR). Recurrence counters use crude closed keys
  (rule id × verdict × path) with the crudeness documented. No scheduled
  model-in-CI.
- **Adapter API / other harnesses** — capabilities are represented as data
  inside the kit with a single Claude Code implementation; a public adapter
  contract is written only while porting to the second real harness.
- **entire.io as evidence source** — network I/O; if ever, a separate verb in
  the kit, never a dependency of `check`.
- **GitHub App attestor** — honest scope when it comes: it can re-run checks
  with a trusted identity; it cannot attest client-side process. Three trust
  tiers hold: re-executable (anchors, real today) / internally consistent
  (`witness validate`, real today) / attested (App, later).
- **OSS-maintainer contributor requirements** — require only what a human can
  cheaply produce (anchors in PR descriptions); journals are verified when
  present and surfaced, never required.
