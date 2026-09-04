# A project that declares no oracles

This config exists so the CI arm asserting *"an unconfigured project must
report, never reassure"* can point at a project that is genuinely unconfigured,
rather than relying on this repository being one.

That reliance was real and it broke. The two arms ran bare, inheriting the
repository root's own `nullius.config.json`, so the moment that file declared
its `oracles` the assertion inverted: the verb exited 0 and the message it greps
for was absent. A step about *unconfigured projects* failed because *this*
project became configured.

The message those arms look for is the checker's, and it is deliberately a
report rather than a reassurance — an unconfigured project and a project whose
oracle held still are different facts:

**Evidence:** `packages/claims/src/cli.ts:1143@db749d6` — `        "  An unconfigured project and a project whose oracle held still are different\n" +`

It is the same defect the run-report step already carried, fixed the same way
and for the reason recorded there:

**Evidence:** `.github/workflows/ci.yml:364@db749d6` — `          # the config was not.`
