import { describe, expect, it } from 'vitest';
import { parseComplianceLevel, resolveComplianceTags } from './config.js';

describe('resolveComplianceTags', () => {
  it('returns WCAG 2.2 tag set for level A', () => {
    expect(resolveComplianceTags('A')).toEqual(['wcag2a', 'wcag21a', 'wcag22a']);
  });

  it('returns WCAG 2.2 tag set for level AA', () => {
    expect(resolveComplianceTags('AA')).toEqual([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'wcag22a',
      'wcag22aa',
    ]);
  });

  it('returns WCAG 2.2 tag set for level AAA', () => {
    expect(resolveComplianceTags('AAA')).toEqual([
      'wcag2a',
      'wcag2aa',
      'wcag2aaa',
      'wcag21a',
      'wcag21aa',
      'wcag21aaa',
      'wcag22a',
      'wcag22aa',
      'wcag22aaa',
    ]);
  });
});

describe('parseComplianceLevel', () => {
  it('defaults to AA for invalid values', () => {
    expect(parseComplianceLevel(undefined)).toBe('AA');
    expect(parseComplianceLevel('invalid')).toBe('AA');
  });

  it('accepts A, AA, and AAA case-insensitively', () => {
    expect(parseComplianceLevel('a')).toBe('A');
    expect(parseComplianceLevel('aa')).toBe('AA');
    expect(parseComplianceLevel('aaa')).toBe('AAA');
  });
});
