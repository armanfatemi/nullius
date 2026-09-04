# Tasks — add-maintainer-card

## 0. Prerequisites / setup

- [x] `pnpm build`.
- [x] Capture a real `check --format json` document from this repo as a test input.

## 1. Consuming the JSON

- [x] Split the JSON invocation's streams in `action/action.yml`; stop using `2>&1` for it.
- [x] Read `.version` first; unrecognized → human-format fallback with a stated reason.
- [x] Derive card counts from `summary` rather than recomputing from `documents`.

## 2. Rendering the card

- [x] Card table: documents checked, anchors checked, presence/absence split, failures by verdict.
- [x] Failing-anchor list with `source.doc:source.line` jump links.
- [x] The modesty line: verdicts certify the citation, not the argument; link `audit`.
- [x] Suppress canary `source` detail (Decision 7).
- [x] Preserve the `<!-- nullius-claims -->` marker so the upsert still finds its comment.

## 3. Annotations

- [x] Emit `::error` / `::warning` per failing result, anchored to `source.doc` / `source.line`.
- [x] Keyed to `strict` per Open question 2.
- [x] Skip results with no file anchor (PR body) without dropping them from the card.

## 4. Escaping — security-relevant

- [x] Markdown-cell escaper: pipes, newlines, backticks, angle brackets, leading control chars.
- [x] Workflow-command escaper: `%25`, `%0A`, `%0D`, and `::`.
- [x] Adversarial fixture: a document whose anchor text contains `|`, a newline, `::`, and a fenced block.
- [x] Assert the escaped output cannot terminate the table or the workflow command.

## 5. Tests

- [x] Golden card rendering from a fixed JSON document.
- [x] Version-mismatch fallback fires and does not render a card.
- [x] Adversarial fixture renders inert.
- [x] Zero-anchor document renders a card that says zero, not an empty card.

## 6. Documentation + dogfood

- [x] `openspec/changes/add-maintainer-card/specs/check-cli/spec.md` delta.
- [x] `action/README.md` — the card, and what it does not claim.
- [x] This repo's CI renders the card (dogfood) — without breaking the existing
      human-format verdict-token grep in the oracle step.
- [x] CHANGELOG entry.
- [x] `node packages/claims/dist/cli.js check 'openspec/**/*.md'` passes.
