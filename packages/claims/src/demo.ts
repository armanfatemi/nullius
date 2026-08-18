/**
 * `nullius demo` — build a sandbox fixture and break it in front of the user.
 *
 * The `check` command verifies a convention, so on a repo that has not adopted
 * the convention it verifies nothing. This is the ten-second first touch
 * instead: a tiny doc making claims about a tiny file, one claim per check
 * verdict class — anchors, binding moments, an attestation ledger, and a
 * planted canary — checked for real: the absence searches actually run grep
 * against the fixture, and the canary guard reads a real registry.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { canaryGuardResult, type CanaryEntry } from './canary';
import { checkClaims, type ClaimResult } from './checkClaims';
import { parseClaims } from './parseClaims';
import { fileLinesReader, searchRunner } from './runners';

export const DEMO_SOURCE_PATH = 'src/app.ts';
export const DEMO_EXTRA_PATH = 'src/extra.ts';
export const DEMO_DOC_PATH = 'design.md';

export const DEMO_SOURCE = [
  'export const MAX_RETRIES = 3;',
  'export function retry() {',
  '  // retries with exponential backoff',
  '}',
  '',
].join('\n');

// Deliberately does NOT contain MAX_RETRIES — the planted canary below names
// this file, so the claim is false by construction and one grep refutes it.
export const DEMO_EXTRA = ['export function helper() {}', ''].join('\n');

const DEMO_CANARY_TEXT =
  'Note that `MAX_RETRIES` is also defined in `src/extra.ts`, so the two definitions must stay in sync.';

export const DEMO_DOC = [
  '# Demo design doc',
  '',
  'Claims about `src/app.ts`, one per verdict class.',
  DEMO_CANARY_TEXT,
  '',
  'A correct citation:',
  '',
  '**Evidence:** `src/app.ts:1` — `export const MAX_RETRIES = 3;`',
  '',
  'The file moved under the doc — the text is real but sits on line 1:',
  '',
  '**Evidence:** `src/app.ts:3` — `export const MAX_RETRIES = 3;`',
  '',
  'A fabrication — this text appears nowhere in the file:',
  '',
  '**Evidence:** `src/app.ts:2` — `export const MAX_RETRIES = 5;`',
  '',
  'A true absence claim, re-run and counted:',
  '',
  "**Evidence:** `grep -rn 'MAX_RETRIES' src/app.ts` → 1 result",
  '',
  'A stale count — the search actually matches once, not zero times:',
  '',
  "**Evidence:** `grep -rn 'retry' src/` → 0 results",
  '',
  'A command the sandbox refuses to execute:',
  '',
  "**Evidence:** `grep -rn 'x' src/ && rm -rf /` → 0 results",
  '',
  'A mechanism claim from the closed list, and an invented one:',
  '',
  '**Binds at:** `rollout-window`',
  '**Binds at:** `partial-composition`',
  '',
  'And an attestation ledger — declared review dispatches, delivered outcomes:',
  '',
  '**Ledger:** entry-review',
  '**Expected:** `rule-audit`, `schema-review`, `security-review`, `vibes-review`',
  '**Delivered:**',
  '- `rule-audit` — None.',
  '- `schema-review` — ',
  '- `secruity-review` — None',
  '',
].join('\n');

/** The registry entry writeDemoFixture installs — line derived, never hardcoded. */
export const DEMO_CANARY: CanaryEntry = {
  doc: DEMO_DOC_PATH,
  line: DEMO_DOC.split('\n').indexOf(DEMO_CANARY_TEXT) + 1,
  text: DEMO_CANARY_TEXT,
  plantedAt: '2026-08-17T00:00:00.000Z',
};

/** The demo's reviewer vocabulary — `vibes-review` is deliberately outside it. */
export const DEMO_REVIEWERS = [
  'rule-audit',
  'schema-review',
  'security-review',
] as const;

/** The verdicts the fixture is constructed to produce, in report order. */
export const DEMO_EXPECTED_VERDICTS = [
  'canary-present',
  'ok',
  'drift',
  'fabricated',
  'ok',
  'count-mismatch',
  'unsafe',
  'ok',
  'unknown-moment',
  'ok',
  'empty-delivery',
  'undelivered',
  'unknown-reviewer',
  'undeclared',
] as const;

export function writeDemoFixture(root: string): void {
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, '.git', 'nullius'), { recursive: true });
  writeFileSync(join(root, DEMO_SOURCE_PATH), DEMO_SOURCE);
  writeFileSync(join(root, DEMO_EXTRA_PATH), DEMO_EXTRA);
  writeFileSync(join(root, DEMO_DOC_PATH), DEMO_DOC);
  writeFileSync(
    join(root, '.git', 'nullius', 'canaries.json'),
    `${JSON.stringify({ canaries: [DEMO_CANARY] }, null, 2)}\n`
  );
}

export function demoResults(root: string): ClaimResult[] {
  const guard = canaryGuardResult(DEMO_DOC_PATH, DEMO_DOC, DEMO_CANARY);
  const results = checkClaims(
    parseClaims(DEMO_DOC_PATH, DEMO_DOC),
    {
      readFileLines: fileLinesReader(root),
      runSearch: searchRunner(root),
    },
    { reviewers: DEMO_REVIEWERS }
  );
  return guard === null ? results : [guard, ...results];
}
