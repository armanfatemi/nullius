---
id: rev-stamp-change-anchors
applies_to:
  - openspec/changes/**/*.md
severity: blocker
---

# Stamp anchors in change proposals from the start

Every Evidence Anchor written inside `openspec/changes/` carries a commit
stamp — `path/to/file.ts:88@a1b2c3d` — obtained with `git rev-parse --short
HEAD` at the moment the cited file was read. Not added later, not added at
review time. From the first draft.

## What goes wrong

A change proposal is the one document class that cites code it is *about to
modify*. Its anchors are therefore designed to rot: a proposal quoting a line
as the reason to delete that line becomes `FABRICATED` the instant the change
lands, and the document is punished for having been accurate.

The stamp splits the citation onto two axes that fail differently. "This text
was in this file at this commit" is settled forever against something
immutable, and stays a hard gate. "It is on line N of the working tree" is a
claim about the repository, and once stamped it degrades only to the advisory
`STALE`. Without the stamp both collapse into one working-tree comparison,
and the honest author gets called a fabricator by their own merge.

The repair path is what makes this a blocker rather than a nuisance. Faced
with a red gate on a landed change, the tempting fixes are to delete the
anchor or to repoint it — the first removes the evidence, the second violates
`never-repoint-under-old-stamp`. Stamping at authoring time costs one command
and forecloses both.

## The incident

Change proposals are gated in CI as their own pass, separate from the specs,
precisely because they rot on a different schedule:

**Evidence:** `.github/workflows/ci.yml:149@52f64ec` — `node packages/claims/dist/cli.js check 'openspec/**/*.md'`
