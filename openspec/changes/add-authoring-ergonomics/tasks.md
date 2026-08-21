# Tasks — add-authoring-ergonomics

## 1. Rewrite machinery

- [ ] 1.1 Marker rewrite module: locate marker line, verify content unchanged
      since read, rewrite atomically; skip-and-report on mismatch
- [ ] 1.2 `--stamp`: single `git rev-parse --short HEAD` per run; stamp only
      `OK`/working-tree-verified presence anchors
- [ ] 1.3 `--fix`: coordinate rewrite for `DRIFT`/`WRONG-LINE` only; compose
      with `--stamp`; property test — quoted text never altered

## 2. Output

- [ ] 2.1 `--format json`: schema, stable field names, summary counts; exit
      code parity with human mode
- [ ] 2.2 Adopt JSON output in the GitHub Action's comment rendering

## 3. Surface polish

- [ ] 3.1 Per-command `--help` with one example each; one line of philosophy
      per command
- [ ] 3.2 Zero-marker funnel line naming `audit <doc> --propose`
- [ ] 3.3 Close issue #7; update issue #4 to its remaining half
