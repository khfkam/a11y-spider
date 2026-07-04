import type { ScanSnapshot } from './types.js';

export type BaselineMode = 'latest' | 'golden' | 'explicit';

export interface LedgerOptions {
  historyDir: string;
}

/**
 * Persist scan snapshots and load baselines from ./history/.
 * @see A11y_Spider_Proposal_v2.md §8
 */
export async function writeSnapshot(
  _snapshot: ScanSnapshot,
  _options: LedgerOptions,
): Promise<string> {
  throw new Error('writeSnapshot is not implemented yet');
}

export async function loadBaseline(
  _mode: BaselineMode,
  _options: LedgerOptions & { explicitPath?: string },
): Promise<ScanSnapshot | null> {
  throw new Error('loadBaseline is not implemented yet');
}

export async function pinGoldenBaseline(
  _snapshot: ScanSnapshot,
  _options: LedgerOptions,
): Promise<void> {
  throw new Error('pinGoldenBaseline is not implemented yet');
}
