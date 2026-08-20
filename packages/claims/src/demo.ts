/**
 * `fiducial demo` — build a sandbox fixture and break it in front of the user.
 *
 * The `check` command verifies a convention, so on a repo that has not adopted
 * the convention it verifies nothing. This is the ten-second first touch
 * instead: a tiny doc making claims about a tiny file, one claim per verdict
 * class, checked for real — the absence searches actually run grep against
 * the fixture.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkClaims, type ClaimResult } from './checkClaims';
import { parseClaims } from './parseClaims';
import { fileLinesReader, revFileReader, searchRunner } from './runners';

export const DEMO_SOURCE_PATH = 'src/app.ts';
export const DEMO_LEGACY_PATH = 'src/legacy.ts';
export const DEMO_DOC_PATH = 'design.md';

export const DEMO_SOURCE = [
  'export const MAX_RETRIES = 3;',
  'export function retry() {',
  '  // retries with exponential backoff',
  '}',
  '',
].join('\n');

/** Committed, then refactored away — what a rev-stamped anchor is stamped for. */
export const DEMO_LEGACY_BEFORE = ['export const LEGACY_MODE = true;', ''].join('\n');
export const DEMO_LEGACY_AFTER = ['export const MODE = "current";', ''].join('\n');

const DEMO_DOC_BASE = [
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
  'The file moved further than the drift window — the quote still identifies',
  'real code, so this is stale rather than wrong, and it does not fail:',
  '',
  '**Evidence:** `src/app.ts:5` — `export const MAX_RETRIES = 3;`',
  '',
  'A quote that matches several lines AND is on none of them — neither half of',
  'the citation identifies anything, so this does fail:',
  '',
  '**Evidence:** `src/app.ts:5` — `retr`',
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
];

/**
 * The rev-stamped section, appended when git is available.
 *
 * These two anchors are the whole point of the `@rev` suffix, side by side:
 * the same file, the same kind of edit since, and opposite verdicts. One was
 * true at the commit it names and the code has moved on — advisory, forever.
 * The other was never true at that commit, and a commit cannot change — so it
 * fails, forever.
 */
function revSection(rev: string): string[] {
  return [
    'The code this cited was refactored away afterwards. The claim was true at',
    'the commit it names, and a commit cannot change, so this stays advisory:',
    '',
    `**Evidence:** \`${DEMO_LEGACY_PATH}:1@${rev}\` — \`export const LEGACY_MODE = true;\``,
    '',
    'And an invention, stamped with the same commit. No later edit can explain',
    'it away, so this fails permanently:',
    '',
    `**Evidence:** \`${DEMO_LEGACY_PATH}:1@${rev}\` — \`export const LEGACY_MODE = false;\``,
    '',
  ];
}

/** The demo document. Rev-stamped claims are included only if git is available. */
export function demoDoc(rev: string | null): string {
  return (rev === null ? DEMO_DOC_BASE : [...DEMO_DOC_BASE, ...revSection(rev)]).join(
    '\n'
  );
}

/** The verdicts the fixture is constructed to produce, in document order. */
const BASE_VERDICTS = [
  'ok',
  'drift',
  'fabricated',
  'weak-anchor',
  'wrong-line',
  'unpinned',
  'ok',
  'count-mismatch',
  'unsafe',
  'ok',
  'unknown-moment',
] as const;

export function demoExpectedVerdicts(rev: string | null): string[] {
  return rev === null ? [...BASE_VERDICTS] : [...BASE_VERDICTS, 'stale', 'fabricated'];
}

/**
 * Builds the sandbox and returns the commit the rev-stamped claims cite, or
 * null when git is unavailable — in which case the demo simply drops those two
 * claims rather than faking a history it does not have.
 */
export function writeDemoFixture(root: string): string | null {
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, DEMO_SOURCE_PATH), DEMO_SOURCE);
  writeFileSync(join(root, DEMO_LEGACY_PATH), DEMO_LEGACY_BEFORE);

  const rev = commitFixture(root);

  // The refactor the doc outlives: after this, the working tree no longer
  // contains the cited line, and only the commit can settle whether it ever did.
  if (rev !== null) writeFileSync(join(root, DEMO_LEGACY_PATH), DEMO_LEGACY_AFTER);

  writeFileSync(join(root, DEMO_DOC_PATH), demoDoc(rev));
  return rev;
}

function commitFixture(root: string): string | null {
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    }).trim();

  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'demo@fiducial.invalid');
    git('config', 'user.name', 'fiducial demo');
    git('config', 'commit.gpgsign', 'false');
    git('add', '.');
    git('commit', '-qm', 'demo fixture', '--no-verify');
    return git('rev-parse', '--short', 'HEAD');
  } catch {
    return null;
  }
}

export function demoResults(root: string, rev: string | null): ClaimResult[] {
  return checkClaims(parseClaims(DEMO_DOC_PATH, demoDoc(rev)), {
    readFileLines: fileLinesReader(root),
    readFileAtRev: revFileReader(root),
    runSearch: searchRunner(root),
  });
}
