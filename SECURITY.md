# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security report.**

Use GitHub's private reporting: **[Report a vulnerability](https://github.com/armanfatemi/nullius/security/advisories/new)**.
If that is unavailable to you, open a public issue containing only the words
"security report, requesting a private channel" and nothing else, and you will
be sent one.

Expect an acknowledgement within **7 days**. This is a single-maintainer
project and not a commercial product; there is no paid support tier, and there
is no bounty. What you will get is a straight answer about whether the issue is
real and what is going to happen about it.

## What is in scope

nullius reads documents that are **untrusted input**. On a pull request, the
checked document and the PR body are controlled by whoever opened the PR, and
the checker acts on their contents. The interesting boundary is therefore
everything a document can reach:

| Area | Why it matters |
| --- | --- |
| **Absence searches** | A document declares a `grep`/`rg` command that the checker runs. It is parsed into an argv vector and spawned **without a shell**, against a per-binary flag allowlist. A document that escapes that — chaining, redirection, an unlisted flag, an unlisted binary — is in scope. |
| **Path handling** | Every cited path is validated before any read. A citation that reads a file outside the repository root, follows a symlink out, or otherwise escapes the guard is in scope. |
| **The git lane** | Rev-stamped anchors are settled with git against the named commit. A citation that reads outside the repo root through that path, or that makes the checker do unbounded work, is in scope. |
| **Verdict integrity** | A document that makes a **failing** claim report as passing is in scope, and is the most serious class this project has. The whole product is that a false claim cannot show green. |
| **Resource exhaustion** | A document that hangs the checker or exhausts memory in CI is in scope. Searches carry a wall-clock budget and marker lines are length-bounded; a bypass of either is a finding. |
| **The GitHub Action** | Runs on `pull_request` and posts advisory comments. Anything that turns it into code execution with elevated permissions is in scope. |

## What is out of scope

- **Verdicts certifying form rather than entailment.** A real line, quoted
  accurately, under a sentence it does not support, passes. That is documented,
  deliberate, and not a vulnerability — see the design principles in the README.
- **`--strict` being off by default.** The Action is advisory until you opt in.
- Findings that require an already-compromised machine, or write access to the
  repository being checked.
- Vulnerabilities in dependencies with no reachable path through this code.
  Report those upstream; tell us if there *is* a reachable path.

## Supported versions

The latest published minor of `@nullius-inverba/claims` and
`@nullius-inverba/kit`. This project is pre-1.0 and both releases so far have
carried breaking changes; fixes land forward rather than being backported.

## Disclosure

Coordinated. A fix and an advisory go out together, and you will be credited
unless you ask not to be.
