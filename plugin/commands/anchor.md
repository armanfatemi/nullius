---
description: Eager audit — refute-first fact-check of an unanchored document, proposing Evidence Anchors
---

Run the refute-first eager audit on the document named by `$ARGUMENTS` (if no
argument was given, use the most recently modified `.md` file in the plans
directory — `.claude/plans` or `~/.claude/plans`, newest first).

The protocol lives in the CLI so it cannot drift from the checker. Emit it and
follow it exactly:

```sh
npx -y @nullius-inverba/claims eager-prompt <doc>
```

Follow the emitted brief to the letter — in particular:

- **Refute-first.** Your default hypothesis for every load-bearing claim is
  that it is wrong. Every conclusion must trace to a file you opened or a
  search you ran; never assess plausibility from memory.
- Your anchors are **proposals** — present them as an edit for the author's
  review, never as verified truth. The author adopting them is the entailment
  review.
- Finish by running `npx -y @nullius-inverba/claims check` on the document and
  confirm every proposed anchor verifies. A `FABRICATED` or `COUNT-MISMATCH`
  on your own anchor means you fabricated — redo that claim from the code.

If the `eager-prompt` command is unavailable (older package version), tell the
user to update `@nullius-inverba/claims` rather than improvising the protocol.
