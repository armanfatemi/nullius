import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  DEMO_DOC,
  DEMO_DOC_PATH,
  DEMO_EXTRA_PATH,
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
  it('parses the anchors, the moments, and one ledger block', () => {
    const kinds = parseClaims(DEMO_DOC_PATH, DEMO_DOC).map(
      (claim) => claim.kind
    );

    expect(kinds.filter((kind) => kind === 'ledger')).toHaveLength(1);
    expect(kinds.filter((kind) => kind !== 'ledger')).toHaveLength(8);
  });

  it('produces exactly the advertised verdicts, in document order', () => {
    writeDemoFixture(root);

    const verdicts = demoResults(root).map((result) => result.verdict);

    // The fixture is constructed so a first-time viewer sees every state the
    // checker can catch — if an edit to the fixture or the checker shifts any
    // verdict, the demo is lying about the tool and this must fail.
    expect(verdicts).toEqual([
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
    ]);
  });

  it('never executes the unsafe command', () => {
    writeDemoFixture(root);

    const unsafe = demoResults(root).find(
      (result) => result.verdict === 'unsafe'
    );

    expect(unsafe?.detail).toContain('not executed');
  });

  it('demonstrates the near-match hint on the undelivered dispatch', () => {
    writeDemoFixture(root);

    const undelivered = demoResults(root).find(
      (result) => result.verdict === 'undelivered'
    );

    expect(undelivered?.detail).toContain('did you mean');
  });

  it("keeps the planted canary's falseness invariant — the named file lacks the symbol", () => {
    writeDemoFixture(root);

    // The demo's canary claims MAX_RETRIES is also defined in the extra
    // file; the fixture must keep that false or the probe means nothing.
    const extra = readFileSync(join(root, DEMO_EXTRA_PATH), 'utf8');
    expect(extra).not.toContain('MAX_RETRIES');

    const guard = demoResults(root).find(
      (result) => result.verdict === 'canary-present'
    );
    expect(guard?.claim.source.doc).toBe(DEMO_DOC_PATH);
    expect(guard?.detail).toContain('canary clear');
  });
});
