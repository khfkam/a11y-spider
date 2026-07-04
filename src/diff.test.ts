import { describe, expect, it } from 'vitest';
import { buildSignature, canonicalizeUrl, normalizeTarget } from './diff.js';

describe('diff utilities', () => {
  it('canonicalizes URL pathname', () => {
    expect(canonicalizeUrl('https://WWW.Example.com/dashboard/')).toBe(
      'https://www.example.com/dashboard',
    );
  });

  it('strips CSS module hashes from target segments', () => {
    expect(normalizeTarget(['#main', '.card-title_abc12XY'])).toBe('#main > .card-title');
  });

  it('builds a URL-scoped signature', () => {
    const signature = buildSignature(
      'https://www.example.com/dashboard',
      'color-contrast',
      ['#main', '.card-title'],
    );
    expect(signature).toBe('https://www.example.com/dashboard|color-contrast|#main > .card-title');
  });
});
