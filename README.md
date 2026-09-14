# a11y-spider

Batch accessibility URL scanner with axe-core regression tracking.

## Requirements

- **Node.js 24.14.1** (`nvm use`)
- npm registry: [registry.npmjs.org](https://registry.npmjs.org/) only (see `.npmrc`)

## Quick start

```bash
nvm use
npm install
npm run build
npm run a11y-spider -- info
```

Copy environment defaults and add your production URLs:

```bash
cp .env.example .env
# Edit urls.txt — one HTTPS URL per line
```

### First run (bootstrap baseline)

```bash
npm run dev -- scan --urls urls.txt --init-baseline
```

This scans every URL in `urls.txt`, writes a snapshot under `./history/`, and generates `./reports/report.html` plus `./reports/report.json`. No diff failure on the first run.

### Day-to-day / CI

Compare against a pinned golden baseline and fail on new regressions:

```bash
# Pin after a release audit
npm run dev -- scan --urls urls.txt --pin-golden

# Local dev
npm run dev -- scan --urls urls.txt --baseline golden

# CI
npm run a11y-spider -- scan --urls urls.txt --baseline golden --fail-on new --ci
```

Open the HTML report:

```bash
open reports/report.html
```

The report includes a **Failures by URL** section at the top. Click any URL row to expand its new, resolved, and legacy violations. Scan failures (404, timeout, etc.) appear in the same list with the error message. In the browser console you can also jump to a URL with:

```javascript
viewUrlFailures('https://www.example.com/page')
```

`report.json` now includes a `byUrl` array with the same grouped data for CI dashboards and scripts. Use `getUrlFailures(report, url)` programmatically from `src/report.ts`.

## Configuration

Key settings in `.env` (see `.env.example`):

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `AXE_LEVEL` | `AA` | WCAG 2.2 level: `A`, `AA`, or `AAA` |
| `PAGE_WAIT_STRATEGY` | `networkidle` | SPA wait: `networkidle`, `domcontentloaded`, or `load` |
| `HISTORY_DIR` | `./history` | Scan snapshot ledger |
| `REPORTS_DIR` | `./reports` | Latest HTML/JSON reports |
| `ALLOW_HTTP` | `false` | Allow `http://` URLs (production should stay HTTPS) |
| `FAIL_ON` | `new` | Default `--fail-on` mode |

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0` | Success — no new violations (or `--fail-on none`) |
| `1` | New violations detected (`--fail-on new`) |
| `2` | Configuration error (invalid URLs, missing baseline file, level mismatch) |
| `3` | All URLs failed to scan |

## Documentation

- [Technical proposal](./A11y_Spider_Proposal_v2.md)
- [Agent implementation guide](./AGENTS.md)
- [Example HTML report](./examples/report-example.html)

## Development

```bash
npm test
npm run test:watch
npm run typecheck
npm run build
```

## Status

**v1.0.0** — production-ready batch scanner with regression tracking. History retention, parallel scans, and consent/bot bypass are deferred to v2.
