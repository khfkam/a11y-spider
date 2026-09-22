import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ComplianceLevelMismatchError } from '../src/diff.js';
import { pinGoldenBaseline, writeSnapshot } from '../src/ledger.js';
import { runScanPipeline } from '../src/pipeline.js';
import type { ScanSnapshot } from '../src/types.js';
import { startFixtureServer, stopFixtureServer } from './fixture-server.js';

const projectRoot = join(import.meta.dirname, '..');

function runCli(args: string[], env: NodeJS.ProcessEnv = process.env): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync('npx', ['tsx', 'src/cli.ts', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env,
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('cli config errors', () => {
  it('exits 2 when urls file is missing', () => {
    const result = runCli(['scan', '--urls', '/tmp/does-not-exist-urls.txt']);

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/configuration error/i);
  });

  it('exits 2 when urls file contains a non-production URL', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'a11y-spider-cli-'));
    const urlsFile = join(tempDir, 'urls.txt');
    await writeFile(urlsFile, 'https://127.0.0.1/private\n', 'utf8');

    try {
      const result = runCli(['scan', '--urls', urlsFile]);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/line 1/i);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('runScanPipeline', () => {
  let server: Awaited<ReturnType<typeof startFixtureServer>>['server'];
  let baseUrl: string;
  let historyDir: string;
  let reportsDir: string;

  beforeAll(async () => {
    ({ server, baseUrl } = await startFixtureServer());
  });

  afterAll(async () => {
    await stopFixtureServer(server);
  });

  beforeEach(async () => {
    historyDir = await mkdtemp(join(tmpdir(), 'a11y-spider-history-'));
    reportsDir = await mkdtemp(join(tmpdir(), 'a11y-spider-reports-'));
  });

  afterEach(async () => {
    await rm(historyDir, { recursive: true, force: true });
    await rm(reportsDir, { recursive: true, force: true });
  });

  const scanOptions = (urls: string[], overrides: Record<string, unknown> = {}) => ({
    urls,
    complianceLevel: 'AA' as const,
    baselineArg: 'latest',
    initBaseline: false,
    pinGolden: false,
    failOn: 'new',
    ci: false,
    historyDir,
    reportsDir,
    pageWaitStrategy: 'domcontentloaded' as const,
    pageTimeoutMs: 30_000,
    navigationTimeoutMs: 60_000,
    excludeSelectors: [] as string[],
    consent: {
      enabled: false,
      selectors: [] as string[],
      timeoutMs: 1_000,
      settleMs: 0,
      verbose: false,
    },
    ...overrides,
  });

  it('runs scan → ledger → diff → report and exits 0 when no new violations', async () => {
    const cleanUrl = `${baseUrl}/clean.html`;

    await runScanPipeline(scanOptions([cleanUrl], { initBaseline: true }));

    const result = await runScanPipeline(scanOptions([cleanUrl]));

    expect(result.exitCode).toBe(0);
    expect(await readFile(result.reportPaths.jsonPath, 'utf8')).toContain('"newCount": 0');
    expect(await readFile(result.reportPaths.htmlPath, 'utf8')).toContain('class="summary"');
    expect(result.snapshotPath).toMatch(/scan_.+\.json$/);
  });

  it('exits 1 when new violations are found with fail-on new', async () => {
    const cleanUrl = `${baseUrl}/clean.html`;
    const missingAltUrl = `${baseUrl}/missing-alt.html`;

    await runScanPipeline(scanOptions([cleanUrl], { initBaseline: true }));

    const result = await runScanPipeline(scanOptions([missingAltUrl]));

    expect(result.exitCode).toBe(1);
    expect(result.report.summary.newCount).toBeGreaterThan(0);
  });

  it('exits 2 when baseline compliance level mismatches', async () => {
    const baseline = JSON.parse(
      await readFile(join(projectRoot, 'tests/snapshots/baseline-aa.json'), 'utf8'),
    ) as ScanSnapshot;

    await writeSnapshot(baseline, { historyDir });
    await pinGoldenBaseline(baseline, { historyDir });

    await expect(
      runScanPipeline(
        scanOptions([`${baseUrl}/clean.html`], {
          baselineArg: 'golden',
          complianceLevel: 'AAA',
        }),
      ),
    ).rejects.toBeInstanceOf(ComplianceLevelMismatchError);
  });

  it('exits 3 when all URLs fail to scan', async () => {
    const result = await runScanPipeline(
      scanOptions([`${baseUrl}/missing-page`, `${baseUrl}/also-missing`], {
        initBaseline: true,
      }),
    );

    expect(result.exitCode).toBe(3);
    expect(result.report.summary.failedUrlCount).toBe(2);
  });
});
