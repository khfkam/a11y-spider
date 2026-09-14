import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { diffScans } from './diff.js';
import { printConsoleSummary, renderHtmlReport, writeReports } from './report.js';
import type { ScanReport, ScanSnapshot } from './types.js';

const snapshotsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'snapshots');

async function loadSnapshot(name: string): Promise<ScanSnapshot> {
  const content = await readFile(join(snapshotsDir, name), 'utf8');
  return JSON.parse(content) as ScanSnapshot;
}

describe('writeReports', () => {
  let reportsDir: string;
  let report: ScanReport;

  beforeAll(async () => {
    const baseline = await loadSnapshot('baseline-aa.json');
    const current = await loadSnapshot('current-aa.json');
    report = diffScans(current, baseline);
  });

  beforeEach(async () => {
    reportsDir = await mkdtemp(join(tmpdir(), 'a11y-spider-report-'));
  });

  afterEach(async () => {
    await rm(reportsDir, { recursive: true, force: true });
  });

  it('writes report.json with the full diff payload schema', async () => {
    const { jsonPath } = await writeReports(report, { reportsDir });

    expect(jsonPath).toBe(join(reportsDir, 'report.json'));
    const written = JSON.parse(await readFile(jsonPath, 'utf8')) as ScanReport;

    expect(written.meta.runId).toBe(report.meta.runId);
    expect(written.baselineRunId).toBe('scan_2026-06-01T090000Z');
    expect(written.summary).toEqual({
      newCount: 1,
      resolvedCount: 1,
      legacyCount: 1,
      failedUrlCount: 1,
    });
    expect(written.new).toHaveLength(1);
    expect(written.resolved).toHaveLength(1);
    expect(written.legacy).toHaveLength(1);
    expect(written.failedUrls).toEqual([
      { url: 'https://www.example.com/missing', error: 'HTTP 404 for https://www.example.com/missing' },
    ]);
  });

  it('writes report.html with summary bar and bucket sections', async () => {
    const { htmlPath } = await writeReports(report, { reportsDir });
    const html = await readFile(htmlPath, 'utf8');

    expect(htmlPath).toBe(join(reportsDir, 'report.html'));
    expect(html).toContain('class="summary"');
    expect(html).toContain('stat--new');
    expect(html).toContain('stat--resolved');
    expect(html).toContain('stat--legacy');
    expect(html).toContain('stat--failed');
    expect(html).toContain('Introduced regressions');
    expect(html).toContain('Known outstanding violations');
    expect(html).toMatch(/stat--new[\s\S]*?<div class="stat-value">1<\/div>/);
  });
});

describe('renderHtmlReport', () => {
  let report: ScanReport;

  beforeAll(async () => {
    const baseline = await loadSnapshot('baseline-aa.json');
    const current = await loadSnapshot('current-aa.json');
    report = diffScans(current, baseline);
  });

  it('expands new violations and collapses legacy by default', () => {
    const html = renderHtmlReport(report);

    expect(html).toMatch(/class="section" id="new"/);
    expect(html).toMatch(/class="section collapsed" id="legacy"/);
    expect(html).toMatch(/class="section collapsed" id="resolved"/);
    expect(html).toContain('button-name');
    expect(html).toContain('color-contrast');
  });

  it('includes summary counts in the header', () => {
    const html = renderHtmlReport(report);

    expect(html).toContain('WCAG level');
    expect(html).toContain('2.2 AA');
    expect(html).toContain('New regressions');
    expect(html).toContain('Failed URLs');
  });
});

describe('printConsoleSummary', () => {
  let report: ScanReport;

  beforeAll(async () => {
    const baseline = await loadSnapshot('baseline-aa.json');
    const current = await loadSnapshot('current-aa.json');
    report = diffScans(current, baseline);
  });

  it('suppresses per-violation detail in CI mode', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    printConsoleSummary(report, true);

    const output = log.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toMatch(/new:\s*1/i);
    expect(output).not.toContain('button-name');
    expect(output).not.toContain('Add button text');

    log.mockRestore();
  });

  it('prints violation detail outside CI mode', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    printConsoleSummary(report, false);

    const output = log.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('button-name');
    expect(output).toContain('https://www.example.com/dashboard');

    log.mockRestore();
  });
});
