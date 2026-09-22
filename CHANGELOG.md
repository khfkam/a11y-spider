# Changelog

All notable changes to this project are documented here.

## [1.1.0] — 2026-09-22

### Added

- **Cookie / consent dismiss** — best-effort Accept click before each axe scan (fail-soft)
- **`consent-selectors.json`** — editable presets for OneTrust, Cassie/ITV, Wayfair, Sourcepoint, BBC, Cookiebot, Didomi, and generic Accept fallbacks
- Env config: `CONSENT_DISMISS`, `CONSENT_SELECTORS_FILE`, `CONSENT_DISMISS_TIMEOUT_MS`, `CONSENT_SETTLE_MS`, `CONSENT_EXTRA_SELECTORS`
- Fixture + tests for banner dismissal (`fixtures/cookie-banner.html`)

### Changed

- README documents how to edit consent selectors and append site-specific ones

## [1.0.0] — 2026-03-23

First production release of **a11y-spider** — a local CLI for batch accessibility scanning with axe-core regression tracking.

### Added

- **Scan engine** — Playwright + `@axe-core/playwright`; WCAG 2.2 levels A / AA / AAA; per-URL error isolation
- **URL ingestion** — `urls.txt` validation (HTTPS, no localhost/private IPs)
- **Ledger** — timestamped snapshots in `./history/`; latest, golden, and explicit baselines
- **Diff engine** — new / resolved / legacy violation buckets; compliance level mismatch protection
- **Reporting** — `report.html`, `report.json`, console summary; per-URL failure grouping
- **CLI** — full pipeline wiring with exit codes `0`–`3`; `--init-baseline`, `--pin-golden`, `--fail-on`, `--ci`
- **Tests** — unit and integration tests (vitest + Playwright fixtures)

### Deferred to v2

- History retention pruning
- Parallel scans
- SARIF export
- Violation screenshots
- Authenticated URLs / bot–WAF bypass

[1.1.0]: https://github.com/khfkam/a11y-spider/releases/tag/v1.1.0
[1.0.0]: https://github.com/khfkam/a11y-spider/releases/tag/v1.0.0
