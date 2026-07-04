import type { ComplianceLevel } from './types.js';

const TAG_PRESETS: Record<ComplianceLevel, string[]> = {
  A: ['wcag2a', 'wcag21a', 'wcag22a'],
  AA: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
  AAA: [
    'wcag2a',
    'wcag2aa',
    'wcag2aaa',
    'wcag21a',
    'wcag21aa',
    'wcag21aaa',
    'wcag22a',
    'wcag22aa',
    'wcag22aaa',
  ],
};

export function resolveComplianceTags(level: ComplianceLevel): string[] {
  return [...TAG_PRESETS[level]];
}

export function parseComplianceLevel(value: string | undefined): ComplianceLevel {
  const normalized = value?.toUpperCase();
  if (normalized === 'A' || normalized === 'AA' || normalized === 'AAA') {
    return normalized;
  }
  return 'AA';
}
