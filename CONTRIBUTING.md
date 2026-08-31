# Contributing to nullius

Issues and pushback are genuinely welcome — the README says so, and this file
is what it should have pointed at.

This project is pre-1.0 and opinionated. The opinions are written down, which
means you can disagree with a specific sentence rather than with a vibe. If a
rule below looks wrong, saying so **is** a contribution.

## The one rule that governs the rest

> **The model proposes; code verifies.**

A model may generate candidates, extract claims, draft briefs, and argue.
Nothing a model returns is trusted as a result. Every judgement that decides an
outcome is made by deterministic code re-reading the artefact.

A change that puts a model anywhere in the verification path is the wrong
change, however well it performs. If a design seems to need one, the fix is to
find the deterministic question underneath and ask that instead — or to say
plainly that there isn't one. See `.claude/rules/model-proposes-code-verifies.md`.

## Getting set up

```sh
pnpm install
pnpm build        # required before ANY CLI use
pnpm type-check
pnpm test
```

**`pnpm build` first, always.** The CLIs run from `dist/`. An unbuilt tree
checks the *previous* version of the code and reports success on work that does
not exist yet — no warning, no stale-artefact notice. That is this project's own
thesis turned back on it, and it is easiest to hit in the tool's own dev loop.

### A test failure that is not your fault

`src/flagConformance.test.ts` fails **6 tests** on machines where `grep` is
ugrep — typically macOS with ugrep installed. That is a real difference between
the declared flag table and your local binary, not a regression.

**Do not chase it, and do not "fix" the table to match.** CI runs real GNU grep
and ripgrep. If you see 6 failures and they are all in that file, you have not
broken anything.

## Making a change

1. **Branch from `main`.** Never commit to `main` directly.
2. **Write the failing test first, and run it.** A test that has never been
   observed failing has not been shown to test anything.
3. **Adding a verdict? It needs a fixture *and* a unit test.** Both. The
   dogfooding gates assert exit codes, and a must-fail fixture breaks several
   invariants at once — so the exit code stays 1 while any single verdict still
   fires. A fixture alone cannot tell a verdict that went quiet from one that
   never had anything to say.
4. **Run the checks** above, plus the dogfooding gates in `CLAUDE.md`.
5. **Open a PR.** Describe what changed and why; the template will prompt you.

## Evidence Anchors — the house convention

Load-bearing claims about existing code carry a citation that a checker
re-verifies:

```markdown
**Evidence:** `path/to/file.ts:88@a1b2c3d` — `const result = await retry(...)`
```

This applies to design docs, proposals, and PR descriptions — anywhere a claim
about the code is being used to justify a decision. It does **not** apply to
judgement calls, opinions, or anything you cannot cite. A claim you cannot
support goes under "Open questions" instead. Citation theatre trains readers to
skim, which is worse than no citations at all.

Verify with the tool, never by hand:

```sh
node packages/claims/dist/cli.js check 'spec/**/*.md' --require-markers
node packages/claims/dist/cli.js check 'openspec/**/*.md'
```

Two rules that will otherwise bite you:

- **Stamp anchors in `openspec/changes/**` from the first draft**, with
  `git rev-parse --short HEAD` at the moment you read the file. A proposal cites
  code it is *about to modify*, so an unstamped anchor there is designed to rot.
- **Never move a line number while keeping the old stamp.** That rewrites a
  true assertion into one that was never true, and turns an advisory `STALE`
  into a hard `FABRICATED`. Re-stamp both halves, or leave it alone. Run
  `check` and let the verdict tell you which case you are in.

The full set lives in `.claude/rules/`.

## Merging

**Pull requests land as merge commits. Never squash.** A squash rewrites the
branch into one new commit and leaves the originals unreachable, so every anchor
stamped against a branch commit names a hash the clone cannot resolve. The
checker then fails open — which is correct behaviour, and exactly why this
matters: a disarmed gate and a satisfied one produce the same green check.

If a PR gets squashed anyway, re-pin its anchors to the squash commit.

## Larger changes

Anything that adds a verb, changes a verdict's meaning, or alters the config
schema goes through `openspec/changes/<name>/` as proposal → design → specs →
tasks, gated by `openspec validate <change>`.

One parser quirk worth knowing: OpenSpec's requirement check reads **only the
first line** of a requirement body when looking for SHALL/MUST. A requirement
whose modal verb wraps to line two is rejected with a message that is true of
the parser's window and false of your document. Put the verb on the first line.

## Reporting a security issue

Do not open a public issue. See [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree your contributions are licensed under the MIT
Licence, the same as the rest of the project.
