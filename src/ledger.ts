import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScanSnapshot } from './types.js';

export type BaselineMode = 'latest' | 'golden' | 'explicit';

export interface LedgerOptions {
  historyDir: string;
}

const GOLDEN_BASELINE_FILE = 'golden-baseline.json';
const SCAN_FILE_PATTERN = /^scan_.+\.json$/;

function snapshotPath(historyDir: string, runId: string): string {
  return join(historyDir, `${runId}.json`);
}

/**
 * Persist scan snapshots and load baselines from ./history/.
 * @see A11y_Spider_Proposal_v2.md §8
 */
export async function writeSnapshot(
  snapshot: ScanSnapshot,
  options: LedgerOptions,
): Promise<string> {
  await mkdir(options.historyDir, { recursive: true });
  const filePath = snapshotPath(options.historyDir, snapshot.meta.runId);
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function loadBaseline(
  mode: BaselineMode,
  options: LedgerOptions & { explicitPath?: string },
): Promise<ScanSnapshot | null> {
  if (mode === 'explicit') {
    if (!options.explicitPath) {
      throw new Error('explicitPath is required when baseline mode is explicit');
    }

    return readSnapshotFile(options.explicitPath);
  }

  if (mode === 'golden') {
    return readSnapshotFile(join(options.historyDir, GOLDEN_BASELINE_FILE));
  }

  return loadLatestSnapshot(options.historyDir);
}

export async function pinGoldenBaseline(
  snapshot: ScanSnapshot,
  options: LedgerOptions,
): Promise<void> {
  await mkdir(options.historyDir, { recursive: true });
  const goldenPath = join(options.historyDir, GOLDEN_BASELINE_FILE);
  await writeFile(goldenPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

async function readSnapshotFile(filePath: string): Promise<ScanSnapshot | null> {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content) as ScanSnapshot;
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }
}

async function loadLatestSnapshot(historyDir: string): Promise<ScanSnapshot | null> {
  let entries: string[];

  try {
    entries = await readdir(historyDir);
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }

  const scanFiles = entries.filter((entry) => SCAN_FILE_PATTERN.test(entry));
  if (scanFiles.length === 0) {
    return null;
  }

  scanFiles.sort((a, b) => b.localeCompare(a));
  return readSnapshotFile(join(historyDir, scanFiles[0]!));
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
