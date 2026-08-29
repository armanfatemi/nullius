---
name: recompute-path-guards-off-symlinked-tmp
description: Re-run any new path-containment guard against a NON-symlinked repo path — macOS os.tmpdir() is behind /var -> /private/var, so tests that exercise the guard there pass by accident and hide both over- and under-rejection
metadata:
  type: feedback
---

When a diff adds a path-containment check (`resolve(a).startsWith(resolve(b) + sep)`,
"is this dir inside the worktree", "is this path under root"), do not accept the
test suite as evidence it behaves. Recompute it yourself against a repository at a
path with **no symlinked component**.

**Why:** On `add-journal-identity` (2026-08-29, commit `3940f91`) a guard meant to
refuse a git common dir resolving inside the worktree rejected the *ordinary* case:
`git -C <root> rev-parse --git-common-dir` answers `.git`, which resolves to
`<root>/.git` — literally inside the toplevel. Every real repo lost the `worktree`
field. The whole kit suite still passed locally because `os.tmpdir()` on macOS is
`/var/folders/...` while git's `--show-toplevel` returns the realpath
`/private/var/folders/...`; the two sides were never in the same form, so
`startsWith` never fired. CI is `ubuntu-latest`, where the two forms match and the
pre-existing positive assertion would have failed.

**How to apply:** `path.resolve()` normalises but does **not** canonicalise
symlinks; `git` returns realpaths. Any comparison between a caller-supplied root
and a git-reported toplevel is comparing two different forms. Reproduce the guard
in a five-line node script against a real path (e.g. under `$HOME`, not `$TMPDIR`)
before believing either a pass or a fail. Related:
[[feedback-verify-counts-not-just-anchors]] — same shape: the suite verifies the
thing it was pointed at, not the claim wrapped around it.
