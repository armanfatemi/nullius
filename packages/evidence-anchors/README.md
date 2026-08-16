# evidence-anchors

**Unscoped alias of [`@nullius-inverba/claims`](https://www.npmjs.com/package/@nullius-inverba/claims).**
Same checker, same version, named after the thing it checks rather than after a
Latin motto.

```sh
npx evidence-anchors check "docs/rfcs/**/*.md"
npx evidence-anchors demo
```

Everything else — the CLI flags, the config file, the library API, the verdicts
— is documented in the [canonical package](../claims/README.md) and the
[Evidence Anchors spec](../../spec/evidence-anchors.md).

## Which one should I install?

Either. They resolve to the same code, and the version numbers move together.

- `evidence-anchors` — reads better in a `package.json` for people who have
  never heard of the Royal Society. The binary is `evidence-anchors`.
- `@nullius-inverba/claims` — the canonical package, and the one the rest of the
  `@nullius-inverba/*` family (the specs, the Action, the Claude Code plugin) refers
  to. The binary is `nullius`.

If you are adding this to a shared repo where the convention matters more than
the tool, prefer `evidence-anchors`: the name tells a reviewer what the
dependency is for.

## Library use

```ts
import { parseClaims, checkClaims, isFailure } from "evidence-anchors";
```

The full API surface is re-exported unchanged.

## License

MIT © Arman Fatemi
