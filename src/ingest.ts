import { readFile } from 'node:fs/promises';

export interface IngestOptions {
  urlsFilePath: string;
  allowHttp: boolean;
}

export interface IngestedTarget {
  url: string;
  line: number;
}

export interface UrlValidationResult {
  ok: true;
  url: string;
}

export interface UrlValidationFailure {
  ok: false;
  reason: string;
}

export type ValidateProductionUrlResult = UrlValidationResult | UrlValidationFailure;

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }

  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;

  return false;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

  if (lower === 'localhost' || lower.endsWith('.local')) {
    return true;
  }

  if (lower === '::1') {
    return true;
  }

  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }

  return isPrivateIpv4(lower);
}

export function validateProductionUrl(
  rawUrl: string,
  allowHttp: boolean,
): ValidateProductionUrlResult {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'URL must be absolute with a valid scheme and hostname' };
  }

  if (!parsed.hostname) {
    return { ok: false, reason: 'URL must include a hostname' };
  }

  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    return {
      ok: false,
      reason: allowHttp
        ? 'URL must use http:// or https://'
        : 'URL must use https:// (set ALLOW_HTTP=true to permit http://)',
    };
  }

  if (isPrivateOrLocalHost(parsed.hostname)) {
    return { ok: false, reason: 'URL must not target localhost or private IP addresses' };
  }

  return { ok: true, url: parsed.href };
}

/**
 * Read and validate production URLs from urls.txt.
 * @see A11y_Spider_Proposal_v2.md §7
 */
export async function ingestUrls(options: IngestOptions): Promise<IngestedTarget[]> {
  const content = await readFile(options.urlsFilePath, 'utf8');
  const targets: IngestedTarget[] = [];

  for (const [index, line] of content.split('\n').entries()) {
    const raw = line.trim();
    if (raw.length === 0 || raw.startsWith('#')) {
      continue;
    }

    const validation = validateProductionUrl(raw, options.allowHttp);
    if (!validation.ok) {
      throw new Error(`Invalid URL on line ${index + 1}: ${validation.reason} (${raw})`);
    }

    targets.push({ url: validation.url, line: index + 1 });
  }

  if (targets.length === 0) {
    throw new Error('No valid URLs found in urls file');
  }

  return targets;
}
