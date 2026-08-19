import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  DEMO_DOC_PATH,
  demoDoc,
  demoExpectedVerdicts,
  demoResults,
  writeDemoFixture,
} from './demo';
import { parseClaims } from './parseClaims';

// Runs the real flow: fixture on disk, real file reads, real grep.
const root = mkdtempSync(join(tmpdir(), 'nullius-demo-test-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

// The fixture is built once: it initialises a git repository, so the rev the
// stamped claims cite is fixed for the whole file.
const rev = writeDemoFixture(root);

describe('demo', () => {
  it('parses one claim per verdict class', () => {
    expect(parseClaims(DEMO_DOC_PATH, demoDoc(rev))).toHaveLength(
      demoExpectedVerdicts(rev).length
    );
  });

  it('produces exactly the advertised verdicts, in document order', () => {
    const verdicts = demoResults(root, rev).map((result) => result.verdict);

    // The fixture is constructed so a first-time viewer sees every state the
    // checker can catch — if an edit to the fixture or the checker shifts any
    // verdict, the demo is lying about the tool and this must fail.
    expect(verdicts).toEqual(demoExpectedVerdicts(rev));
  });

  it('never executes the unsafe command', () => {
    const unsafe = demoResults(root, rev).find(
      (result) => result.verdict === 'unsafe'
    );

    expect(unsafe?.detail).toContain('not executed');
  });

  it('shows both rev-stamped outcomes when git is available', () => {
    if (rev === null) return;

    const verdicts = demoResults(root, rev).map((result) => result.verdict);

    // Same file, same commit, same later refactor — opposite verdicts. That
    // contrast IS the demo of the @rev suffix, so it must not quietly vanish.
    expect(verdicts).toContain('stale');
    expect(verdicts.filter((verdict) => verdict === 'fabricated')).toHaveLength(2);
  });
});
