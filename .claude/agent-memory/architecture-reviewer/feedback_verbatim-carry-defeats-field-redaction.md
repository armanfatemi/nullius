---
name: verbatim-carry-defeats-field-redaction
description: A "carry rejected input verbatim" rule silently exempts those bytes from every field-level redaction guarantee stated elsewhere
metadata:
  type: feedback
---

When a design keeps unparseable/rejected input **verbatim** so its verdicts
survive, check every redaction promise against that carve-out: field rewriting
needs a parse, so the verbatim path is exempt from all of it. A privacy flag
stated as unconditional (e.g. `--no-prompts` converts *every* prompt) becomes
conditional the moment one line class bypasses parsing.

**Why:** `add-pr-process-report` iteration 5 moved redaction from records to
lines and added "a line the validator rejects is carried verbatim." That
correctly preserved `malformed`/`duplicate-id` verdicts and, in the same
sentence, opened a hole `--no-prompts` cannot close — no document named it.

**How to apply:** whenever a doc says *carried verbatim*, *byte-for-byte*, or
*re-emitted as written*, enumerate the guarantees that operate on parsed fields
and ask which ones the verbatim path skips. Related: [[redaction-leaves-presence-oracles]].
