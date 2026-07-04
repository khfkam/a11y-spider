import type { ComplianceLevel, ScanSnapshot } from './types.js';

export interface ScanOptions {
  urls: string[];
  complianceLevel: ComplianceLevel;
  pageWaitStrategy: 'networkidle' | 'domcontentloaded' | 'load';
  pageTimeoutMs: number;
  navigationTimeoutMs: number;
  excludeSelectors: string[];
}

/**
 * Run Playwright + @axe-core/playwright against each URL.
 * @see A11y_Spider_Proposal_v2.md §4.1 module 2
 */
export async function runScan(_options: ScanOptions): Promise<ScanSnapshot> {
  throw new Error('runScan is not implemented yet');
}
