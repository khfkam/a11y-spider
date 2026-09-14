import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestUrls, validateProductionUrl } from './ingest.js';

describe('validateProductionUrl', () => {
  it('accepts valid HTTPS production URLs', () => {
    expect(validateProductionUrl('https://www.example.com/dashboard', false)).toEqual({
      ok: true,
      url: 'https://www.example.com/dashboard',
    });
  });

  it('rejects non-HTTPS URLs unless allowHttp is true', () => {
    expect(validateProductionUrl('http://www.example.com/page', false)).toMatchObject({
      ok: false,
    });
    expect(validateProductionUrl('http://www.example.com/page', true)).toMatchObject({
      ok: true,
    });
  });

  it('rejects localhost hostnames', () => {
    expect(validateProductionUrl('https://localhost/app', false).ok).toBe(false);
    expect(validateProductionUrl('https://app.local/dashboard', false).ok).toBe(false);
  });

  it('rejects private IP addresses', () => {
    for (const url of [
      'https://127.0.0.1/app',
      'https://10.0.0.1/app',
      'https://192.168.1.1/app',
      'https://172.16.0.1/app',
    ]) {
      expect(validateProductionUrl(url, false).ok, url).toBe(false);
    }
  });

  it('rejects URLs missing scheme or hostname', () => {
    expect(validateProductionUrl('www.example.com/page', false).ok).toBe(false);
    expect(validateProductionUrl('not-a-url', false).ok).toBe(false);
  });
});

describe('ingestUrls', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'a11y-spider-ingest-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('ignores blank lines and # comments', async () => {
    const urlsFile = join(tempDir, 'urls.txt');
    await writeFile(
      urlsFile,
      `
# production routes
https://www.example.com/home

https://www.example.com/about
`,
      'utf8',
    );

    const targets = await ingestUrls({ urlsFilePath: urlsFile, allowHttp: false });
    expect(targets).toEqual([
      { url: 'https://www.example.com/home', line: 3 },
      { url: 'https://www.example.com/about', line: 5 },
    ]);
  });

  it('throws when a URL is not production-ready', async () => {
    const urlsFile = join(tempDir, 'urls.txt');
    await writeFile(
      urlsFile,
      `https://www.example.com/ok
https://127.0.0.1/bad
`,
      'utf8',
    );

    await expect(ingestUrls({ urlsFilePath: urlsFile, allowHttp: false })).rejects.toThrow(
      /line 2/i,
    );
  });

  it('throws when no valid URLs remain', async () => {
    const urlsFile = join(tempDir, 'urls.txt');
    await writeFile(urlsFile, '# only comments\n\n', 'utf8');

    await expect(ingestUrls({ urlsFilePath: urlsFile, allowHttp: false })).rejects.toThrow(
      /no valid urls/i,
    );
  });
});
