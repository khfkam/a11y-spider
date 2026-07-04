#!/usr/bin/env node

import { config as loadEnv } from 'dotenv';
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseComplianceLevel } from './config.js';
import { ingestUrls } from './ingest.js';

loadEnv();

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('a11y-spider')
  .description('Batch accessibility URL scanner with axe-core regression tracking')
  .version(version);

program
  .command('scan')
  .description('Scan urls.txt and diff against a baseline')
  .option('--level <level>', 'WCAG level: A, AA, or AAA', parseComplianceLevel, 'AA')
  .option('--baseline <mode>', 'Baseline: latest, golden, or path to JSON file', 'latest')
  .option('--init-baseline', 'Bootstrap first baseline (no diff failure)')
  .option('--pin-golden', 'Copy current scan to golden-baseline.json')
  .option('--fail-on <mode>', 'Exit 1 on condition', 'new')
  .option('--ci', 'CI mode: suppress verbose stdout')
  .option('--urls <file>', 'Path to urls.txt', 'urls.txt')
  .action(async (options) => {
    const complianceLevel = parseComplianceLevel(options.level);
    const allowHttp = process.env.ALLOW_HTTP === 'true';

    try {
      const targets = await ingestUrls({
        urlsFilePath: options.urls,
        allowHttp,
      });

      if (options.ci) {
        console.log(
          `a11y-spider v${version} — ${targets.length} URL(s), WCAG 2.2 ${complianceLevel} (scan pipeline not implemented)`,
        );
      } else {
        console.log(`Loaded ${targets.length} URL(s) from ${options.urls}`);
        console.log(`WCAG 2.2 level: ${complianceLevel}`);
        console.log('Scan pipeline is scaffolded; implement src/scan.ts next.');
      }

      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Configuration error: ${message}`);
      process.exit(2);
    }
  });

program
  .command('info')
  .description('Show pinned runtime and dependency versions')
  .action(async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const readPkgVersion = async (packageDir: string): Promise<string> => {
      const pkg = await readFile(join(root, 'node_modules', packageDir, 'package.json'), 'utf8');
      return (JSON.parse(pkg) as { version: string }).version;
    };

    const axeVersion = await readPkgVersion('axe-core');
    const axePlaywrightVersion = await readPkgVersion('@axe-core/playwright');
    const playwrightVersion = await readPkgVersion('playwright');

    console.log(`a11y-spider: ${version}`);
    console.log(`Node: ${process.version}`);
    console.log(`axe-core: ${axeVersion}`);
    console.log(`@axe-core/playwright: ${axePlaywrightVersion}`);
    console.log(`playwright: ${playwrightVersion}`);
  });

program.parse();
