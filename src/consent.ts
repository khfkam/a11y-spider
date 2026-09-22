import { access, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

export interface ConsentSelectorEntry {
  id: string;
  vendor: string;
  selector: string;
  notes?: string;
}

export interface ConsentSelectorsFile {
  version: number;
  description?: string;
  timeoutMs?: number;
  selectors: ConsentSelectorEntry[];
}

export interface ConsentOptions {
  enabled: boolean;
  selectors: string[];
  timeoutMs: number;
  /** Brief wait after navigation for banners to appear (ms). Default 500. */
  settleMs?: number;
  /** When true, logs dismiss outcome to stdout (non-CI). */
  verbose?: boolean;
}

export interface ConsentDismissResult {
  dismissed: boolean;
  matchedSelector?: string;
  matchedId?: string;
}

const DEFAULT_TIMEOUT_MS = 2500;
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONSENT_FILE = 'consent-selectors.json';

export function defaultConsentFilePath(): string {
  return join(PACKAGE_ROOT, DEFAULT_CONSENT_FILE);
}

export function resolveConsentFilePath(configuredPath?: string): string {
  if (!configuredPath || configuredPath.trim().length === 0) {
    return defaultConsentFilePath();
  }

  if (isAbsolute(configuredPath)) {
    return configuredPath;
  }

  return join(process.cwd(), configuredPath);
}

export async function loadConsentSelectorsFile(
  filePath: string = defaultConsentFilePath(),
): Promise<ConsentSelectorsFile> {
  const content = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(content) as ConsentSelectorsFile;

  if (!Array.isArray(parsed.selectors)) {
    throw new Error(`Invalid consent selectors file: missing selectors array (${filePath})`);
  }

  return parsed;
}

export function extractSelectorStrings(file: ConsentSelectorsFile): string[] {
  return file.selectors
    .map((entry) => entry.selector?.trim())
    .filter((selector): selector is string => Boolean(selector));
}

export function parseExtraSelectors(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function mergeConsentSelectors(
  fileSelectors: string[],
  extraSelectors: string[] = [],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const selector of [...fileSelectors, ...extraSelectors]) {
    if (!seen.has(selector)) {
      seen.add(selector);
      merged.push(selector);
    }
  }

  return merged;
}

export async function resolveConsentOptions(env: NodeJS.ProcessEnv = process.env): Promise<ConsentOptions> {
  const enabled = env.CONSENT_DISMISS !== 'false';
  const filePath = resolveConsentFilePath(env.CONSENT_SELECTORS_FILE);
  const extraSelectors = parseExtraSelectors(env.CONSENT_EXTRA_SELECTORS);

  let fileSelectors: string[] = [];
  let timeoutMs = parseTimeout(env.CONSENT_DISMISS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  try {
    await access(filePath);
    const file = await loadConsentSelectorsFile(filePath);
    fileSelectors = extractSelectorStrings(file);
    if (file.timeoutMs && file.timeoutMs > 0 && !env.CONSENT_DISMISS_TIMEOUT_MS) {
      timeoutMs = file.timeoutMs;
    }
  } catch (error) {
    if (enabled) {
      const message = error instanceof Error ? error.message : String(error);
      // Fail soft when the selectors file is missing — scan still runs.
      if (!isEnoent(error)) {
        console.warn(`consent: could not load ${filePath} (${message}); continuing without file selectors`);
      }
    }
  }

  return {
    enabled,
    selectors: mergeConsentSelectors(fileSelectors, extraSelectors),
    timeoutMs,
    settleMs: parseTimeout(env.CONSENT_SETTLE_MS, 500),
    verbose: env.CI !== 'true',
  };
}

function parseTimeout(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

/**
 * Best-effort cookie/consent dismissal. Never throws — scan continues either way.
 */
export async function tryDismissConsent(
  page: Page,
  options: Pick<ConsentOptions, 'enabled' | 'selectors' | 'timeoutMs' | 'settleMs' | 'verbose'>,
  selectorMeta: ConsentSelectorEntry[] = [],
): Promise<ConsentDismissResult> {
  if (!options.enabled || options.selectors.length === 0) {
    return { dismissed: false };
  }

  const settleMs = options.settleMs ?? 500;
  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
  }

  const metaBySelector = new Map(selectorMeta.map((entry) => [entry.selector, entry]));

  for (const selector of options.selectors) {
    try {
      const locator = page.locator(selector).first();
      // Fast path: do not wait the full timeout for every selector on banner-less pages.
      if ((await locator.count()) === 0) {
        continue;
      }
      if (!(await locator.isVisible())) {
        continue;
      }

      await locator.click({ timeout: options.timeoutMs });
      // Give overlays a brief moment to close before axe runs.
      await page.waitForTimeout(300);

      const matched = metaBySelector.get(selector);
      if (options.verbose) {
        const label = matched ? `${matched.id} (${matched.vendor})` : selector;
        console.log(`consent: dismissed via ${label}`);
      }

      return {
        dismissed: true,
        matchedSelector: selector,
        matchedId: matched?.id,
      };
    } catch {
      // Try the next selector — fail soft.
    }
  }

  if (options.verbose) {
    console.log('consent: no matching accept button (continuing scan)');
  }

  return { dismissed: false };
}
