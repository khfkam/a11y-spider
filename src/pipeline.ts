import { basename } from 'node:path';
import {
  loadConsentSelectorsFile,
  resolveConsentFilePath,
  resolveConsentOptions,
  type ConsentOptions,
  type ConsentSelectorEntry,
} from './consent.js';
import { diffScans } from './diff.js';
import { loadBaseline, pinGoldenBaseline, writeSnapshot, type BaselineMode } from './ledger.js';
import { printConsoleSummary, writeReports } from './report.js';
import { runScan } from './scan.js';
import type { ComplianceLevel, ScanReport, ScanSnapshot } from './types.js';

export interface ScanPipelineOptions {
  urls: string[];
  complianceLevel: ComplianceLevel;
  baselineArg: string;
  initBaseline: boolean;
  pinGolden: boolean;
  failOn: string;
  ci: boolean;
  historyDir: string;
  reportsDir: string;
  pageWaitStrategy: 'networkidle' | 'domcontentloaded' | 'load';
  pageTimeoutMs: number;
  navigationTimeoutMs: number;
  excludeSelectors: string[];
  consent?: ConsentOptions;
  consentSelectorMeta?: ConsentSelectorEntry[];
}

export interface ScanPipelineResult {
  exitCode: number;
  report: ScanReport;
  snapshot: ScanSnapshot;
  snapshotPath: string;
  reportPaths: { htmlPath: string; jsonPath: string };
}

export function resolveBaselineRequest(baselineArg: string): {
  mode: BaselineMode;
  explicitPath?: string;
} {
  if (baselineArg === 'latest' || baselineArg === 'golden') {
    return { mode: baselineArg };
  }

  return { mode: 'explicit', explicitPath: baselineArg };
}

export function resolveBaselineLabel(
  baselineArg: string,
  baseline: ScanSnapshot | null,
): string {
  if (baselineArg === 'golden') {
    return 'golden-baseline.json';
  }

  if (baselineArg === 'latest') {
    return baseline?.meta.runId ?? 'latest (none found)';
  }

  return basename(baselineArg);
}

export function computeExitCode(
  report: ScanReport,
  snapshot: ScanSnapshot,
  failOn: string,
): number {
  const allUrlsFailed =
    snapshot.urls.length > 0 && snapshot.urls.every((result) => result.status === 'failed');

  if (allUrlsFailed) {
    return 3;
  }

  if (failOn === 'new' && report.summary.newCount > 0) {
    return 1;
  }

  return 0;
}

export function parsePageWaitStrategy(
  value: string | undefined,
): 'networkidle' | 'domcontentloaded' | 'load' {
  if (value === 'domcontentloaded' || value === 'load' || value === 'networkidle') {
    return value;
  }

  return 'networkidle';
}

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Run scan → ledger → diff → report and return the CI exit code.
 */
export async function runScanPipeline(options: ScanPipelineOptions): Promise<ScanPipelineResult> {
  let consent = options.consent;
  let consentSelectorMeta = options.consentSelectorMeta;

  if (!consent) {
    consent = await resolveConsentOptions(process.env);
    try {
      const file = await loadConsentSelectorsFile(
        resolveConsentFilePath(process.env.CONSENT_SELECTORS_FILE),
      );
      consentSelectorMeta = file.selectors;
    } catch {
      consentSelectorMeta = [];
    }
  }

  if (consent.enabled && !options.ci) {
    console.log(
      `Consent dismiss: ${consent.selectors.length} selector(s), timeout ${consent.timeoutMs}ms`,
    );
  }

  const snapshot = await runScan({
    urls: options.urls,
    complianceLevel: options.complianceLevel,
    pageWaitStrategy: options.pageWaitStrategy,
    pageTimeoutMs: options.pageTimeoutMs,
    navigationTimeoutMs: options.navigationTimeoutMs,
    excludeSelectors: options.excludeSelectors,
    consent: {
      ...consent,
      verbose: consent.verbose && !options.ci,
    },
    consentSelectorMeta,
  });

  const baselineRequest = resolveBaselineRequest(options.baselineArg);
  const baseline = options.initBaseline
    ? null
    : await loadBaseline(baselineRequest.mode, {
        historyDir: options.historyDir,
        explicitPath: baselineRequest.explicitPath,
      });

  const report = diffScans(snapshot, baseline);
  const snapshotPath = await writeSnapshot(snapshot, { historyDir: options.historyDir });

  if (options.pinGolden) {
    await pinGoldenBaseline(snapshot, { historyDir: options.historyDir });
  }

  const reportPaths = await writeReports(report, {
    reportsDir: options.reportsDir,
    baselineLabel: resolveBaselineLabel(options.baselineArg, baseline),
  });

  printConsoleSummary(report, options.ci);

  return {
    exitCode: computeExitCode(report, snapshot, options.failOn),
    report,
    snapshot,
    snapshotPath,
    reportPaths,
  };
}
