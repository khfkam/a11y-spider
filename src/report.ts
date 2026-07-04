import type { ScanReport } from './types.js';

export interface ReportOptions {
  reportsDir: string;
}

/**
 * Write report.html and report.json to ./reports/.
 * @see A11y_Spider_Proposal_v2.md §9 and examples/report-example.html
 */
export async function writeReports(
  _report: ScanReport,
  _options: ReportOptions,
): Promise<{ htmlPath: string; jsonPath: string }> {
  throw new Error('writeReports is not implemented yet');
}

export function printConsoleSummary(_report: ScanReport, _ci: boolean): void {
  console.log('a11y-spider: reporting not implemented yet');
}
