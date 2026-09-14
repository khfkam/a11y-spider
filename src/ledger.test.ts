import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBaseline, pinGoldenBaseline, writeSnapshot } from './ledger.js';
import type { ScanSnapshot } from './types.js';

const snapshot: ScanSnapshot = {
  meta: {
    runId: 'scan_2026-06-01T090000Z',
    timestamp: '2026-06-01T09:00:00.000Z',
    axeVersion: '4.12.1',
    complianceLevel: 'AA',
    wcagVersion: '2.2',
    tags: ['wcag2a', 'wcag2aa'],
    toolVersion: '0.1.0',
  },
  urls: [
    {
      url: 'https://www.example.com/dashboard',
      status: 'ok',
      violations: [],
    },
  ],
};

const newerSnapshot: ScanSnapshot = {
  ...snapshot,
  meta: {
    ...snapshot.meta,
    runId: 'scan_2026-06-15T120000Z',
    timestamp: '2026-06-15T12:00:00.000Z',
  },
};

describe('writeSnapshot', () => {
  let historyDir: string;

  beforeEach(async () => {
    historyDir = await mkdtemp(join(tmpdir(), 'a11y-spider-ledger-'));
  });

  afterEach(async () => {
    await rm(historyDir, { recursive: true, force: true });
  });

  it('writes scan_<runId>.json under historyDir', async () => {
    const filePath = await writeSnapshot(snapshot, { historyDir });

    expect(filePath).toBe(join(historyDir, 'scan_2026-06-01T090000Z.json'));
    const written = JSON.parse(await readFile(filePath, 'utf8')) as ScanSnapshot;
    expect(written.meta.runId).toBe(snapshot.meta.runId);
  });
});

describe('loadBaseline', () => {
  let historyDir: string;

  beforeEach(async () => {
    historyDir = await mkdtemp(join(tmpdir(), 'a11y-spider-ledger-'));
    await writeSnapshot(snapshot, { historyDir });
    await writeSnapshot(newerSnapshot, { historyDir });
  });

  afterEach(async () => {
    await rm(historyDir, { recursive: true, force: true });
  });

  it('loads the most recent scan for latest mode', async () => {
    const loaded = await loadBaseline('latest', { historyDir });

    expect(loaded?.meta.runId).toBe('scan_2026-06-15T120000Z');
  });

  it('loads golden-baseline.json for golden mode', async () => {
    await pinGoldenBaseline(snapshot, { historyDir });
    await writeSnapshot(newerSnapshot, { historyDir });

    const loaded = await loadBaseline('golden', { historyDir });

    expect(loaded?.meta.runId).toBe('scan_2026-06-01T090000Z');
  });

  it('loads an explicit snapshot path', async () => {
    const explicitPath = join(historyDir, 'scan_2026-06-01T090000Z.json');
    const loaded = await loadBaseline('explicit', { historyDir, explicitPath });

    expect(loaded?.meta.runId).toBe('scan_2026-06-01T090000Z');
  });

  it('returns null when no snapshots exist', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'a11y-spider-ledger-empty-'));

    try {
      const loaded = await loadBaseline('latest', { historyDir: emptyDir });
      expect(loaded).toBeNull();
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});

describe('pinGoldenBaseline', () => {
  let historyDir: string;

  beforeEach(async () => {
    historyDir = await mkdtemp(join(tmpdir(), 'a11y-spider-ledger-'));
  });

  afterEach(async () => {
    await rm(historyDir, { recursive: true, force: true });
  });

  it('copies the snapshot to golden-baseline.json', async () => {
    await pinGoldenBaseline(snapshot, { historyDir });

    const goldenPath = join(historyDir, 'golden-baseline.json');
    const written = JSON.parse(await readFile(goldenPath, 'utf8')) as ScanSnapshot;
    expect(written.meta.runId).toBe(snapshot.meta.runId);
  });
});
