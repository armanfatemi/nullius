import { describe, expect, it } from 'vitest';

import { buildEagerPrompt } from './eagerPrompt';

describe('buildEagerPrompt', () => {
  const prompt = buildEagerPrompt(
    'docs/design.md',
    'The enum is `@shareable`, so this costs a rollout.'
  );

  it('embeds the document path and content', () => {
    expect(prompt).toContain('docs/design.md');
    expect(prompt).toContain('The enum is `@shareable`');
  });

  it('is refute-first', () => {
    expect(prompt).toContain('attempt to REFUTE');
    expect(prompt).toContain('your default hypothesis for every claim is that it is wrong');
  });

  it('defines all three output classes', () => {
    expect(prompt).toContain('REFUTED');
    expect(prompt).toContain('SUPPORTED');
    expect(prompt).toContain('UNVERIFIABLE');
  });

  it('carries the anchor grammar and the checker handoff', () => {
    expect(prompt).toContain('**Evidence:**');
    expect(prompt).toContain('→ N results');
    expect(prompt).toContain('fiducial check "docs/design.md"');
  });

  it('frames anchors as proposals, never verified truth', () => {
    expect(prompt).toContain('they are proposals');
    expect(prompt).toContain('the author adopting them is the entailment review');
  });

  it('uses the default binding moments unless overridden', () => {
    expect(prompt).toContain('rollout-window');
    const custom = buildEagerPrompt('d.md', 'x', ['app-store-review']);
    expect(custom).toContain('app-store-review');
    expect(custom).not.toContain('rollout-window');
  });
});
