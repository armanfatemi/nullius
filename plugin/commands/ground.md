---
description: Verify the Evidence Anchors in a document (defaults to the newest plan file)
---

Verify Evidence Anchors with the nullius checker.

If `$ARGUMENTS` names one or more files or globs, run:

```sh
npx -y @nullius-inverba/claims check $ARGUMENTS
```

If no argument was given, locate the most recently modified `.md` file in the
plans directory (`.claude/plans` or `~/.claude/plans`, newest first) and check
that file instead.

Then:

- If every marker verifies, say so in one line and stop.
- For each failing verdict, open the cited file, fix the citation in the
  document — or, if the claim itself cannot be supported, move it to an
  `## Open questions` section. A `FABRICATED` or `COUNT-MISMATCH` verdict is
  not a citation typo: re-examine the decision that claim was supporting, and
  say so explicitly.
- If the document contains load-bearing claims about existing code with no
  anchors at all, flag them — a document with no grounding markers is not a
  pass.
