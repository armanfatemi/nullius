# Tasks — add-maintainer-card

## 0. Prerequisites / setup

- [ ] `pnpm build`.
- [ ] Capture a real `check --format json` document from this repo as a test input.

## 1. Consuming the JSON

- [ ] Split the JSON invocation's streams in `action/action.yml`; stop using `2>&1` for it.
- [ ] Read `.version` first; unrecognized → human-format fallback with a stated reason.
- [ ] Derive card counts from `summary` rather than recomputing from `documents`.

## 2. Rendering the card

- [ ] Card table: documents checked, anchors checked, presence/absence split, failures by verdict.
- [ ] Failing-anchor list with `source.doc:source.line` jump links.
- [ ] The modesty line: verdicts certify the citation, not the argument; link `audit`.
- [ ] Suppress canary `source` detail (Decision 7).
- [ ] Preserve the `<!-- nullius-claims -->` marker so the upsert still finds its comment.

## 3. Annotations

- [ ] Emit `::error` / `::warning` per failing result, anchored to `source.doc` / `source.line`.
- [ ] Keyed to `strict` per Open question 2.
- [ ] Skip results with no file anchor (PR body) without dropping them from the card.

## 4. Escaping — security-relevant

- [ ] Markdown-cell escaper: pipes, newlines, backticks, angle brackets, leading control chars.
- [ ] Workflow-command escaper: `%25`, `%0A`, `%0D`, and `::`.
- [ ] Adversarial fixture: a document whose anchor text contains `|`, a newline, `::`, and a fenced block.
- [ ] Assert the escaped output cannot terminate the table or the workflow command.

## 5. Tests

- [ ] Golden card rendering from a fixed JSON document.
- [ ] Version-mismatch fallback fires and does not render a card.
- [ ] Adversarial fixture renders inert.
- [ ] Zero-anchor document renders a card that says zero, not an empty card.

## 6. Documentation + dogfood

- [ ] `openspec/changes/add-maintainer-card/specs/check-cli/spec.md` delta.
- [ ] `action/README.md` — the card, and what it does not claim.
- [ ] This repo's CI renders the card (dogfood) — without breaking the existing
      human-format verdict-token grep in the oracle step.
- [ ] CHANGELOG entry.
- [ ] `node packages/claims/dist/cli.js check 'openspec/**/*.md'` passes.
