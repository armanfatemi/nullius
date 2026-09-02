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
2. **Nothing else.** `.claude/settings.json` here carries plugin enablement and
   no more — in particular it does **not** set `NULLIUS_KIT_BIN`, so the hooks
   take the default `npx -y @nullius-inverba/kit` path. That is the one real
   users take, and nothing else in this repository exercises it.

   The trade is deliberate and worth knowing: **a change to
   `packages/kit/src/**` is not exercised by this repo's own recording until it
   is published.** The journals in `runs/` are written by whatever version npm
   is serving, so they can lag the working tree by a whole schema version — see
   "Reading what it produces" below.

   If the recorder cannot run at all, the hook says so **loudly** on stderr
   rather than silently recording nothing: an empty `runs/` must never be
   indistinguishable from a session where nothing happened.

`pnpm build` is still required before any *checker* run — every gate in this
repo invokes `node packages/claims/dist/cli.js` against the working tree, so
`build-before-cli` applies here exactly as it does everywhere else. It is just
not what makes the recorder work.

## The two probe directories, which are not the same thing

`nullius` has two directories with `probes` in the path, and conflating them is
the mistake this section exists to prevent.

**`spec/fixtures/probes/claude-code/` is a committed corpus.** It holds
recordings of real hook payloads, and `doctor` replays them through the real
extractor so that a harness upgrade which changes payload shape fails a check
instead of quietly producing empty journals. It is a regression test over
recordings, it belongs in the repository, and it is checked into git.

**`.nullius/probes/` is live capture.** It holds the latest raw payload per
event type from *this machine*, it is gitignored, and it is how the corpus gets
fed. Nothing replays it; it is raw material.

A green corpus check therefore says nothing about whether capture is currently
configured. That is why `doctor` reports on both, and why the capture-state
report names the live directory explicitly.

## Turning capture on, and why it is off

Capture is off unless a settings file asks for it:

```json
{ "env": { "NULLIUS_WITNESS_PROBE": "1" } }
```

The value must be exactly `1`. The recorder tests for that string, so `0` — or
`true`, or `yes` — does not capture.

Set it in `.claude/settings.json`, `.claude/settings.local.json`, or your user
settings. `doctor` reads all three and reports what each says; it deliberately
does not tell you which one wins, because settings precedence is the harness's
behaviour and this repository has nothing that establishes it. It also cannot
see a variable exported in the shell that launched the harness, and says so
rather than guessing.

**Why this is opt-in rather than the default.** A raw payload is the payload:
prompt text, tool inputs and outputs, and absolute paths including your home
directory. The committed corpus had to have the last of those redacted before
it could be shared. Persisting that by default would be this tool making a
privacy decision on your behalf, and it is not the tool's decision to make.
`init` names the option and never enables it.

Redaction of captured payloads is not solved here. If you turn capture on,
`.nullius/probes/` holds unredacted payloads until you delete them.

## Reading what it produces

```sh
node packages/claims/dist/cli.js witness validate .nullius/runs/<session>.jsonl
```

**Every journal on disk declares `version: "0.2"`**, because they were written
by the published kit. The working tree's producer writes `0.6`; you will not
see a `0.6` header here until that version ships to npm. Read a header's
`version` before concluding anything about what a journal should contain.

The ledger records **do** have a producer now — `witness ledger`, added by
`add-run-ledger-producer` — and `stage`, `decision`, `finding` and `prompt`
records appear in journals in this directory. They carry
`origin: "self-reported"`, which is the point: a coordinator's account of its
own run must never be laundered by a header that says `hooks`.

Two consequences of the published-kit lag, both visible in `runs/` today:

- **`report.model` is almost always absent.** The model rides in the
  `.links.json` sidecar, because `SubagentStop` carries no model at all and the
  launch acknowledgement is the only event that states it. That is `0.6`
  behaviour, so the older sidecars use the bare-string form and record no model.
- **No header carries `user`.** `user: { name }` is `0.6` as well.

Neither is a defect in the recorder. Both are what "the hooks run the published
kit" costs, and the cost is paid in the field the reader wanted.
