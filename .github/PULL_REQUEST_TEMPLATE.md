## What changed, and why

<!-- What this does and the problem it solves. -->

## The part worth arguing about

<!-- Optional but encouraged. The judgement call a reviewer should look hardest
     at — a tradeoff you made, a limit you accepted, something you are unsure
     about. "Nothing" is a fine answer; a reviewer's attention is finite and
     you know better than they do where to point it. -->

## Verification

<!-- What you RAN, and what it printed. Not what you believe to be true.
     Paste the relevant lines. -->

```
```

## Checklist

- [ ] `pnpm build` before any CLI run (`dist/` is what the CLIs execute)
- [ ] `pnpm type-check` and `pnpm test` pass — apart from the 6 known
      `flagConformance` failures if you are on macOS with ugrep installed
- [ ] New verdict? It has a fixture that trips it **and** a unit test that
      asserts it fires by name
- [ ] Load-bearing claims about existing code carry Evidence Anchors, verified
      with `check` rather than by eye
- [ ] Anchors in `openspec/changes/**` are rev-stamped
- [ ] No line number was repointed while keeping an old `@rev` stamp

<!-- Merge with a merge commit. Never squash: it orphans the commits that
     rev-stamped anchors name, and the checker then fails open — a disarmed
     gate and a satisfied one produce the same green check. -->
