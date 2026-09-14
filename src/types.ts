/** Shared types — see A11y_Spider_Proposal_v2.md §8.1 */

export type ComplianceLevel = 'A' | 'AA' | 'AAA';

export type UrlScanStatus = 'ok' | 'failed';

export type ViolationImpact = 'minor' | 'moderate' | 'serious' | 'critical';

export interface ScanMeta {
  runId: string;
  timestamp: string;
  axeVersion: string;
  complianceLevel: ComplianceLevel;
  wcagVersion: '2.2';
  tags: string[];
  toolVersion: string;
}

export interface Violation {
  ruleId: string;
  impact: ViolationImpact;
  description: string;
  helpUrl: string;
  target: string[];
  html: string;
  failureSummary: string;
  signature: string;
}

export interface UrlScanResult {
  url: string;
  status: UrlScanStatus;
  violations: Violation[];
  error?: string;
}

export interface ScanSnapshot {
  meta: ScanMeta;
  urls: UrlScanResult[];
}

export type DiffBucket = 'new' | 'resolved' | 'legacy';

export interface DiffViolation extends Violation {
  bucket: DiffBucket;
  url: string;
}

export interface ScanReport {
  meta: ScanMeta;
  baselineRunId: string | null;
  summary: {
    newCount: number;
    resolvedCount: number;
    legacyCount: number;
    failedUrlCount: number;
  };
  new: DiffViolation[];
  resolved: DiffViolation[];
  legacy: DiffViolation[];
  failedUrls: Array<{ url: string; error: string }>;
}

export interface UrlFailureGroup {
  url: string;
  scanStatus: UrlScanStatus;
  error?: string;
  counts: {
    new: number;
    resolved: number;
    legacy: number;
    total: number;
  };
  new: DiffViolation[];
  resolved: DiffViolation[];
  legacy: DiffViolation[];
}

export interface ReportJsonOutput extends ScanReport {
  byUrl: UrlFailureGroup[];
}
