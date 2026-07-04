# a11y-spider — Agent implementation guide

This file guides AI agents and developers implementing **v1** of the project. The product specification lives in [`A11y_Spider_Proposal_v2.md`](./A11y_Spider_Proposal_v2.md).

## Project summary

Local Node.js CLI that:

1. Reads production HTTPS URLs from `urls.txt`
2. Scans with Playwright + `@axe-core/playwright`
3. Saves JSON snapshots under `./history/`
4. Diffs against `latest`, `golden`, or an explicit baseline
5. Writes `reports/report.html` + `reports/report.json`
6. Exits `0`–`3` for CI gating

**Out of scope for v1:** auth, crawling, screenshots, SARIF, parallel scans.

## Runtime & toolchain

| Item | Value |
|------|-------|
| Node.js | **24.14.1** (see `.nvmrc`, `.node-version`, `engines`) |
| Module system | **ESM** (`"type": "module"`) |
| Language | **TypeScript** (strict) |
| CLI | **commander** |
| Tests | **vitest** |
| Registry | **npmjs only** — `registry=https://registry.npmjs.org/` in `.npmrc` |

## Pinned dependencies (npmjs)

| Package | Version |
|---------|---------|
| `axe-core` | 4.12.1 |
| `@axe-core/playwright` | 4.12.1 |
| `playwright` | 1.61.1 |

Do not switch to Backbase or private registries for this repo.

## Repository layout

```
src/
  cli.ts       # CLI entry (commander)
  config.ts    # WCAG level → axe tags
  ingest.ts    # urls.txt validation
  scan.ts      # Playwright + axe per URL
  ledger.ts    # history/ read/write, golden baseline
  diff.ts      # signatures, new/resolved/legacy
  report.ts    # HTML + JSON reports
  types.ts     # shared types (match proposal §8.1)
fixtures/      # static HTML for integration tests
history/       # gitignored scan snapshots
reports/       # gitignored latest reports
examples/      # report-example.html, architecture-diagrams.html
```

## Implementation phases

Implement in order. Run `npm run build` and `npm test` after each phase.

### Phase 1 — Scan engine (`src/scan.ts`, `src/ingest.ts`)

- Validate URLs per proposal §7 (HTTPS, no localhost/private IPs)
- Launch Chromium headless; one browser, sequential URLs
- Apply `PAGE_WAIT_STRATEGY` from `.env`
- Per-URL try/catch: 404/500/timeout → `status: failed`, continue batch
- Map axe `violations[].nodes[]` → flat `Violation[]` with `html`, `target`, `signature`
- Record `meta.axeVersion`, `meta.complianceLevel`, `meta.tags`

### Phase 2 — Ledger & diff (`src/ledger.ts`, `src/diff.ts`)

- Write `history/scan_<ISO>.json` after each run
- Load baseline: `latest` | `golden` | explicit path
- Enforce matching `complianceLevel` before diff (exit `2` on mismatch)
- Classify signatures: new / resolved / legacy
- `--init-baseline`, `--pin-golden`

### Phase 3 — Reporting (`src/report.ts`)

- Match UI/structure of `examples/report-example.html`
- Write `reports/report.json` with full diff payload
- Console summary; `--ci` reduces verbosity

### Phase 4 — CLI polish (`src/cli.ts`)

- Wire scan → ledger → diff → report
- Exit codes: `0` ok, `1` new violations, `2` config, `3` all URLs failed
- README, `.env.example` verification

## Key contracts

### Violation signature

```
canonicalUrl + "|" + ruleId + "|" + serializedTarget
```

See `src/diff.ts` — strip CSS module hashes `_[a-zA-Z0-9]{5,}`.

### WCAG 2.2 tag presets

See `src/config.ts` — do not hardcode tags elsewhere.

### JSON shapes

See `src/types.ts` and proposal §8.1.

## Commands

```bash
nvm use                    # Node 24.14.1
npm install                # uses registry.npmjs.org
npm run build
npm test
npm run dev -- scan        # development
npm run a11y-spider -- info
```

## Conventions

- Keep modules small; one file per pipeline stage
- No auth, staging, or screenshot code in v1
- Prefer explicit errors with exit code `2` for config problems
- Integration tests use `fixtures/` only — not production URLs in CI
- HTML report: reference `examples/report-example.html` for layout

## Reference documents

| Doc | Use |
|-----|-----|
| `A11y_Spider_Proposal_v2.md` | Full specification |
| `examples/report-example.html` | Report UI target |
| `.env.example` | Config defaults |

## Current status

Scaffold only — `ingest.ts` reads urls.txt; `scan`, `ledger`, `report` throw `not implemented`. Implement Phase 1 next.
