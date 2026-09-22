import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultConsentFilePath,
  extractSelectorStrings,
  loadConsentSelectorsFile,
  mergeConsentSelectors,
  parseExtraSelectors,
  resolveConsentFilePath,
  resolveConsentOptions,
} from './consent.js';

describe('consent selectors config', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('loads the shipped consent-selectors.json with known vendors', async () => {
    const file = await loadConsentSelectorsFile(defaultConsentFilePath());

    expect(file.version).toBe(1);
    expect(file.timeoutMs).toBeGreaterThan(0);
    expect(extractSelectorStrings(file)).toContain('#onetrust-accept-btn-handler');
    expect(extractSelectorStrings(file)).toContain('#cassie_accept_all_pre_banner');
    expect(extractSelectorStrings(file)).toContain('[data-test-id="AcceptAllButon"]');
    expect(extractSelectorStrings(file)).toContain('button.sp_choice_type_11');
    expect(extractSelectorStrings(file)).toContain('button[data-testid="accept-button"]');
  });

  it('merges file selectors with extra env selectors without duplicates', () => {
    expect(
      mergeConsentSelectors(['#onetrust-accept-btn-handler', '#a'], ['#a', '#custom-accept']),
    ).toEqual(['#onetrust-accept-btn-handler', '#a', '#custom-accept']);
  });

  it('parses comma-separated extra selectors', () => {
    expect(parseExtraSelectors(' #foo , button:has-text("Accept") ')).toEqual([
      '#foo',
      'button:has-text("Accept")',
    ]);
    expect(parseExtraSelectors(undefined)).toEqual([]);
  });

  it('resolves relative consent file paths from cwd', () => {
    expect(resolveConsentFilePath('consent-selectors.json')).toBe(
      join(process.cwd(), 'consent-selectors.json'),
    );
  });

  it('resolveConsentOptions loads file and can be disabled', async () => {
    const enabled = await resolveConsentOptions({
      CONSENT_DISMISS: 'true',
      CONSENT_SELECTORS_FILE: defaultConsentFilePath(),
    });
    expect(enabled.enabled).toBe(true);
    expect(enabled.selectors.length).toBeGreaterThan(5);

    const disabled = await resolveConsentOptions({ CONSENT_DISMISS: 'false' });
    expect(disabled.enabled).toBe(false);
  });

  it('appends CONSENT_EXTRA_SELECTORS when resolving options', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'a11y-consent-'));
    const filePath = join(tempDir, 'consent.json');
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        timeoutMs: 1000,
        selectors: [{ id: 'a', vendor: 'Test', selector: '#a' }],
      }),
      'utf8',
    );

    const options = await resolveConsentOptions({
      CONSENT_SELECTORS_FILE: filePath,
      CONSENT_EXTRA_SELECTORS: '#custom-site-accept',
      CONSENT_DISMISS_TIMEOUT_MS: '4000',
    });

    expect(options.selectors).toEqual(['#a', '#custom-site-accept']);
    expect(options.timeoutMs).toBe(4000);
  });
});
