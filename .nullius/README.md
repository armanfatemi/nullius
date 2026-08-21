# `.nullius/` — this repo records its own runs

This directory is not configuration. **Its existence is the opt-in.**

`plugin/hooks/witness-record.sh` and `witness-check.sh` both check for it
before doing anything:

```sh
if [ ! -d "$root/.nullius" ]; then
  cat > /dev/null || true
  exit 0
```

Recording writes a journal into a project, so it happens only where a human
put this directory (or set `NULLIUS_WITNESS=1`). The agent cannot decline to be
recorded — that is the point — but a person decides which repos keep journals.

This file exists so the directory survives a clone: `.gitignore` excludes
`.nullius/runs/` and `.nullius/probes/`, which are per-machine artefacts, but
not the directory itself.

## Why here, of all repos

`nullius witness` had never been run on nullius. It recorded other people's
agent runs and kept no account of its own — which is a strange position for a
tool whose thesis is that unrecorded work launders into evidence of absence.

## What you need for it to work

1. **The plugin**, which delivers the hooks:
   ```
   /plugin marketplace add armanfatemi/nullius
   /plugin install nullius@nullius
   ```
2. **A build**, because `.claude/settings.json` pins the recorder to this
   repo's own kit rather than a published copy from npm:
   ```json
   "NULLIUS_KIT_BIN": "node packages/kit/dist/cli.js"
   ```
   Run `pnpm build` first. If the binary is missing the hook fails **loudly**
   on stderr rather than silently recording nothing — an empty `runs/` must
   never be indistinguishable from a session where nothing happened.

## Reading what it produces

```sh
node packages/claims/dist/cli.js witness validate .nullius/runs/<session>.jsonl
```

Journals from this repo are v0.2 (hooks tier). The v0.3 ledger records —
`stage`, `finding`, `resolution`, `check`, `decision` — have no producer yet;
that is the follow-up to `add-run-ledger`, tracked in `IDEAS.md`.
