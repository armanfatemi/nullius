---
description: Audit the premises of a document — refute-first, one claim per agent, refutations returned as checkable anchors
---

Audit the document named by `$ARGUMENTS` (if no argument was given, use the
most recently modified `.md` file in the plans directory — `.claude/plans` or
`~/.claude/plans`, newest first).

The protocols live in the CLI so they cannot drift from the checker. Emit them
and follow them exactly.

## If the document already carries anchors

List the claims, then audit each one **in its own subagent**:

```sh
npx -y @nullius-inverba/claims audit <doc>
npx -y @nullius-inverba/claims audit <doc> --emit-brief <claim-id>
```

Dispatch each brief to a **separate** agent, and give that agent the brief and
nothing else — no document, no title, no other claims, no summary of what you
are doing. The starve is the mechanism: claims presented together imply a
narrative, and a model handed a narrative argues for it. Do not "helpfully"
add context.

Collect the verdicts:

- **REFUTED** — the counter-evidence comes back as anchors. Verify them with
  `npx -y @nullius-inverba/claims check <doc>` like anyone else's, then report
  the claim, the counter-evidence, and the note that the decision it supported
  needs re-examining.
- **SUPPORTED** — report where the agent went looking for the counter-example.
- **UNVERIFIABLE-BY-SEARCH** — a real answer, not a failure. Report what is out
  of reach (dynamic dispatch, runtime string keys, DI, other repositories) and
  propose moving the claim to `## Open questions`.

Never overrule a subagent's verdict from your own reading of the document —
that is the correlation the split exists to break.

## If the document carries no anchors at all

Retrofit it first, with the confirmation-shaped mode:

```sh
npx -y @nullius-inverba/claims audit <doc> --propose
```

Follow the emitted brief to the letter — in particular:

- **Refute-first.** Your default hypothesis for every load-bearing claim is
  that it is wrong. Every conclusion must trace to a file you opened or a
  search you ran; never assess plausibility from memory.
- Your anchors are **proposals** — present them as an edit for the author's
  review, never as verified truth. The author adopting them is the entailment
  review.
- Stamp the commit you read (`git rev-parse --short HEAD`) into each anchor:
  `path/to/file.ts:12@a1b2c3d`. That is what keeps the claim checkable after
  the code moves on.
- Finish by running `npx -y @nullius-inverba/claims check` on the document and
  confirm every proposed anchor verifies. A `FABRICATED` or `COUNT-MISMATCH`
  on your own anchor means you fabricated — redo that claim from the code.

Then run the anchored flow above.

If the `audit` command is unavailable (older package version), fall back to
`eager-prompt <doc>`, and tell the user to update `@nullius-inverba/claims`
rather than improvising the protocol.
