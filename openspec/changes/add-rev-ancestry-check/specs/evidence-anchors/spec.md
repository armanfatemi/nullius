# Evidence Anchors — stamped anchors report unreachable history

## ADDED Requirements

### Requirement: A stamped anchor whose commit is not an ancestor of HEAD is reported, advisory

The checker SHALL report `unreachable-rev` when a rev-stamped anchor's
commit resolves and its content matches, but the commit is not an ancestor
of `HEAD`.

`unreachable-rev` SHALL be an advisory verdict. It SHALL NOT cause `check`
to fail on its own.

The ancestry check SHALL run only after the content check at the stamped
commit has already passed. It SHALL NOT run, and SHALL NOT affect the
verdict, when the content check has already failed.

When the ancestry check cannot be performed (git unavailable, timeout, no
resolvable `HEAD`), the checker SHALL leave the verdict unchanged — this
axis fails open, on the same rule as an unresolvable commit already does.

#### Scenario: A resolvable, ancestor commit is unaffected

- **WHEN** a stamped anchor's commit resolves, its content matches, and the commit is an ancestor of `HEAD`
- **THEN** the verdict is `ok`, unchanged from today

#### Scenario: A resolvable, non-ancestor commit is reported advisory

- **WHEN** a stamped anchor's commit resolves, its content matches, and the commit is NOT an ancestor of `HEAD`
- **THEN** the verdict is `unreachable-rev`, and the run does not fail because of it

#### Scenario: A failing content check is not overridden by ancestry

- **WHEN** a stamped anchor's commit resolves but its content does not match (e.g. `fabricated`), and the commit is also not an ancestor of `HEAD`
- **THEN** the verdict reflects the content check's own failure, not `unreachable-rev`
