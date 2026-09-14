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

## Test-driven development (TDD)

**All implementation must follow TDD.** Write tests **before** production code, watch them fail (red), implement the minimum code to pass (green), then refactor. This applies to every phase — including later phases that touch earlier modules.

### Why TDD for this project

Later phases (ledger, diff, reporting, CLI wiring) must not break scan or ingest behaviour. A growing test suite is the regression gate for the tool that gates regressions for everyone else.

### Workflow (every task)

1. **Read** the proposal section and existing tests for the module.
2. **Write tests first** — define expected behaviour in `*.test.ts` files.
3. **Run tests** — confirm new tests fail for the right reason (`npm test`).
4. **Implement** the smallest change in `src/*.ts` to make tests pass.
5. **Run the full suite** — all prior phase tests must still pass.
6. **Refactor** if needed; keep tests green before moving on.

Do **not** mark a phase complete with failing or skipped tests. Do **not** delete tests to make the suite pass.

### Test layout

| Layer | Location | When to use | Examples |
|-------|----------|-------------|----------|
| **Unit** | `src/<module>.test.ts` | Pure logic, single module, no Playwright/CLI spawn | `src/diff.test.ts`, `src/ingest.test.ts`, `src/config.test.ts` |
| **Integration** | `tests/<name>.test.ts` | Playwright scans, CLI subprocess, multi-module flows | `tests/scan.test.ts`, `tests/cli.test.ts` |
| **HTML fixtures** | `fixtures/` | Static pages for scan integration tests | `fixtures/missing-alt.html` |
| **JSON snapshots** | `tests/snapshots/` | Golden `ScanSnapshot` / diff inputs committed for regression | `tests/snapshots/baseline-aa.json` |

#### Where should a test file go?

- **`src/diff.test.ts`** (current) — **correct.** It tests pure functions (`buildSignature`, `normalizeTarget`) with no I/O. Keep unit tests **colocated** beside the module they test.
- **`tests/diff.test.ts`** — only if the test needs the full pipeline (read `./history/`, spawn CLI, launch browser). Do **not** move unit tests to `tests/` just for organisation.

**Rule:** one module, no filesystem/browser → `src/<module>.test.ts`; crosses modules or needs Playwright/CLI → `tests/<name>.test.ts`.

`vitest.config.ts` includes both patterns: `src/**/*.test.ts` and `tests/**/*.test.ts`.

Prefer **unit tests** for signatures, diff classification, URL validation, and tag presets. Use **integration tests** for Playwright scans against `fixtures/` and end-to-end CLI flows.

### Rules

- **Red → green → refactor** for every feature or bugfix.
- **One phase at a time**, but **always run the entire test suite** (`npm test`) before committing.
- **Lock behaviour with tests** before starting the next phase; do not change existing test expectations unless the proposal intentionally changes.
- **Fixture snapshots** (`tests/snapshots/`) may store golden JSON for diff tests — commit these when behaviour is agreed.
- New code without tests is incomplete.

### Per-phase TDD checklist

| Phase | Write tests first for… | Then implement… |
|-------|------------------------|-----------------|
| 1 | URL validation, axe tag resolution, scan result shape, per-URL error handling | `ingest.ts`, `scan.ts` |
| 2 | Snapshot write/read, baseline loading, signature diff buckets, compliance level mismatch | `ledger.ts`, `diff.ts` |
| 3 | Report JSON schema, HTML sections, console summary | `report.ts` |
| 4 | Exit codes, CLI flag wiring, full pipeline integration | `cli.ts` |

### Commands (TDD loop)

```bash
npm test                   # run full suite
npm run test:watch         # watch mode while developing
npm test -- src/ingest     # single file during red-green loop
```

## Repository layout

```
src/
  cli.ts           # CLI entry (commander)
  config.ts        # WCAG level → axe tags
  config.test.ts   # unit — tag presets (add in Phase 1)
  ingest.ts        # urls.txt validation
  ingest.test.ts   # unit — URL rules (add in Phase 1)
  scan.ts          # Playwright + axe per URL
  ledger.ts        # history/ read/write, golden baseline
  ledger.test.ts   # unit — snapshot I/O (add in Phase 2)
  diff.ts          # signatures, new/resolved/legacy
  diff.test.ts     # unit — signatures & normalizers (existing)
  report.ts        # HTML + JSON reports
  report.test.ts   # unit — report output (add in Phase 3)
  types.ts         # shared types (match proposal §8.1)
tests/
  scan.test.ts     # integration — Playwright + fixtures (Phase 1)
  cli.test.ts      # integration — exit codes, full pipeline (Phase 4)
  snapshots/       # golden JSON for diff regression tests
fixtures/          # static HTML for integration tests
history/           # gitignored scan snapshots
reports/           # gitignored latest reports
examples/          # report-example.html, architecture-diagrams.html
```

### Source layout — flat `src/` (v1)

Keep all pipeline modules at the **root of `src/`** — no subfolders for v1.

| File | Role |
|------|------|
| `cli.ts` | Entry point; wires pipeline stages |
| `types.ts` | Shared types (proposal §8.1) |
| `config.ts` | WCAG level → axe tags, env parsing |
| `ingest.ts` | `urls.txt` validation |
| `scan.ts` | Playwright + axe |
| `ledger.ts` | `./history/` read/write |
| `diff.ts` | Signatures, new/resolved/legacy |
| `report.ts` | HTML + JSON output |

**Why flat?** One file per pipeline stage (~8 modules + tests). Matches the proposal diagram, keeps imports simple (`./diff.js`), and is easy for agents to navigate. Revisit subfolders only if a module splits into multiple files (e.g. `report/html.ts` + `report/json.ts`) or the tree grows past ~15–20 source files.

**Do not** group into `src/scan/`, `src/diff/`, etc. until that threshold — premature nesting adds import path churn with no benefit at current scale.

## Implementation phases

Implement in order using **TDD** (see above). For each phase: **tests first → implement → full suite green → commit**.

### Phase 1 — Scan engine (`src/scan.ts`, `src/ingest.ts`)

**Tests first** (`src/ingest.test.ts`, `src/config.test.ts`, `tests/scan.test.ts`):

- Reject localhost, private IPs, non-HTTPS URLs (unless `ALLOW_HTTP=true`)
- Accept valid production URLs; ignore blank lines and `#` comments
- `resolveComplianceTags` returns correct WCAG 2.2 tag sets for A / AA / AAA
- Scan fixture HTML → `ScanSnapshot` with violations containing `signature`, `html`, `target`
- Failed URL (404 or timeout) → `status: failed`; other URLs still scanned

**Then implement:**

- Validate URLs per proposal §7 (HTTPS, no localhost/private IPs)
- Launch Chromium headless; one browser, sequential URLs
- Apply `PAGE_WAIT_STRATEGY` from `.env`
- Per-URL try/catch: 404/500/timeout → `status: failed`, continue batch
- Map axe `violations[].nodes[]` → flat `Violation[]` with `html`, `target`, `signature`
- Record `meta.axeVersion`, `meta.complianceLevel`, `meta.tags`

### Phase 2 — Ledger & diff (`src/ledger.ts`, `src/diff.ts`)

**Tests first** (`src/diff.test.ts`, `src/ledger.test.ts`):

- Extend existing `diff.test.ts` cases; do not remove passing tests
- `diffScans` classifies new / resolved / legacy from fixture snapshots
- `loadBaseline` resolves `latest`, `golden`, explicit path
- Compliance level mismatch → error (CLI exit `2`)
- `writeSnapshot` creates `history/scan_<ISO>.json`; `pinGoldenBaseline` copies to golden file

**Then implement:**

- Write `history/scan_<ISO>.json` after each run
- Load baseline: `latest` | `golden` | explicit path
- Enforce matching `complianceLevel` before diff (exit `2` on mismatch)
- Classify signatures: new / resolved / legacy
- `--init-baseline`, `--pin-golden`

### Phase 3 — Reporting (`src/report.ts`)

**Tests first** (`src/report.test.ts`):

- `report.json` matches expected schema (summary counts, buckets, failed URLs)
- HTML output includes summary bar, new violations expanded, legacy collapsed
- `--ci` mode suppresses verbose violation detail in stdout

**Then implement:**

- Match UI/structure of `examples/report-example.html`
- Write `reports/report.json` with full diff payload
- Console summary; `--ci` reduces verbosity

### Phase 4 — CLI polish (`src/cli.ts`)

**Tests first** (`tests/cli.test.ts`):

- Exit `0` when no new violations; `1` when new violations with `--fail-on new`
- Exit `2` for config errors (missing urls, invalid baseline, level mismatch)
- Exit `3` when all URLs fail
- Full pipeline: scan → ledger → diff → report (use fixtures, temp `history/`)

**Then implement:**

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

- **TDD is mandatory** — tests before code; full suite green before next phase (see TDD section)
- Keep modules small; one file per pipeline stage
- Colocate unit tests as `src/<module>.test.ts`
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

**v1.0.0** — Phases 1–4 complete. Full pipeline: ingest → scan → ledger → diff → report with CLI exit codes (`0`–`3`). **50 tests** green.

**Deferred to v2:** history retention pruning, parallel scans, SARIF, screenshots, authenticated URLs.
