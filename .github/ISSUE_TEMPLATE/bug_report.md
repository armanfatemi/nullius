---
name: Bug report
about: A checker returned the wrong verdict, or a command misbehaved
title: ''
labels: bug
---

## What happened

<!-- The verdict or behaviour you got. Paste the actual output. -->

```
```

## What you expected

<!-- And, if you can, why — which rule or documented behaviour it contradicts. -->

## Reproduction

<!-- The smallest document and command that shows it. A three-line markdown
     file beats a link to a large repository. -->

**Document:**

```markdown
```

**Command:**

```sh
```

## Environment

- `@nullius-inverba/claims` version:
- Node version:
- OS:
- `grep --version | head -1`: <!-- ugrep vs GNU grep changes flag behaviour -->

## Checked

- [ ] I ran `pnpm build` first, or used `npx` (an unbuilt `dist/` reports on the
      previous version of the code)
- [ ] This is not one of the 6 known `flagConformance` failures on macOS+ugrep
