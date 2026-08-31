# Evidence Anchors — the git lane asks rather than infers

## ADDED Requirements

### Requirement: A stamped anchor's verdict SHALL NOT depend on the length of its hash

The checker SHALL determine whether a stamped commit exists by asking git
directly, and SHALL NOT infer it from the wording of a path error. A commit
that does not exist SHALL be reported as unresolvable whether its hash is 7
characters or 40.

#### Scenario: The same absent commit, written two ways

- **WHEN** a document cites text present in the working tree, stamped with an absent commit written as 7 hex characters, and the same claim stamped with the same absent commit written as 40
- **THEN** both claims receive the same verdict

#### Scenario: A file genuinely absent at a resolvable commit still fails

- **WHEN** a stamped anchor names a commit that exists and cites a path that was not in it
- **THEN** the verdict is `missing-file-at-rev` and the run fails, unchanged

### Requirement: The git lane SHALL resolve paths from the checked root

The checker SHALL address blobs relative to the directory it was pointed at,
so that a citation refused by the working-tree lane for being outside that
directory is refused by the git lane as well.

#### Scenario: An out-of-scope path is refused on both lanes

- **WHEN** the checker runs in a subdirectory of a repository and a stamped anchor cites a file that exists above that subdirectory, using a path containing no `..`
- **THEN** the citation is not verified against that file

#### Scenario: Running at the repository root is unaffected

- **WHEN** the checked root is the repository root
- **THEN** every stamped anchor resolves exactly as before
