import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  DEMO_DOC,
  DEMO_DOC_PATH,
  DEMO_EXPECTED_VERDICTS,
  demoResults,
  writeDemoFixture,
} from './demo';
import { parseClaims } from './parseClaims';

// Runs the real flow: fixture on disk, real file reads, real grep.
const root = mkdtempSync(join(tmpdir(), 'nullius-demo-test-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('demo', () => {
  it('parses one claim per verdict class', () => {
    expect(parseClaims(DEMO_DOC_PATH, DEMO_DOC)).toHaveLength(
      DEMO_EXPECTED_VERDICTS.length
    );
  });

  it('produces exactly the advertised verdicts, in document order', () => {
    writeDemoFixture(root);

    const verdicts = demoResults(root).map((result) => result.verdict);

    // The fixture is constructed so a first-time viewer sees every state the
    // checker can catch — if an edit to the fixture or the checker shifts any
    // verdict, the demo is lying about the tool and this must fail.
    expect(verdicts).toEqual([...DEMO_EXPECTED_VERDICTS]);
  });

  it('never executes the unsafe command', () => {
    writeDemoFixture(root);

    const unsafe = demoResults(root).find(
      (result) => result.verdict === 'unsafe'
    );

    expect(unsafe?.detail).toContain('not executed');
  });
});
