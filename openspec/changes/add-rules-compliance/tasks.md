# Tasks — add-rules-compliance

## 1. Kernel

- [ ] 1.1 Rule header parser: strict flat frontmatter subset, closed keys,
      config-module-style rejection; no YAML dependency
- [ ] 1.2 `RuleVerdict` union (separate from `Verdict`): `UNGROUNDED-RULE`,
      `RULE-ROT`; wire incident-anchor checking through existing check
      machinery
- [ ] 1.3 `rules select --paths` with stable order and excluded count
- [ ] 1.4 Fixtures: grounded rule, ungrounded rule, rotted rule

## 2. Kit / plugin

- [ ] 2.1 Compliance brief builder (audit-brief pattern; stdout purity)
- [ ] 2.2 `/comply` plugin command: select → dispatch per rule → collect →
      re-verify violation anchors with `check`
- [ ] 2.3 Read-receipt convention (rule id quoted back) documented in the
      brief template

## 3. After add-witness-recording lands

- [ ] 3.1 Journal rule dispatches from `/comply` via `witness record`
- [ ] 3.2 `SILENT-RULE` as a journal query; fixture with one silent rule
- [ ] 3.3 Close the loop with issue #8 (ledger) and #11 (/rule-audit half)
