---
dispatches:
  - present-agent
reads:
  - src/thing.ts
applies_to: [src/**/*.ts]
---

A rule whose every declared reference resolves: the agent it dispatches to
exists, the file it reads exists, and its glob matches at least one file in
this fixture.
