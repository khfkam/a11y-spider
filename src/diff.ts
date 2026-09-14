import type { ComplianceLevel, DiffViolation, ScanReport, ScanSnapshot, Violation } from './types.js';

export class ComplianceLevelMismatchError extends Error {
  constructor(
    public readonly currentLevel: ComplianceLevel,
    public readonly baselineLevel: ComplianceLevel,
  ) {
    super(
      `Compliance level mismatch: current run is ${currentLevel}, baseline is ${baselineLevel}. Re-pin golden or pass a baseline captured at the same level.`,
    );
    this.name = 'ComplianceLevelMismatchError';
  }
}

/**
 * Compute new / resolved / legacy violations from current vs baseline scans.
 * @see A11y_Spider_Proposal_v2.md §6
 */
export function diffScans(current: ScanSnapshot, baseline: ScanSnapshot | null): ScanReport {
  if (baseline && baseline.meta.complianceLevel !== current.meta.complianceLevel) {
    throw new ComplianceLevelMismatchError(
      current.meta.complianceLevel,
      baseline.meta.complianceLevel,
    );
  }

  const failedUrls = current.urls
    .filter((result) => result.status === 'failed')
    .map((result) => ({
      url: result.url,
      error: result.error ?? 'Unknown scan error',
    }));

  const currentViolations = indexViolations(current);

  if (!baseline) {
    const legacy = toDiffViolations(currentViolations, 'legacy');
    return buildReport(current, null, [], [], legacy, failedUrls);
  }

  const baselineViolations = indexViolations(baseline);
  const newViolations: DiffViolation[] = [];
  const legacy: DiffViolation[] = [];
  const resolved: DiffViolation[] = [];

  for (const [signature, entry] of currentViolations) {
    const diffViolation: DiffViolation = { ...entry.violation, bucket: 'legacy', url: entry.url };
    if (baselineViolations.has(signature)) {
      legacy.push(diffViolation);
    } else {
      newViolations.push({ ...entry.violation, bucket: 'new', url: entry.url });
    }
  }

  for (const [signature, entry] of baselineViolations) {
    if (!currentViolations.has(signature)) {
      resolved.push({ ...entry.violation, bucket: 'resolved', url: entry.url });
    }
  }

  return buildReport(
    current,
    baseline.meta.runId,
    newViolations,
    resolved,
    legacy,
    failedUrls,
  );
}

function indexViolations(
  snapshot: ScanSnapshot,
): Map<string, { violation: Violation; url: string }> {
  const indexed = new Map<string, { violation: Violation; url: string }>();

  for (const urlResult of snapshot.urls) {
    if (urlResult.status !== 'ok') {
      continue;
    }

    for (const violation of urlResult.violations) {
      indexed.set(violation.signature, { violation, url: urlResult.url });
    }
  }

  return indexed;
}

function toDiffViolations(
  indexed: Map<string, { violation: Violation; url: string }>,
  bucket: DiffViolation['bucket'],
): DiffViolation[] {
  return [...indexed.values()].map(({ violation, url }) => ({
    ...violation,
    bucket,
    url,
  }));
}

function buildReport(
  current: ScanSnapshot,
  baselineRunId: string | null,
  newViolations: DiffViolation[],
  resolved: DiffViolation[],
  legacy: DiffViolation[],
  failedUrls: ScanReport['failedUrls'],
): ScanReport {
  return {
    meta: current.meta,
    baselineRunId,
    summary: {
      newCount: newViolations.length,
      resolvedCount: resolved.length,
      legacyCount: legacy.length,
      failedUrlCount: failedUrls.length,
    },
    new: newViolations,
    resolved,
    legacy,
    failedUrls,
  };
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
