# Design — init and doctor

## Decision 1 — non-interactive is the primary path

The installer's most common operator is an agent driving a terminal, then CI,
then a human pasting from a README. All three need flags, determinism, and a
printed record of what happened. Interactivity is sugar to add later, not the
foundation — the reverse of the usual CLI-wizard instinct, forced by who
actually runs this tool.

## Decision 2 — pointers, not rendered content, in user-owned files

Every tool that renders managed content into CLAUDE.md-class files collects the
same four wounds: users edit inside the markers (update must clobber or
refuse), version strings inside blocks cause merge conflicts on every release,
other tools' marker conventions collide, and blocks outlive uninstallation as
cargo-culted instructions. A one-line pointer to a kit-owned file under
`.nullius/` dodges all four: the pointed-at file is regenerated freely, the
pointer never changes, and removal is one line.

## Decision 3 — hook identity by command-path convention

`.claude/settings.json` hook entries are anonymous objects; JSON carries no
comments and the schema no id field. The only durable identity is the command
itself: managed hooks invoke a recognizable path (the kit's bin or a shim under
`.nullius/hooks/`), and `doctor`/`--fix` claim ownership by matching that
command string. This convention is the actual contract and is specified before
the hook pack multiplies entries.

## Decision 4 — kit config in its own file

The kernel throws on unknown config keys — the right behavior for a checker
(a typo'd key silently checking less is the failure the config module exists
to prevent), and fatal for cohabitation: any kit key in `nullius.config.json`
breaks every older pinned kernel in CI. Separate file, separate schema,
separate evolution; the kernel additionally reserves `configVersion` so its
own schema can move once without a flag day.

## Decision 5 — doctor is local-only and ends in a live proof

"Journal receiving records" as a remote/API check is either an mtime heuristic
(an idle repo looks broken) or network in a tool whose README carries a live
anchor asserting it makes none. v1 checks what the working tree and local
settings can prove, labels the rest "not checkable from here", and finishes by
running a known-good fixture through the installed pipeline — the doctor's
last line is a verdict the user can re-run, in the house style.

## Decision 6 — no `update` verb

`doctor --fix` re-renders managed artifacts from the installed package
version. A separate `update` implies a package manager this is not, adds a
ninth top-level verb, and answers no question `doctor --fix` doesn't. Command
surface is budgeted: every verb must answer one epistemic question ("is the
ratchet alive?" — doctor passes the test).
