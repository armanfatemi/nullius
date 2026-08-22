# wiring

## ADDED Requirements

### Requirement: A hooks or settings file that fails to parse is reported

The checker SHALL report a hard verdict when a hooks or settings JSON file
cannot be parsed, instead of silently treating it as having no hooks.

#### Scenario: A hooks file has invalid JSON

- **WHEN** a plugin's hooks/settings file is not valid JSON
- **THEN** the checker reports `MALFORMED-HOOKS` for that file and exits
  non-zero, instead of reporting zero hooks with no finding

### Requirement: An unclosed frontmatter fence is reported

The checker SHALL report a hard verdict when a markdown artifact's
frontmatter fence is opened and never closed, distinguishing that case from
an artifact that never attempted frontmatter at all.

#### Scenario: A frontmatter block opens and never closes

- **WHEN** a markdown artifact's first line is `---` and no later line is a
  matching closing `---`
- **THEN** the checker reports `UNCLOSED-FRONTMATTER` for that artifact and
  exits non-zero, instead of silently reading every declared field
  (`dispatches`, `skills`, `reads`, `applies_to`) as empty

#### Scenario: An artifact with no frontmatter is unaffected

- **WHEN** a markdown artifact's first line is not `---`
- **THEN** the checker reports nothing about frontmatter for that artifact —
  this requirement applies only to a fence that was opened
