# wiring

## ADDED Requirements

### Requirement: Declared references resolve

The checker SHALL report a hard verdict for every declared reference — an
agent name, a skill name, a read path, an `applies_to` glob, or a hook
command — that does not resolve against the working tree.

#### Scenario: A skill dispatches an agent with no definition

- **WHEN** a skill declares `dispatches: [ghost-reviewer]` and no
  `.claude/agents/ghost-reviewer.md` exists
- **THEN** the checker reports `DANGLING-AGENT` and exits non-zero

### Requirement: Prose references are advisory

The checker SHALL report an unresolvable backticked path in an artifact body
as advisory `LOOSE-REFERENCE`, and SHALL NOT fail the run for it.

#### Scenario: An agent's prose names an example path

- **WHEN** an agent body contains `` `src/example/Thing.ts` `` and that file does not exist
- **THEN** the checker reports `LOOSE-REFERENCE` and exits zero
