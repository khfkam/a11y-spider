import { describe, expect, it } from 'vitest';
import { computeExitCode, parsePageWaitStrategy, parsePositiveInt, resolveBaselineLabel } from './pipeline.js';
import type { ScanReport, ScanSnapshot } from './types.js';

const emptySnapshot = (urls: ScanSnapshot['urls']): ScanSnapshot => ({
  meta: {
    runId: 'scan_2026-01-01T120000Z',
    timestamp: '2026-01-01T12:00:00.000Z',
    axeVersion: '4.12.1',
    complianceLevel: 'AA',
    wcagVersion: '2.2',
    tags: [],
    toolVersion: '0.1.0',
  },
  urls,
});

const emptyReport = (newCount: number): ScanReport => ({
  meta: emptySnapshot([]).meta,
  baselineRunId: null,
  summary: {
    newCount,
    resolvedCount: 0,
    legacyCount: 0,
    failedUrlCount: 0,
  },
  new: [],
  resolved: [],
  legacy: [],
  failedUrls: [],
});

describe('pipeline helpers', () => {
  it('parses page wait strategy with fallback', () => {
    expect(parsePageWaitStrategy('domcontentloaded')).toBe('domcontentloaded');
    expect(parsePageWaitStrategy('invalid')).toBe('networkidle');
  });

  it('parses positive integers with fallback', () => {
    expect(parsePositiveInt('45000', 30_000)).toBe(45_000);
    expect(parsePositiveInt('bad', 30_000)).toBe(30_000);
  });

  it('computes exit codes for fail-on new', () => {
    const snapshot = emptySnapshot([{ url: 'https://example.com', status: 'ok', violations: [] }]);

    expect(computeExitCode(emptyReport(0), snapshot, 'new')).toBe(0);
    expect(computeExitCode(emptyReport(2), snapshot, 'new')).toBe(1);
    expect(computeExitCode(emptyReport(2), snapshot, 'none')).toBe(0);
  });

  it('returns exit 3 when every URL failed', () => {
    const snapshot = emptySnapshot([
      { url: 'https://example.com/a', status: 'failed', violations: [], error: '404' },
      { url: 'https://example.com/b', status: 'failed', violations: [], error: '404' },
    ]);

    expect(computeExitCode(emptyReport(0), snapshot, 'new')).toBe(3);
  });

  it('resolves baseline labels for reports', () => {
    expect(resolveBaselineLabel('golden', null)).toBe('golden-baseline.json');
    expect(resolveBaselineLabel('latest', null)).toBe('latest (none found)');
  });
});
