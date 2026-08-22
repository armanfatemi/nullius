# wiring Specification

## Purpose

Whether the instructions a harness carries still point at things that exist.

Agents, skills, rules and hooks reference each other by name and by path, and
nothing checks that the referent is there. A skill dispatching an agent with no
definition file does not error: the dispatch no-ops, the run finishes, and the
report says a review happened. That is the worst shape a failure takes in this
project — success reported over work not done — and it is a filesystem fact,
which is why it belongs to a checker and not to a reviewer.

One split makes it usable. Only declared fields fail. A path written in prose
may be a live pointer or an illustrative example, and nothing distinguishes
them mechanically, so an unresolvable one is advisory. Frontmatter is where an
author committed to a reference, and that is where the hard verdicts read.

What the checker cannot resolve, it declines rather than guesses. A hook
command it cannot narrow to exactly one repo-relative script is left unchecked
and said to be unchecked, because a false failure on a working hook is what
gets the whole check switched off — and a check nobody runs catches nothing at
all.

## Requirements
### Requirement: Declared references resolve

The checker SHALL report a hard verdict for every declared reference — an
agent name, a skill name, a read path, or an `applies_to` glob — that does
not resolve against the working tree, and SHALL do the same for every hook
command it can resolve, unambiguously, to exactly one repo-relative script.

A hook command line the checker cannot resolve to exactly one repo-relative
script — two candidate tokens, any backslash, or whitespace in a candidate —
is declined rather than checked, and is not counted among the declared
references a clean run reports.

#### Scenario: A skill dispatches an agent with no definition

- **WHEN** a skill declares `dispatches: [ghost-reviewer]` and no
  `.claude/agents/ghost-reviewer.md` exists
- **THEN** the checker reports `DANGLING-AGENT` and exits non-zero

#### Scenario: A hook command is ambiguous

- **WHEN** a hook's `command` value contains two tokens that each look like
  a repo-relative script
- **THEN** the checker declines to check that command, reporting no finding
  and no reference for it

### Requirement: Prose references are advisory

The checker SHALL report an unresolvable backticked path in an artifact body
as advisory `LOOSE-REFERENCE`, and SHALL NOT fail the run for it.

#### Scenario: An agent's prose names an example path

- **WHEN** an agent body contains `` `src/example/Thing.ts` `` and that file does not exist
- **THEN** the checker reports `LOOSE-REFERENCE` and exits zero

### Requirement: Unsubstituted template tokens are reported

The checker SHALL report a hard verdict when a scanned artifact's text
contains an unsubstituted template token anywhere in that text, not only
inside a declared frontmatter field. A `{{...}}` placeholder is scaffolding
left behind by a port, not a name or path that failed to resolve, and it is
reported the same way whether it appears in frontmatter, in prose
instructions, or in a hook's JSON value.

#### Scenario: A scaffolded hook command was never adapted

- **WHEN** a hook's `command` value — not a frontmatter field — contains
  `{{SCRIPT_PATH}}`
- **THEN** the checker reports `UNSUBSTITUTED-TOKEN` and exits non-zero
