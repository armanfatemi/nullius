---
name: setup
description: Guided onboarding for nullius in this repo — detects test frameworks to propose Oracle config, offers the GitHub Action CI check, and walks through enabling the hook plugin. Use when a user asks to set up, install, enable, configure, or onboard nullius, or asks what nullius needs to be fully working here.
allowed-tools: Bash(npx -y @nullius-inverba/kit:*), Bash(npx nullius-kit:*), Bash(nullius-kit:*)
---

# nullius setup — guided onboarding

You are walking a human through onboarding nullius in this repository,
conversationally. Every actual read and write goes through the nullius kit
CLI via the `Bash` tool — this skill's `allowed-tools` frontmatter does not
grant you `Write` or `Edit`, so you have no way to touch
`.claude/settings.json` or any other file directly, even if you wanted to.
That is deliberate: **you propose and relay; the CLI is what decides and
writes.** If at any point completing a step seems to require writing a file
yourself, stop and tell the human what step is blocked and why, rather than
finding another way to write it — the two commands at the very end of this
skill are the only thing that ever installs hooks, and they are commands you
hand to the human, never something you run for them.

Do not use `init --interactive` in this skill. It opens a terminal prompt
UI that assumes a human is typing directly into a TTY; run through a `Bash`
tool call, its stdin is not a TTY, and it will just fall back to defaults
silently. Everything below drives the same underlying flow through explicit
flags instead — the flag surface a human's TTY session also answers into,
just supplied directly.

## 1. See what's already there

Run:

```
npx -y @nullius-inverba/kit doctor
```

Read the report. If nullius has never been set up here, most checks will
report absence rather than failure — that's expected, not an error. Tell the
human in one or two sentences what state you found, then continue.

## 2. Confirm the profile

Run:

```
npx -y @nullius-inverba/kit init --root . --dry-run
```

This prints the detected profile (`plans`, `prs`, or `specs`) and every file
it would write, without writing anything. Tell the human which profile was
detected and why (the tool prints its reason), and ask if they want a
different one — if so, everything below takes `--profile <name>` the same
way.

## 3. Propose Oracle globs — never write from a guess

Run:

```
npx -y @nullius-inverba/kit init --root . --suggest-oracle
```

This is read-only: it prints candidate globs (or says none were detected)
and touches nothing. Present whatever it printed to the human as a proposal,
in your own words — do not just paste the raw output. Ask them to accept,
edit, or decline:

- **Accept as proposed** → carry the printed globs forward to step 5 exactly
  as printed.
- **Edit** → ask what they'd rather declare, and carry their answer forward
  instead. It still has to be a comma-separated list of non-empty globs; the
  `init` command in step 5 will reject anything else itself, so you do not
  need to validate it yourself beyond checking it is not blank.
- **Decline / nothing detected and they don't want to type one** → carry no
  Oracle answer forward at all. Do not invent a placeholder glob to fill the
  gap — an unconfigured Oracle is a legitimate, reported state, not a defect
  to paper over.

## 4. Offer the GitHub Action

Ask the human, in your own words: "Add the nullius GitHub Action CI check to
this repo?" If the profile from step 2 already includes it (`prs` and
`specs` do; only `plans` doesn't), say so and skip the question — there is
nothing to add.

## 5. Write it

Run exactly one of, depending on what was decided above (omit `--oracle` if
step 3 ended in no answer; omit `--action` if step 4 ended in no or was
skipped):

```
npx -y @nullius-inverba/kit init --root . [--profile <name>] [--oracle "<glob>[,<glob>...]"] [--action]
```

Report the command's own output back to the human — the write-log it prints
is the source of truth for what happened, not your summary of your intent.

## 6. Hand off the one step you cannot do

Tell the human, plainly, that hooks are delivered only by the Claude Code
plugin and that this is the one step nothing in this skill — or anything
else — can perform on their behalf. If step 1's `doctor` output showed the
plugin is not yet enabled, give them exactly these two lines to run
themselves:

```
/plugin marketplace add armanfatemi/nullius
/plugin install nullius@nullius
```

If `doctor` already showed the plugin enabled, say so instead and skip this.

## 7. Close with a real diagnostic, not a claim

Run:

```
npx -y @nullius-inverba/kit doctor
```

Report what it actually says. If they haven't run the two `/plugin` lines
yet, `doctor` will still show hooks as undelivered — that's correct, not a
bug in this skill, and it will resolve itself once they run those two
commands. Do not tell the human setup is "complete" — tell them what
`doctor` reported, which is the thing that is actually checkable from here.
