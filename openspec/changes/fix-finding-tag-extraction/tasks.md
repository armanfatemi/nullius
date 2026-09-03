# Tasks — fix-finding-tag-extraction

## 0. Prerequisites

- [ ] `pnpm build`.
- [ ] Reproduce: run `TAG_LINE` against bare, backticked and bolded tags and
      confirm only the bare form matches.

## 1. Implementation

- [ ] Widen `TAG_LINE` to tolerate inline code, bold and italic around the tag,
      on either side and in combination.
- [ ] Keep the list-item anchor. Do not match tags in running prose.
- [ ] Add the declined-tag diagnostic.

## 2. Tests

- [ ] One case per formatting variant, each asserting the finding is recorded
      with the right severity and text.
- [ ] Regression: each variant test fails against the pre-fix regex.
- [ ] Negative: a sentence discussing the tags produces no finding.
- [ ] Negative: a sentence naming the tags produces no finding, because the match
      stays anchored to a list item.
      NOT asserted: that agent definition files produce no findings. They carry
      bare example tag lines under their Output format headings and would extract
      under the old pattern too, so it is neither true nor a regression. Extraction
      only ever runs on an agent's return; a definition is never passed to it.
- [ ] A fixture journal carrying an emphasised tag, so the behaviour is covered
      end to end and not only at the regex.

## 3. Verification

- [ ] `pnpm build`, `pnpm type-check`, `pnpm test` — 6 ugrep failures only.
- [ ] Both witness fixtures at their expected exit codes.
- [ ] `openspec validate fix-finding-tag-extraction`.
