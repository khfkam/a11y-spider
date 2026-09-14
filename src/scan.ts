import { AxeBuilder } from '@axe-core/playwright';
import type { AxeResults } from 'axe-core';
import { createRequire } from 'node:module';
import { chromium, type Page } from 'playwright';
import { resolveComplianceTags } from './config.js';
import { buildSignature, canonicalizeUrl } from './diff.js';
import type {
  ComplianceLevel,
  ScanMeta,
  ScanSnapshot,
  UrlScanResult,
  Violation,
  ViolationImpact,
} from './types.js';

const require = createRequire(import.meta.url);
const { version: toolVersion } = require('../package.json') as { version: string };
const { version: axeVersion } = require('axe-core/package.json') as { version: string };

export interface ScanOptions {
  urls: string[];
  complianceLevel: ComplianceLevel;
  pageWaitStrategy: 'networkidle' | 'domcontentloaded' | 'load';
  pageTimeoutMs: number;
  navigationTimeoutMs: number;
  excludeSelectors: string[];
}

function generateRunId(date = new Date()): string {
  const iso = date.toISOString();
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) {
    throw new Error('Unable to generate run ID');
  }

  return `scan_${match[1]}T${match[2]}${match[3]}${match[4]}Z`;
}

function buildScanMeta(complianceLevel: ComplianceLevel, timestamp: Date): ScanMeta {
  return {
    runId: generateRunId(timestamp),
    timestamp: timestamp.toISOString(),
    axeVersion,
    complianceLevel,
    wcagVersion: '2.2',
    tags: resolveComplianceTags(complianceLevel),
    toolVersion,
  };
}

function mapViolations(url: string, axeResults: AxeResults): Violation[] {
  const canonical = canonicalizeUrl(url);
  const violations: Violation[] = [];

  for (const violation of axeResults.violations) {
    for (const node of violation.nodes) {
      const target = node.target.map(String);
      violations.push({
        ruleId: violation.id,
        impact: (violation.impact ?? 'moderate') as ViolationImpact,
        description: violation.description,
        helpUrl: violation.helpUrl,
        target,
        html: node.html,
        failureSummary: node.failureSummary ?? '',
        signature: buildSignature(canonical, violation.id, target),
      });
    }
  }

  return violations;
}

function isScanFailureError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('net::') ||
    message.includes('404') ||
    message.includes('500') ||
    message.includes('403') ||
    message.includes('failed') ||
    message.includes('navigation')
  );
}

async function scanUrl(page: Page, url: string, options: ScanOptions): Promise<UrlScanResult> {
  page.setDefaultTimeout(options.pageTimeoutMs);
  page.setDefaultNavigationTimeout(options.navigationTimeoutMs);

  const response = await page.goto(url, {
    waitUntil: options.pageWaitStrategy,
    timeout: options.navigationTimeoutMs,
  });

  if (!response) {
    throw new Error(`Navigation to ${url} did not return a response`);
  }

  if (response.status() >= 400) {
    throw new Error(`HTTP ${response.status()} for ${url}`);
  }

  let builder = new AxeBuilder({ page }).withTags(resolveComplianceTags(options.complianceLevel));
  for (const selector of options.excludeSelectors) {
    builder = builder.exclude(selector);
  }

  const axeResults = await builder.analyze();
  return {
    url,
    status: 'ok',
    violations: mapViolations(url, axeResults),
  };
}

/**
 * Run Playwright + @axe-core/playwright against each URL.
 * @see A11y_Spider_Proposal_v2.md §4.1 module 2
 */
export async function runScan(options: ScanOptions): Promise<ScanSnapshot> {
  const timestamp = new Date();
  const meta = buildScanMeta(options.complianceLevel, timestamp);
  const urls: UrlScanResult[] = [];

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();

    for (const url of options.urls) {
      const page = await context.newPage();

      try {
        urls.push(await scanUrl(page, url, options));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        urls.push({
          url,
          status: 'failed',
          violations: [],
          error: isScanFailureError(error) ? message : `Unexpected scan error: ${message}`,
        });
      } finally {
        await page.close();
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return { meta, urls };
}
