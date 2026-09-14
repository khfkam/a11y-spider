import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeTarget } from './diff.js';
import type {
  DiffViolation,
  ReportJsonOutput,
  ScanReport,
  UrlFailureGroup,
  ViolationImpact,
} from './types.js';

export interface ReportOptions {
  reportsDir: string;
  baselineLabel?: string;
}

const REPORT_STYLES = `
    :root {
      --bg: #0f1419;
      --surface: #1a2332;
      --surface-2: #243044;
      --border: #2d3a4f;
      --text: #e7ecf3;
      --muted: #8b9cb3;
      --new: #f85149;
      --resolved: #3fb950;
      --legacy: #8b949e;
      --failed: #d29922;
      --link: #58a6ff;
      --critical: #ff7b72;
      --serious: #ffa657;
      --moderate: #e3b341;
      --font: "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --mono: "SF Mono", "Fira Code", "Consolas", monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
    }

    .header {
      background: linear-gradient(135deg, #1a2332 0%, #0f1419 100%);
      border-bottom: 1px solid var(--border);
      padding: 1.5rem 2rem;
    }

    .header-top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }

    .logo {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .logo span { color: var(--muted); font-weight: 400; }

    .meta {
      font-size: 0.8125rem;
      color: var(--muted);
      text-align: right;
    }

    .meta strong { color: var(--text); }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
    }

    .stat {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.875rem 1rem;
    }

    .stat-label {
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 0.25rem;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .stat--new .stat-value { color: var(--new); }
    .stat--resolved .stat-value { color: var(--resolved); }
    .stat--legacy .stat-value { color: var(--legacy); }
    .stat--failed .stat-value { color: var(--failed); }
    .stat--level .stat-value { font-size: 1.25rem; }

    .verdict {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      background: rgba(248, 81, 73, 0.12);
      border: 1px solid rgba(248, 81, 73, 0.35);
      color: #ffaba8;
    }

    .verdict--pass {
      background: rgba(63, 185, 80, 0.12);
      border-color: rgba(63, 185, 80, 0.35);
      color: #aff5b4;
    }

    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 1.5rem 2rem 3rem;
    }

    .section {
      margin-bottom: 1.5rem;
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      background: var(--surface);
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem 1.25rem;
      background: var(--surface-2);
      cursor: pointer;
      user-select: none;
      border: none;
      width: 100%;
      text-align: left;
      color: inherit;
      font: inherit;
    }

    .section-header:hover { background: #2a384f; }

    .section-title {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      font-weight: 600;
      font-size: 0.9375rem;
    }

    .badge {
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.125rem 0.5rem;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .badge--new { background: rgba(248, 81, 73, 0.2); color: var(--new); }
    .badge--resolved { background: rgba(63, 185, 80, 0.2); color: var(--resolved); }
    .badge--legacy { background: rgba(139, 148, 158, 0.2); color: var(--legacy); }
    .badge--failed { background: rgba(210, 153, 34, 0.2); color: var(--failed); }

    .chevron {
      color: var(--muted);
      transition: transform 0.2s;
      font-size: 0.75rem;
    }

    .section.collapsed .chevron { transform: rotate(-90deg); }
    .section.collapsed .section-body { display: none; }

    .section-body { padding: 0.5rem 0; }

    .violation {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border);
    }

    .violation:last-child { border-bottom: none; }

    .violation-header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .rule-id {
      font-family: var(--mono);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--link);
    }

    .impact {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
    }

    .impact--critical { background: rgba(255, 123, 114, 0.2); color: var(--critical); }
    .impact--serious { background: rgba(255, 166, 87, 0.2); color: var(--serious); }
    .impact--moderate { background: rgba(227, 179, 65, 0.2); color: var(--moderate); }
    .impact--minor { background: rgba(139, 148, 158, 0.2); color: var(--legacy); }

    .page-url {
      font-size: 0.8125rem;
      color: var(--muted);
      margin-bottom: 0.625rem;
      word-break: break-all;
    }

    .page-url a { color: var(--link); text-decoration: none; }
    .page-url a:hover { text-decoration: underline; }

    .detail-grid {
      display: grid;
      gap: 0.5rem;
      font-size: 0.8125rem;
    }

    .detail-row {
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 0.75rem;
    }

    .detail-label {
      color: var(--muted);
      font-weight: 500;
    }

    .detail-value {
      font-family: var(--mono);
      font-size: 0.75rem;
      background: var(--bg);
      padding: 0.375rem 0.5rem;
      border-radius: 4px;
      border: 1px solid var(--border);
      word-break: break-all;
    }

    .detail-value--prose {
      font-family: var(--font);
      font-size: 0.8125rem;
      line-height: 1.45;
    }

    .help-link {
      display: inline-block;
      margin-top: 0.625rem;
      font-size: 0.8125rem;
      color: var(--link);
      text-decoration: none;
    }

    .help-link:hover { text-decoration: underline; }

    .failed-url {
      padding: 0.875rem 1.25rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      font-size: 0.875rem;
    }

    .failed-url:last-child { border-bottom: none; }

    .error-code {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--failed);
      background: rgba(210, 153, 34, 0.12);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      white-space: nowrap;
    }

    .footer {
      text-align: center;
      padding: 1.5rem;
      font-size: 0.75rem;
      color: var(--muted);
      border-top: 1px solid var(--border);
      margin-top: 2rem;
    }

    .empty-state {
      padding: 0.875rem 1.25rem;
      font-size: 0.8125rem;
      color: var(--muted);
    }

    .url-panel {
      border-bottom: 1px solid var(--border);
    }

    .url-panel:last-child { border-bottom: none; }

    .url-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      width: 100%;
      padding: 0.875rem 1.25rem;
      background: transparent;
      border: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .url-panel-header:hover { background: rgba(255, 255, 255, 0.03); }

    .url-panel-title {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }

    .url-panel-link {
      color: var(--link);
      font-size: 0.875rem;
      word-break: break-all;
      text-decoration: none;
    }

    .url-panel-link:hover { text-decoration: underline; }

    .url-panel-meta {
      font-size: 0.75rem;
      color: var(--muted);
    }

    .url-panel-counts {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      justify-content: flex-end;
    }

    .count-pill {
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.125rem 0.5rem;
      border-radius: 999px;
      white-space: nowrap;
    }

    .count-pill--new { background: rgba(248, 81, 73, 0.16); color: var(--new); }
    .count-pill--resolved { background: rgba(63, 185, 80, 0.16); color: var(--resolved); }
    .count-pill--legacy { background: rgba(139, 148, 158, 0.16); color: var(--legacy); }
    .count-pill--failed { background: rgba(210, 153, 34, 0.16); color: var(--failed); }

    .url-panel.collapsed .url-panel-body { display: none; }
    .url-panel.collapsed .url-panel-chevron { transform: rotate(-90deg); }

    .url-panel-chevron {
      color: var(--muted);
      transition: transform 0.2s;
      font-size: 0.75rem;
      flex-shrink: 0;
    }

    .url-panel-body {
      padding: 0 0 0.75rem;
      background: rgba(0, 0, 0, 0.12);
    }

    .url-panel-error {
      margin: 0 1.25rem 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      background: rgba(210, 153, 34, 0.12);
      border: 1px solid rgba(210, 153, 34, 0.25);
      color: #f2cc60;
      font-size: 0.8125rem;
    }

    .url-bucket {
      padding: 0.75rem 1.25rem 0.25rem;
    }

    .url-bucket-title {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 0.5rem;
    }
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatBaselineLabel(report: ScanReport, baselineLabel?: string): string {
  if (baselineLabel) {
    return baselineLabel;
  }

  return report.baselineRunId ?? 'none (init baseline)';
}

export function groupReportByUrl(report: ScanReport): UrlFailureGroup[] {
  const urls = new Set<string>([
    ...report.new.map((violation) => violation.url),
    ...report.resolved.map((violation) => violation.url),
    ...report.legacy.map((violation) => violation.url),
    ...report.failedUrls.map((failed) => failed.url),
  ]);

  const failedByUrl = new Map(report.failedUrls.map((failed) => [failed.url, failed.error]));

  const groups = [...urls].map((url) => {
    const newViolations = report.new.filter((violation) => violation.url === url);
    const resolvedViolations = report.resolved.filter((violation) => violation.url === url);
    const legacyViolations = report.legacy.filter((violation) => violation.url === url);
    const error = failedByUrl.get(url);
    const scanStatus = error ? 'failed' : 'ok';

    return {
      url,
      scanStatus,
      error,
      counts: {
        new: newViolations.length,
        resolved: resolvedViolations.length,
        legacy: legacyViolations.length,
        total: newViolations.length + resolvedViolations.length + legacyViolations.length,
      },
      new: newViolations,
      resolved: resolvedViolations,
      legacy: legacyViolations,
    } satisfies UrlFailureGroup;
  });

  return groups.sort((a, b) => {
    if (a.scanStatus !== b.scanStatus) {
      return a.scanStatus === 'failed' ? -1 : 1;
    }

    if (b.counts.new !== a.counts.new) {
      return b.counts.new - a.counts.new;
    }

    if (b.counts.total !== a.counts.total) {
      return b.counts.total - a.counts.total;
    }

    return a.url.localeCompare(b.url);
  });
}

export function getUrlFailures(report: ScanReport, url: string): UrlFailureGroup | undefined {
  return groupReportByUrl(report).find((group) => group.url === url);
}

export function buildReportJsonOutput(report: ScanReport): ReportJsonOutput {
  return {
    ...report,
    byUrl: groupReportByUrl(report),
  };
}

function renderImpactBadge(impact: ViolationImpact): string {
  return `<span class="impact impact--${impact}">${escapeHtml(impact)}</span>`;
}

function renderViolation(
  violation: DiffViolation,
  bucket: DiffViolation['bucket'],
  options: { showUrl?: boolean } = {},
): string {
  const showUrl = options.showUrl ?? true;
  const selector = escapeHtml(normalizeTarget(violation.target));
  const summary =
    bucket === 'resolved'
      ? `Was: ${violation.failureSummary}. No longer present in current scan.`
      : violation.failureSummary;

  const helpLink =
    bucket === 'new' || bucket === 'legacy'
      ? `<a class="help-link" href="${escapeHtml(violation.helpUrl)}" target="_blank" rel="noopener">View axe rule documentation →</a>`
      : '';

  const elementRow =
    bucket === 'resolved'
      ? ''
      : `<div class="detail-row">
              <span class="detail-label">Element</span>
              <code class="detail-value">${escapeHtml(violation.html)}</code>
            </div>`;

  return `<article class="violation">
          <div class="violation-header">
            <span class="rule-id">${escapeHtml(violation.ruleId)}</span>
            ${renderImpactBadge(violation.impact)}
          </div>
          ${
            showUrl
              ? `<p class="page-url">
            <a href="${escapeHtml(violation.url)}" target="_blank" rel="noopener">${escapeHtml(violation.url)}</a>
          </p>`
              : ''
          }
          <div class="detail-grid">
            <div class="detail-row">
              <span class="detail-label">Selector</span>
              <code class="detail-value">${selector}</code>
            </div>
            ${elementRow}
            <div class="detail-row">
              <span class="detail-label">Summary</span>
              <span class="detail-value detail-value--prose">${escapeHtml(summary)}</span>
            </div>
          </div>
          ${helpLink}
        </article>`;
}

function renderViolationSection(
  id: string,
  badgeClass: DiffViolation['bucket'] | 'failed',
  title: string,
  count: number,
  collapsed: boolean,
  body: string,
): string {
  if (count === 0) {
    return '';
  }

  const collapsedClass = collapsed ? ' collapsed' : '';

  return `<section class="section${collapsedClass}" id="${id}">
      <button class="section-header" type="button" onclick="toggleSection('${id}')">
        <span class="section-title">
          <span class="badge badge--${badgeClass}">${escapeHtml(badgeClass.charAt(0).toUpperCase() + badgeClass.slice(1))}</span>
          ${escapeHtml(title)}
          <span style="color: var(--muted); font-weight: 400;">(${count})</span>
        </span>
        <span class="chevron">▼</span>
      </button>
      <div class="section-body">
        ${body}
      </div>
    </section>`;
}

function renderVerdict(report: ScanReport): string {
  if (report.summary.newCount === 0) {
    return `<div class="verdict verdict--pass">No new violations compared to ${escapeHtml(formatBaselineLabel(report))}</div>`;
  }

  const noun = report.summary.newCount === 1 ? 'violation' : 'violations';
  return `<div class="verdict">Exit code 1 — ${report.summary.newCount} new ${noun} compared to ${escapeHtml(formatBaselineLabel(report))}</div>`;
}

function renderUrlBucket(
  title: string,
  badgeClass: DiffViolation['bucket'],
  violations: DiffViolation[],
): string {
  if (violations.length === 0) {
    return '';
  }

  return `<div class="url-bucket">
      <div class="url-bucket-title">${escapeHtml(title)} (${violations.length})</div>
      ${violations.map((violation) => renderViolation(violation, badgeClass, { showUrl: false })).join('\n')}
    </div>`;
}

function renderUrlPanel(group: UrlFailureGroup, index: number): string {
  const panelId = `url-panel-${index}`;
  const collapsed = group.counts.new === 0 && group.scanStatus === 'ok';
  const collapsedClass = collapsed ? ' collapsed' : '';
  const counts = [
    group.counts.new > 0
      ? `<span class="count-pill count-pill--new">${group.counts.new} new</span>`
      : '',
    group.counts.resolved > 0
      ? `<span class="count-pill count-pill--resolved">${group.counts.resolved} resolved</span>`
      : '',
    group.counts.legacy > 0
      ? `<span class="count-pill count-pill--legacy">${group.counts.legacy} legacy</span>`
      : '',
    group.scanStatus === 'failed'
      ? `<span class="count-pill count-pill--failed">scan failed</span>`
      : '',
    group.counts.total === 0 && group.scanStatus === 'ok'
      ? `<span class="count-pill count-pill--resolved">clean</span>`
      : '',
  ].join('');

  const body =
    group.scanStatus === 'failed'
      ? `<div class="url-panel-error">${escapeHtml(group.error ?? 'Scan failed')}</div>${renderUrlBucket('New', 'new', group.new)}${renderUrlBucket('Resolved', 'resolved', group.resolved)}${renderUrlBucket('Legacy', 'legacy', group.legacy)}`
      : `${renderUrlBucket('New', 'new', group.new)}${renderUrlBucket('Resolved', 'resolved', group.resolved)}${renderUrlBucket('Legacy', 'legacy', group.legacy)}`;

  return `<article class="url-panel${collapsedClass}" id="${panelId}" data-url="${escapeHtml(group.url)}">
      <button class="url-panel-header" type="button" onclick="toggleUrlPanel('${panelId}')">
        <span class="url-panel-title">
          <a class="url-panel-link" href="${escapeHtml(group.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(group.url)}</a>
          <span class="url-panel-meta">${group.scanStatus === 'failed' ? 'Could not scan this URL' : `${group.counts.total} violation(s) in current diff`}</span>
        </span>
        <span class="url-panel-counts">${counts}</span>
        <span class="url-panel-chevron">▼</span>
      </button>
      <div class="url-panel-body">
        ${body}
      </div>
    </article>`;
}

function renderByUrlSection(report: ScanReport): string {
  const groups = groupReportByUrl(report);

  if (groups.length === 0) {
    return '';
  }

  const body = groups.map((group, index) => renderUrlPanel(group, index)).join('\n');

  return `<section class="section" id="by-url">
      <button class="section-header" type="button" onclick="toggleSection('by-url')">
        <span class="section-title">
          <span class="badge badge--legacy">By URL</span>
          Failures by URL
          <span style="color: var(--muted); font-weight: 400;">(${groups.length})</span>
        </span>
        <span class="chevron">▼</span>
      </button>
      <div class="section-body">
        ${body}
      </div>
    </section>`;
}

export function renderHtmlReport(report: ScanReport, options: Pick<ReportOptions, 'baselineLabel'> = {}): string {
  const baselineLabel = formatBaselineLabel(report, options.baselineLabel);
  const scannedUrls = new Set([
    ...report.new.map((violation) => violation.url),
    ...report.resolved.map((violation) => violation.url),
    ...report.legacy.map((violation) => violation.url),
    ...report.failedUrls.map((failed) => failed.url),
  ]);
  const scannedUrlCount = scannedUrls.size;

  const newBody =
    report.new.length > 0
      ? report.new.map((violation) => renderViolation(violation, 'new')).join('\n')
      : '<p class="empty-state">No new regressions detected.</p>';

  const resolvedBody = report.resolved.map((violation) => renderViolation(violation, 'resolved')).join('\n');
  const legacyBody = report.legacy.map((violation) => renderViolation(violation, 'legacy')).join('\n');
  const failedBody = report.failedUrls
    .map(
      (failed) => `<div class="failed-url">
          <a href="${escapeHtml(failed.url)}" target="_blank" rel="noopener" style="color: var(--link); text-decoration: none; word-break: break-all;">${escapeHtml(failed.url)}</a>
          <span class="error-code">${escapeHtml(failed.error)}</span>
        </div>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>a11y-spider Report — ${escapeHtml(report.meta.runId)}</title>
  <style>${REPORT_STYLES}
  </style>
</head>
<body>

  <header class="header">
    <div class="header-top">
      <div class="logo">a11y-spider <span>accessibility report</span></div>
      <div class="meta">
        <div><strong>Run:</strong> ${escapeHtml(report.meta.runId)}</div>
        <div><strong>Baseline:</strong> ${escapeHtml(baselineLabel)}</div>
        <div><strong>Scanned:</strong> ${scannedUrlCount} URLs</div>
      </div>
    </div>

    <div class="summary">
      <div class="stat stat--level">
        <div class="stat-label">WCAG level</div>
        <div class="stat-value">${escapeHtml(`${report.meta.wcagVersion} ${report.meta.complianceLevel}`)}</div>
      </div>
      <div class="stat stat--new">
        <div class="stat-label">New regressions</div>
        <div class="stat-value">${report.summary.newCount}</div>
      </div>
      <div class="stat stat--resolved">
        <div class="stat-label">Resolved</div>
        <div class="stat-value">${report.summary.resolvedCount}</div>
      </div>
      <div class="stat stat--legacy">
        <div class="stat-label">Legacy unchanged</div>
        <div class="stat-value">${report.summary.legacyCount}</div>
      </div>
      <div class="stat stat--failed">
        <div class="stat-label">Failed URLs</div>
        <div class="stat-value">${report.summary.failedUrlCount}</div>
      </div>
    </div>

    ${renderVerdict(report)}
  </header>

  <main>
    ${renderByUrlSection(report)}
    ${renderViolationSection('new', 'new', 'Introduced regressions', report.new.length, false, newBody)}
    ${renderViolationSection('resolved', 'resolved', 'Fixed since baseline', report.summary.resolvedCount, true, resolvedBody)}
    ${renderViolationSection('legacy', 'legacy', 'Known outstanding violations', report.summary.legacyCount, true, legacyBody)}
    ${renderViolationSection('failed', 'failed', 'URLs that could not be scanned', report.summary.failedUrlCount, true, failedBody)}
  </main>

  <footer class="footer">
    Generated by a11y-spider v${escapeHtml(report.meta.toolVersion)} · axe-core ${escapeHtml(report.meta.axeVersion)} · WCAG ${escapeHtml(`${report.meta.wcagVersion} ${report.meta.complianceLevel}`)} · Compared to ${escapeHtml(baselineLabel)}
  </footer>

  <script>
    function toggleSection(id) {
      document.getElementById(id).classList.toggle('collapsed');
    }

    function toggleUrlPanel(id) {
      document.getElementById(id)?.classList.toggle('collapsed');
    }

    function viewUrlFailures(url) {
      const panels = document.querySelectorAll('.url-panel[data-url]');
      for (const panel of panels) {
        if (panel.getAttribute('data-url') === url) {
          panel.classList.remove('collapsed');
          document.getElementById('by-url')?.classList.remove('collapsed');
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
    }
  </script>

</body>
</html>`;
}

/**
 * Write report.html and report.json to ./reports/.
 * @see A11y_Spider_Proposal_v2.md §9 and examples/report-example.html
 */
export async function writeReports(
  report: ScanReport,
  options: ReportOptions,
): Promise<{ htmlPath: string; jsonPath: string }> {
  await mkdir(options.reportsDir, { recursive: true });

  const jsonPath = join(options.reportsDir, 'report.json');
  const htmlPath = join(options.reportsDir, 'report.html');

  await writeFile(jsonPath, `${JSON.stringify(buildReportJsonOutput(report), null, 2)}\n`, 'utf8');
  await writeFile(htmlPath, renderHtmlReport(report, options), 'utf8');

  return { htmlPath, jsonPath };
}

export function printFailuresByUrl(report: ScanReport, ci = false): void {
  if (ci) {
    return;
  }

  const groups = groupReportByUrl(report);
  if (groups.length === 0) {
    return;
  }

  console.log('');
  console.log('Failures by URL:');

  for (const group of groups) {
    const parts = [
      group.counts.new > 0 ? `${group.counts.new} new` : '',
      group.counts.resolved > 0 ? `${group.counts.resolved} resolved` : '',
      group.counts.legacy > 0 ? `${group.counts.legacy} legacy` : '',
      group.scanStatus === 'failed' ? 'scan failed' : '',
    ].filter(Boolean);

    console.log(`  ${group.url}${parts.length > 0 ? ` — ${parts.join(', ')}` : ''}`);

    if (group.scanStatus === 'failed') {
      console.log(`    ${group.error ?? 'Scan failed'}`);
      continue;
    }

    for (const violation of [...group.new, ...group.legacy]) {
      console.log(`    • ${violation.ruleId} (${violation.impact}) — ${violation.failureSummary}`);
    }
  }
}

export function printConsoleSummary(report: ScanReport, ci: boolean): void {
  const { summary, meta } = report;
  const headline = `a11y-spider: WCAG ${meta.wcagVersion} ${meta.complianceLevel} — new: ${summary.newCount}, resolved: ${summary.resolvedCount}, legacy: ${summary.legacyCount}, failed URLs: ${summary.failedUrlCount}`;

  console.log(headline);

  if (ci) {
    return;
  }

  printFailuresByUrl(report, false);
}
