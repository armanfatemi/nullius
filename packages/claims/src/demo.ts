/**
 * `nullius demo` — build a sandbox fixture and break it in front of the user.
 *
 * The `check` command verifies a convention, so on a repo that has not adopted
 * the convention it verifies nothing. This is the ten-second first touch
 * instead: a tiny doc making claims about a tiny file, one claim per verdict
 * class, checked for real — the absence searches actually run grep against
 * the fixture.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkClaims, type ClaimResult } from './checkClaims';
import { parseClaims } from './parseClaims';
import { fileLinesReader, searchRunner } from './runners';

export const DEMO_SOURCE_PATH = 'src/app.ts';
export const DEMO_DOC_PATH = 'design.md';

export const DEMO_SOURCE = [
  'export const MAX_RETRIES = 3;',
  'export function retry() {',
  '  // retries with exponential backoff',
  '}',
  '',
].join('\n');

export const DEMO_DOC = [
  '# Demo design doc',
  '',
  'Claims about `src/app.ts`, one per verdict class.',
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
  'A citation that is true and says nothing — the quote is too short to be',
  'wrong if the code changes:',
  '',
  '**Evidence:** `src/app.ts:1` — `3`',
  '',
  'A true absence claim, re-run and counted:',
  '',
  "**Evidence:** `grep -rn 'MAX_RETRIES' src/` → 1 result",
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
].join('\n');

/** The verdicts the fixture is constructed to produce, in document order. */
export const DEMO_EXPECTED_VERDICTS = [
  'ok',
  'drift',
  'fabricated',
  'weak-anchor',
  'ok',
  'count-mismatch',
  'unsafe',
  'ok',
  'unknown-moment',
] as const;

export function writeDemoFixture(root: string): void {
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, DEMO_SOURCE_PATH), DEMO_SOURCE);
  writeFileSync(join(root, DEMO_DOC_PATH), DEMO_DOC);
}

export function demoResults(root: string): ClaimResult[] {
  return checkClaims(parseClaims(DEMO_DOC_PATH, DEMO_DOC), {
    readFileLines: fileLinesReader(root),
    runSearch: searchRunner(root),
  });
}
