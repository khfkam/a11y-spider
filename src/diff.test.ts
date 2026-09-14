import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildSignature,
  canonicalizeUrl,
  ComplianceLevelMismatchError,
  diffScans,
  normalizeTarget,
} from './diff.js';
import type { ScanSnapshot } from './types.js';

const snapshotsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'snapshots');

async function loadSnapshot(name: string): Promise<ScanSnapshot> {
  const content = await readFile(join(snapshotsDir, name), 'utf8');
  return JSON.parse(content) as ScanSnapshot;
}

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

describe('diffScans', () => {
  it('classifies new, resolved, and legacy violations from fixture snapshots', async () => {
    const baseline = await loadSnapshot('baseline-aa.json');
    const current = await loadSnapshot('current-aa.json');

    const report = diffScans(current, baseline);

    expect(report.baselineRunId).toBe('scan_2026-06-01T090000Z');
    expect(report.summary.newCount).toBe(1);
    expect(report.summary.resolvedCount).toBe(1);
    expect(report.summary.legacyCount).toBe(1);
    expect(report.summary.failedUrlCount).toBe(1);

    expect(report.new.map((v) => v.signature)).toEqual([
      'https://www.example.com/dashboard|button-name|button.submit',
    ]);
    expect(report.resolved.map((v) => v.signature)).toEqual([
      'https://www.example.com/dashboard|image-alt|img.hero',
    ]);
    expect(report.legacy.map((v) => v.signature)).toEqual([
      'https://www.example.com/dashboard|color-contrast|#main > .card-title',
    ]);

    expect(report.failedUrls).toEqual([
      { url: 'https://www.example.com/missing', error: 'HTTP 404 for https://www.example.com/missing' },
    ]);
  });

  it('treats all current violations as legacy when baseline is null', async () => {
    const current = await loadSnapshot('current-aa.json');

    const report = diffScans(current, null);

    expect(report.baselineRunId).toBeNull();
    expect(report.summary.newCount).toBe(0);
    expect(report.summary.resolvedCount).toBe(0);
    expect(report.summary.legacyCount).toBe(2);
    expect(report.new).toEqual([]);
    expect(report.resolved).toEqual([]);
  });

  it('throws when compliance levels differ', async () => {
    const baseline = await loadSnapshot('baseline-aa.json');
    const current: ScanSnapshot = {
      ...baseline,
      meta: { ...baseline.meta, complianceLevel: 'AAA', runId: 'scan_2026-06-15T120000Z' },
    };

    expect(() => diffScans(current, baseline)).toThrow(ComplianceLevelMismatchError);
  });
});
