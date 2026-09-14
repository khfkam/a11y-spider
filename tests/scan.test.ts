import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveComplianceTags } from '../src/config.js';
import { runScan } from '../src/scan.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

async function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0] ?? '/';

    if (pathname === '/missing-alt.html') {
      const html = await readFile(join(fixturesDir, 'missing-alt.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (pathname === '/clean.html') {
      const html = await readFile(join(fixturesDir, 'clean.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (pathname === '/slow.html') {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body>slow</body></html>');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start fixture server');
  }

  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe('runScan', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, baseUrl } = await startFixtureServer());
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const defaultOptions = {
    complianceLevel: 'AA' as const,
    pageWaitStrategy: 'domcontentloaded' as const,
    pageTimeoutMs: 30_000,
    navigationTimeoutMs: 60_000,
    excludeSelectors: [] as string[],
  };

  it('returns violations with signature, html, and target from fixture HTML', async () => {
    const snapshot = await runScan({
      ...defaultOptions,
      urls: [`${baseUrl}/missing-alt.html`],
    });

    expect(snapshot.urls).toHaveLength(1);
    expect(snapshot.urls[0]?.status).toBe('ok');

    const imageAlt = snapshot.urls[0]?.violations.find((v) => v.ruleId === 'image-alt');
    expect(imageAlt).toBeDefined();
    expect(imageAlt?.html).toContain('<img');
    expect(imageAlt?.target.length).toBeGreaterThan(0);
    expect(imageAlt?.signature).toContain('image-alt');
    expect(imageAlt?.signature).toContain('|');
  });

  it('records axe version, compliance level, and tags in meta', async () => {
    const snapshot = await runScan({
      ...defaultOptions,
      urls: [`${baseUrl}/clean.html`],
    });

    expect(snapshot.meta.complianceLevel).toBe('AA');
    expect(snapshot.meta.wcagVersion).toBe('2.2');
    expect(snapshot.meta.tags).toEqual(resolveComplianceTags('AA'));
    expect(snapshot.meta.axeVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(snapshot.meta.toolVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(snapshot.meta.runId).toMatch(/^scan_\d{4}-\d{2}-\d{2}T\d{6}Z$/);
    expect(snapshot.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('marks failed URLs without aborting the batch', async () => {
    const snapshot = await runScan({
      ...defaultOptions,
      urls: [`${baseUrl}/missing-alt.html`, `${baseUrl}/does-not-exist`],
    });

    expect(snapshot.urls).toHaveLength(2);
    expect(snapshot.urls[0]?.status).toBe('ok');
    expect(snapshot.urls[1]?.status).toBe('failed');
    expect(snapshot.urls[1]?.error).toBeTruthy();
    expect(snapshot.urls[1]?.violations).toEqual([]);
  });

  it('marks navigation timeout as failed and continues scanning', async () => {
    const snapshot = await runScan({
      ...defaultOptions,
      pageWaitStrategy: 'domcontentloaded',
      navigationTimeoutMs: 500,
      urls: [`${baseUrl}/slow.html`, `${baseUrl}/clean.html`],
    });

    expect(snapshot.urls).toHaveLength(2);
    expect(snapshot.urls[0]?.status).toBe('failed');
    expect(snapshot.urls[0]?.error).toMatch(/timeout/i);
    expect(snapshot.urls[1]?.status).toBe('ok');
  });
});
