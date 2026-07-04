import type { ScanReport, ScanSnapshot } from './types.js';

/**
 * Compute new / resolved / legacy violations from current vs baseline scans.
 * @see A11y_Spider_Proposal_v2.md §6
 */
export function diffScans(
  _current: ScanSnapshot,
  _baseline: ScanSnapshot | null,
): ScanReport {
  throw new Error('diffScans is not implemented yet');
}

export function buildSignature(
  canonicalUrl: string,
  ruleId: string,
  target: string[],
): string {
  const serializedTarget = normalizeTarget(target);
  return `${canonicalUrl}|${ruleId}|${serializedTarget}`;
}

export function normalizeTarget(target: string[]): string {
  return target
    .map((segment) => segment.replace(/_[a-zA-Z0-9]{5,}/g, ''))
    .join(' > ');
}

export function canonicalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = parsed.pathname.replace(/\/$/, '') || '/';
  return `${parsed.origin}${parsed.pathname}`.toLowerCase();
}
