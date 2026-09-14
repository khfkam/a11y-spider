import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeTarget } from './diff.js';
import type { DiffViolation, ScanReport, ViolationImpact } from './types.js';

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

function renderImpactBadge(impact: ViolationImpact): string {
  return `<span class="impact impact--${impact}">${escapeHtml(impact)}</span>`;
}

function renderViolation(violation: DiffViolation, bucket: DiffViolation['bucket']): string {
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
          <p class="page-url">
            <a href="${escapeHtml(violation.url)}" target="_blank" rel="noopener">${escapeHtml(violation.url)}</a>
          </p>
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

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(htmlPath, renderHtmlReport(report, options), 'utf8');

  return { htmlPath, jsonPath };
}

export function printConsoleSummary(report: ScanReport, ci: boolean): void {
  const { summary, meta } = report;
  const headline = `a11y-spider: WCAG ${meta.wcagVersion} ${meta.complianceLevel} — new: ${summary.newCount}, resolved: ${summary.resolvedCount}, legacy: ${summary.legacyCount}, failed URLs: ${summary.failedUrlCount}`;

  console.log(headline);

  if (ci || summary.newCount === 0) {
    return;
  }

  console.log('');
  console.log('New violations:');
  for (const violation of report.new) {
    console.log(`  • ${violation.ruleId} (${violation.impact}) — ${violation.url}`);
    console.log(`    ${violation.failureSummary}`);
  }

  if (summary.failedUrlCount > 0) {
    console.log('');
    console.log('Failed URLs:');
    for (const failed of report.failedUrls) {
      console.log(`  • ${failed.url} — ${failed.error}`);
    }
  }
}
