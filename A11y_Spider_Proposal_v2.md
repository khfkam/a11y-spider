# Technical Proposal: Automated Accessibility (a11y) URL Scanner & Regression Tracker

**Prepared for:** Internal Engineering & QA Teams  
**Version:** 2.1  
**Status:** Draft for review  
**Objective:** Design and implement a local, scriptable CLI utility that batch-audits a configurable list of **production-ready, publicly accessible URLs** using `axe-core`, diffs results against historical baselines, and surfaces newly introduced accessibility defects — without cloud infrastructure or third-party scanning services.

---

## 1. Executive Summary

Modern web development requires continuous verification of accessibility compliance. Manual testing via browser extensions works well for individual pages but does not scale across large URL inventories and cannot track regressions over time.

This proposal defines a **local-first Node.js CLI** — referred to internally as **a11y-spider** — that:

1. Scans a fixed list of **production URLs** (v1) using Playwright and `@axe-core/playwright`.
2. Persists each run as a timestamped JSON snapshot in `./history/`.
3. Diffs the current run against a chosen baseline to classify violations as **new**, **resolved**, or **legacy unchanged**.
4. Runs audits at a selectable **WCAG compliance level** — **A**, **AA**, or **AAA** — mapped to `axe-core` rule tags.
5. Emits developer-friendly HTML and machine-readable JSON reports, with exit codes suitable for CI pipelines.

**Naming note:** v1 is a **batch URL scanner**, not a link-crawling spider. Link discovery, depth limits, and sitemap ingestion are explicitly deferred to v2.

**Delivery target:** A production-ready v1 in **4 weeks (20 working days) + 1 week contingency (5 days)** from a single automation or software engineer.

---

## 2. Problem Statement & Goals

### 2.1 Current Pain Points

| Pain point | Impact |
| :--- | :--- |
| Manual axe/DevTools checks are page-by-page | Cannot audit 50+ production URLs before a release |
| No historical comparison | Teams cannot tell if a violation is new or pre-existing |
| Cloud a11y scanners add subscription cost and less control over diff workflows | Teams want a lightweight, self-managed regression gate |
| CI pipelines lack a lightweight a11y regression gate | Regressions reach production undetected |

### 2.2 Success Criteria (v1)

The project is considered complete when all of the following are true:

| # | Criterion | Measurable outcome |
| :--- | :--- | :--- |
| 1 | A engineer can scan 20+ production URLs in one command | `npm run a11y-spider` completes without manual intervention per URL |
| 2 | New regressions are isolated from known issues | Diff report shows three buckets: new / resolved / legacy |
| 3 | CI can gate on new violations | Exit code `1` when any **new** violation is detected; `0` otherwise |
| 4 | Reports are actionable for developers | Each violation links to axe rule documentation and includes URL, selector, HTML snippet, and summary |
| 5 | One bad URL does not abort the batch | 404/500/timeout URLs are logged and skipped; remaining URLs still scan |
| 6 | Onboarding takes under 30 minutes | README covers install, `urls.txt` setup, first baseline, and CI integration |
| 7 | Scans run at a chosen WCAG level | `--level A`, `--level AA`, or `--level AAA` each produce correct axe tag sets; level is recorded in scan metadata |

### 2.3 Non-Goals (v1)

- Link crawling or automatic URL discovery
- SARIF output (deferred to v2)
- Parallel scan execution (deferred to v2)
- Violation screenshots (deferred to v2)
- Local development servers, staging environments, or URLs behind corporate firewalls/VPN
- Login flows, SSO, MFA, or any authenticated session handling
- Hosted dashboard or cloud storage
- Replacing manual screen-reader or keyboard testing

---

## 3. Scope: v1 vs v2

### 3.1 v1 — In Scope (4-week delivery)

| Capability | Detail |
| :--- | :--- |
| URL ingestion | Plain-text `urls.txt` (one URL per line) of **production-ready, publicly accessible HTTPS URLs**; optional JSON config |
| Scan engine | Playwright headless Chromium + `@axe-core/playwright` |
| WCAG compliance level | Selectable **A**, **AA**, or **AAA** via `--level` flag or `AXE_LEVEL` env var (default: `AA`) |
| SPA handling | Configurable wait strategy (`networkidle`, `domcontentloaded`, or selector wait) |
| Persistence | Timestamped JSON files in `./history/` |
| Diff engine | URL-scoped violation signatures; compare to `latest` or named `golden` baseline |
| Normalization v1 | Strip volatile CSS module hashes; canonicalize axe `target` arrays |
| Reporting | `report.html` + `report.json` + console summary |
| CI integration | Exit codes, `--fail-on new`, JSON artifact output |
| Error isolation | Per-URL try/catch; scan summary includes failed URLs |

### 3.2 v2 — Deferred

| Capability | Rationale for deferral |
| :--- | :--- |
| Link crawling / sitemap ingestion | Requires crawl policy, scope rules, and deduplication |
| Parallel scans (3–5 concurrent) | Optimization; single-threaded is sufficient for v1 |
| SARIF export | Needed for some security pipelines; not blocking MVP |
| Advanced selector normalizers | Fuzzy matching, snippet hashing — high effort, iterative |
| Violation screenshots (`--screenshots`) | Optional post-scan step; selector edge cases and storage sizing |
| Authenticated or firewall-protected environments | Out of v1 scope; requires login, VPN, or corporate network access |
| SQLite storage | JSON files are sufficient until query/reporting needs grow |
| PR/branch baseline comparison | Requires CI artifact strategy; build on v1 history format |
| Auto-open report in browser | Nice-to-have; document `open report.html` instead |

---

## 4. Core Architectural Design

The solution is a lightweight Node.js CLI that runs locally on developer and QA machines. It audits **live production URLs** directly — no VPN, staging environment, or authentication setup required. The tool runs without external scanning services or hosted infrastructure.

### 4.1 Pipeline Modules

The program follows a linear lifecycle across **five modules**:

| Module | Core Responsibility | Tech Stack |
| :--- | :--- | :--- |
| **1. Target Ingestion** | Reads and validates `urls.txt` or JSON config; ensures URLs are absolute production HTTPS endpoints. | Node.js `fs/promises` |
| **2. Execution Engine** | Launches headless Chromium, waits for SPA readiness, runs axe audit per URL. | Playwright + `@axe-core/playwright` |
| **3. State Ledger** | Writes timestamped scan snapshots; loads comparison baseline from `./history/` or a named golden file. | Local JSON files |
| **4. Differential Core** | Computes new / resolved / legacy violations using URL-scoped signatures and selector normalizers. | Custom JavaScript |
| **5. Reporting & Output** | Renders HTML dashboard, writes JSON, prints console summary, sets process exit code. | Static HTML template + JSON |

**Pipeline flow:**

```
urls.txt + .env
       │
       ▼
┌──────────────────┐
│ Target Ingestion │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Execution Engine │  Playwright + axe-core
└────────┬─────────┘
         ▼
   Raw Scan JSON ──────────────────┐
         │                          │
         ▼                          ▼
┌──────────────────┐        ┌──────────────────┐
│  State Ledger    │        │ Differential Core│
│  (./history/)    │        │  new / resolved  │
└────────┬─────────┘        │  / legacy        │
         │                  └────────┬─────────┘
         └────────── baseline ────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
           report.html + report.json          Exit Code (0–3)
```

> **Note:** Mermaid diagrams do not render in all Markdown viewers. For an interactive version, open [`examples/architecture-diagrams.html`](examples/architecture-diagrams.html) in a browser.

### 4.2 Directory Layout

```
a11y-spider/
├── urls.txt                  # Production URL list (git-tracked per project)
├── .env                      # Local scan config (git-ignored)
├── .env.example              # Documented template (git-tracked)
├── history/                  # Scan snapshots (git-ignored by default; CI artifact)
│   ├── scan_2026-07-03T120000Z/   # v2: per-run folder when --screenshots enabled
│   │   ├── scan.json
│   │   └── screenshots/           # v2 only — PNGs per violation (optional)
│   ├── scan_2026-07-03T120000Z.json   # v1: flat JSON per run
│   └── golden-baseline.json       # Pinned baseline (JSON only; no screenshots)
├── reports/                  # Latest run output (git-ignored)
│   ├── report.html
│   └── report.json
└── src/
    ├── ingest.ts
    ├── scan.ts
    ├── ledger.ts
    ├── diff.ts
    ├── report.ts
    └── cli.ts
```

**Example `urls.txt`:**

```
https://www.example.com/
https://www.example.com/products
https://www.example.com/contact
```

---

## 5. axe-core Configuration

Scan results are only comparable when rule sets — including **WCAG compliance level** — are consistent across runs and environments.

### 5.1 WCAG Compliance Levels (A / AA / AAA)

Each scan runs against a single compliance level. Levels are **cumulative**: AA includes all Level A rules; AAA includes all Level A and AA rules. Tag presets map to **WCAG 2.2** and include cumulative tags from WCAG 2.0, 2.1, and 2.2 (WCAG 2.2 builds on earlier criteria).

| Level | CLI flag | axe-core tags | Use case |
| :--- | :--- | :--- | :--- |
| **A** | `--level A` | `wcag2a`, `wcag21a`, `wcag22a` | Minimum legal baseline in some jurisdictions; fastest scan |
| **AA** *(default)* | `--level AA` | `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22a`, `wcag22aa` | Standard target for most products and regulatory requirements |
| **AAA** | `--level AAA` | `wcag2a`, `wcag2aa`, `wcag2aaa`, `wcag21a`, `wcag21aa`, `wcag21aaa`, `wcag22a`, `wcag22aa`, `wcag22aaa` | Highest automated coverage; stricter checks, more violations surfaced |

The `--level` flag resolves to the tag set above at runtime. Advanced users may override tags entirely via `AXE_TAGS` (see §5.3), but `--level` is the supported interface for teams.

**Baseline compatibility:** Each scan snapshot records its compliance level in metadata (`meta.complianceLevel`). The diff engine compares a current run to a baseline **only when both share the same level**. If levels differ, the tool exits with code `2` and instructs the user to re-pin a golden baseline or pass an explicit `--baseline` file captured at the same level.

### 5.2 Default Scan Settings (v1)

| Setting | Default value | Notes |
| :--- | :--- | :--- |
| `complianceLevel` | `AA` | Maps to tag preset in §5.1 |
| `tags` | *(resolved from level)* | Do not set manually unless overriding |
| `rules` | *(axe defaults for tags)* | Override via config for experiments |
| `exclude` | `[]` | Per-project exclusions (e.g. third-party widgets) |
| `iframes` | `true` | Audit content inside iframes |
| `reporter` | `v2` | axe-core v2 reporter format |

### 5.3 Configurable via `.env` / JSON config

```env
# Compliance level — preferred over manual tag lists
AXE_LEVEL=AA

# Optional: override tag preset entirely (advanced; disables --level mapping)
# AXE_TAGS=wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22a,wcag22aa

AXE_EXCLUDE_SELECTORS=#third-party-chat,.ads-container
PAGE_WAIT_STRATEGY=networkidle
PAGE_TIMEOUT_MS=30000
NAVIGATION_TIMEOUT_MS=60000
```

JSON config alternative (per-project or per-URL overrides):

```json
{
  "complianceLevel": "AA",
  "excludeSelectors": ["#third-party-chat"]
}
```

### 5.4 Standards Alignment

- **Default target:** WCAG **2.2** Level **AA** — the current W3C recommendation and most common organizational standard.
- **Tag mapping:** `--level` presets resolve to cumulative `wcag2*` / `wcag21*` / `wcag22*` axe-core tags so scans cover all success criteria up to the selected level.
- **Level A:** Available for teams tracking minimum compliance or running quick smoke scans.
- **Level AAA:** Available for products with explicit AAA commitments; expect significantly more violations and a larger legacy-debt surface.
- **Documented limitation:** Automated tools detect ~30–40% of accessibility issues regardless of level. Higher WCAG levels do not replace manual assistive-technology testing.
- **Rule changes:** When `axe-core` is upgraded (PATCH/MINOR dependency bump), release notes must call out new or changed rules that may appear as false "new" violations. Teams may reset or re-pin the golden baseline after axe upgrades.

---

## 6. Violation Identity & Diff Engine

### 6.1 Violation Signature (v1)

Each violation is uniquely identified by a **URL-scoped signature**:

```
signature = canonicalUrl + "|" + ruleId + "|" + serializedTarget
```

| Component | Normalization |
| :--- | :--- |
| `canonicalUrl` | Lowercase origin + pathname; strip trailing slash; strip known tracking query params |
| `ruleId` | axe rule ID as returned by `@axe-core/playwright` (e.g. `color-contrast`) |
| `serializedTarget` | axe `target` array joined with ` > `; volatile hash suffixes stripped (see §6.2) |

**Why URL is required:** The same rule on a shared component selector (e.g. `.bb-button`) on two different pages are distinct violations. Omitting URL causes false collisions in the diff.

### 6.2 Selector Normalization (v1)

Dynamic CSS module hashes and framework-generated class suffixes cause signature churn between runs. v1 applies:

1. **Hash stripping:** Remove segments matching `_[a-zA-Z0-9]{5,}` (CSS modules pattern).
2. **Target canonicalization:** Flatten axe `target` string arrays; join iframe/shadow paths consistently.
3. **Fallback (v2):** If normalization still produces unstable signatures, add `failureSummary` hash as tiebreaker.

### 6.3 Diff Classification

Given `current` scan and `baseline` scan:

| Bucket | Condition |
| :--- | :--- |
| 🔴 **New** | Signature in `current`, absent from `baseline` |
| 🟢 **Resolved** | Signature in `baseline`, absent from `current` |
| ⚪ **Legacy unchanged** | Signature in both `current` and `baseline` |

### 6.4 Baseline Modes

| Mode | CLI flag | Behavior |
| :--- | :--- | :--- |
| **Latest** (default) | *(none)* | Compare to most recent file in `./history/` by ISO timestamp |
| **Golden** | `--baseline golden` | Compare to `./history/golden-baseline.json` |
| **Explicit file** | `--baseline ./history/scan_2026-06-01T090000Z.json` | Compare to specified snapshot |
| **Bootstrap** | `--init-baseline` | First run: write snapshot, mark all violations as baseline (no failure) |
| **Pin golden** | `--pin-golden` | Copy current scan to `golden-baseline.json` (e.g. after release) |

**Recommended team workflow:**

1. After a release or audit sprint, run `--pin-golden` to establish the accepted baseline.
2. Day-to-day dev runs use `--baseline golden` to catch only regressions since last release.
3. CI uses `--baseline golden --fail-on new`.

**Updating golden baseline:** Run a fresh scan, then `--pin-golden`. This **overwrites** `golden-baseline.json` with a copy of that single scan snapshot — it does not merge all previous runs. Timestamped `scan_*.json` files remain in `./history/` as the full local audit trail.

### 6.5 Flake & Stability Policy

| Scenario | Policy |
| :--- | :--- |
| Lazy-loaded content | Use `PAGE_WAIT_STRATEGY` + optional per-URL `waitForSelector` in JSON config |
| Inconsistent violation count between runs | Log warning if new count differs by >20% from baseline with no code change; do not auto-fail |
| axe version upgrade | Treat as baseline reset event; document in CHANGELOG; re-pin golden after review |
| Compliance level changed between runs | Diff blocked (exit `2`); re-pin golden at new level or pass a baseline captured at the same level |
| Transient network errors | URL marked `failed` in report; does not count as a11y pass or fail |

---

## 7. Target URL Requirements

v1 scans **production-ready URLs only** — publicly accessible pages that require no VPN, corporate network access, or login.

### 7.1 In Scope

| Requirement | Detail |
| :--- | :--- |
| **Accessibility** | URL must be reachable over the public internet without authentication |
| **Protocol** | HTTPS production domains (e.g. `https://www.example.com/dashboard`) |
| **Content** | Live production or production-equivalent public content (not localhost, not `*.local`) |
| **Format** | Absolute URLs in `urls.txt`; relative paths are not supported in v1 |

### 7.2 Out of Scope (v1)

| Environment | Reason |
| :--- | :--- |
| `localhost` / `127.0.0.1` | Local dev servers are not production-ready targets |
| Staging behind corporate firewall | Requires VPN or internal network access |
| Password-protected or SSO-gated pages | Requires authentication flows deferred to v2 |
| Preview/review deployments with auth tokens | Non-public URLs |

### 7.3 URL Validation

At ingestion, the tool validates each URL and **warns or skips** entries that:

- Use `http://` (non-HTTPS) unless explicitly allowed via `ALLOW_HTTP=true`
- Match localhost or private IP ranges (`127.0.0.1`, `10.x`, `192.168.x`, etc.)
- Are missing a scheme or hostname

This keeps the scan scope explicit and prevents accidental runs against non-production targets.

---

## 8. Local Baseline Data Management

### 8.1 Storage Format: JSON (v1)

v1 uses **timestamped JSON files** in `./history/`. SQLite is deferred to v2 when query needs (trending, cross-run analytics) justify the complexity.

**Scan file schema (simplified):**

```json
{
  "meta": {
    "runId": "scan_2026-07-03T120000Z",
    "timestamp": "2026-07-03T12:00:00.000Z",
    "axeVersion": "4.9.1",
    "complianceLevel": "AA",
    "wcagVersion": "2.2",
    "tags": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"],
    "toolVersion": "1.0.0"
  },
  "urls": [
    {
      "url": "https://www.example.com/dashboard",
      "status": "ok",
      "violations": [
        {
          "ruleId": "color-contrast",
          "impact": "serious",
          "description": "Elements must have sufficient color contrast",
          "helpUrl": "https://dequeuniversity.com/rules/axe/4.9/color-contrast",
          "target": ["#main", ".card-title"],
          "html": "<h2 class=\"card-title\">Account summary</h2>",
          "failureSummary": "Fix any of the following...",
          "signature": "https://www.example.com/dashboard|color-contrast|#main > .card-title"
        }
      ]
    }
  ]
}
```

Each violation identifies the **failing element** via axe's `target` selector path and `html` snippet, plus `failureSummary` explaining what is wrong. axe-core does not provide screenshots in standard output — see §17.1 for optional v2 capture.

v1 stores each run as a flat `scan_<timestamp>.json` file. v2 with `--screenshots` uses a per-run folder (`scan_<timestamp>/scan.json` + `screenshots/`) — see §17.1.

### 8.2 State Ledger Lifecycle

1. **Bootstrap (`--init-baseline`):** If no baseline exists, write current scan to `./history/`, classify all violations as baseline. Exit `0`.
2. **Load baseline:** Resolve per `--baseline` flag (latest, golden, or explicit path).
3. **Diff:** Compute new / resolved / legacy across all URL results.
4. **Serialize:** Always write a new timestamped snapshot after each run (append-only ledger).
5. **Optional pin:** `--pin-golden` copies current snapshot to `golden-baseline.json`.

### 8.3 History Retention

| Setting | Default | Notes |
| :--- | :--- | :--- |
| `HISTORY_RETENTION_DAYS` | `90` | Auto-prune snapshots older than N days (not golden); v2: deletes associated `screenshots/` folders |
| `HISTORY_MAX_FILES` | `100` | Hard cap; oldest non-golden scan folders/files deleted first |
| Golden baseline | Never auto-deleted | Protected file |

### 8.4 Where History Lives

Git-ignoring `./history/` does **not** prevent the tool from reading or writing scan history locally. It only means histories are not version-controlled in Git.

| Context | Recommendation |
| :--- | :--- |
| **Local dev** | `./history/` git-ignored on each machine; all `scan_*.json` files visible locally |
| **CI pipeline** | Download `golden-baseline.json` from artifact store; upload new scan + report as build artifacts |
| **Shared team baseline** | Commit `golden-baseline.json` to a dedicated config repo or store as CI artifact |
| **Full team audit trail** | Use CI artifacts or object storage for all scan snapshots — not Git |

---

## 9. Reporting & CI Integration

### 9.1 Output Artifacts

Each run writes to `./reports/`:

| File | Purpose |
| :--- | :--- |
| `report.html` | Human-readable dashboard: summary counts, per-URL breakdown, collapsible legacy section |
| `report.json` | Machine-readable diff for CI parsing and dashboards |
| Console summary | One-line pass/fail + counts |

### 9.2 HTML Report Structure

1. **Summary bar:** WCAG compliance level, new / resolved / legacy / failed URL counts.
2. **New violations (expanded by default):** URL, rule, impact, selector, HTML snippet, failure summary, link to axe docs. *(v2: optional screenshot thumbnail when `--screenshots` is enabled.)*
3. **Resolved violations (collapsed):** Confirmation of fixes.
4. **Legacy violations (collapsed):** Known debt; hidden by default to reduce noise.
5. **Failed URLs:** Timeouts, 404, 500, DNS errors — separate from a11y violations.

### 9.3 Exit Codes

| Code | Meaning |
| :--- | :--- |
| `0` | Success: no new violations (or `--no-fail` set) |
| `1` | New violations detected (`--fail-on new`, default in CI) |
| `2` | Configuration error (missing urls, invalid baseline, non-production URL in list) |
| `3` | All URLs failed to scan (network outage or unreachable production hosts) |

### 9.4 CLI Examples

```bash
# Local dev: WCAG 2.2 AA scan (default), compare to golden
npm run a11y-spider -- scan --baseline golden

# Run at WCAG Level A only (faster, fewer rules)
npm run a11y-spider -- scan --level A --baseline golden

# Run at WCAG Level AAA (strictest automated coverage)
npm run a11y-spider -- scan --level AAA --baseline golden

# CI: fail build on new regressions at AA
npm run a11y-spider -- scan --level AA --baseline golden --fail-on new --ci

# Establish golden baseline after release audit (level stored in snapshot)
npm run a11y-spider -- scan --level AA --pin-golden

# Bootstrap first run on a new project
npm run a11y-spider -- scan --level AA --init-baseline
```

### 9.5 CI Pipeline Sketch

```yaml
# Example (GitHub Actions)
- name: Install Playwright browsers
  run: npx playwright install chromium --with-deps

- name: Download golden baseline
  run: curl -o history/golden-baseline.json "$BASELINE_ARTIFACT_URL"

- name: Run a11y scan
  run: npm run a11y-spider -- scan --level AA --baseline golden --fail-on new --ci
  env:
    AXE_LEVEL: AA

- name: Upload report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: a11y-report
    path: reports/
```

---

## 10. Configuration & Distribution

### 10.1 Environment Variables (`.env`)

```env
# Scan behavior — A, AA, or AAA (default: AA)
AXE_LEVEL=AA
PAGE_WAIT_STRATEGY=networkidle
PAGE_TIMEOUT_MS=30000
CONCURRENCY=1

# URL validation
ALLOW_HTTP=false

# History
HISTORY_DIR=./history
HISTORY_RETENTION_DAYS=90
HISTORY_MAX_FILES=100

# Output
REPORTS_DIR=./reports
FAIL_ON=new
```

Scan targets are defined in `urls.txt` (production HTTPS URLs). Optional `.env` overrides tune scan behavior only — no credentials or environment-specific secrets are required.

### 10.2 Semantic Versioning

| Bump | When |
| :--- | :--- |
| **MAJOR** | Breaking changes to scan JSON schema, CLI flags, or signature algorithm |
| **MINOR** | New features (crawling, SARIF, parallel scans, screenshots) — backward compatible |
| **PATCH** | Bug fixes, axe-core dependency updates |

**Important:** axe-core PATCH upgrades that add rules may produce new violations. Document in CHANGELOG; recommend baseline review.

### 10.3 Distribution

| Method | Use case |
| :--- | :--- |
| Internal Git repo + `git pull` | Source of truth for tool code |
| `npm link` or `npx` from monorepo | Local dev invocation |
| Published internal npm package (v2) | Cross-repo adoption without clone |

---

## 11. Security & Privacy

| Risk | Mitigation |
| :--- | :--- |
| Production URLs in reports | Reports are local/CI artifacts; restrict artifact access per team policy |
| PII in failure summaries | Reports may contain visible text from live production DOM; treat artifacts as internal |
| Scan output in logs | `--ci` mode suppresses verbose violation detail in stdout |
| Accidental scan of non-production URL | Ingestion validator rejects localhost, private IPs, and non-HTTPS by default |

---

## 12. Testing Strategy (Tool Itself)

| Layer | What is tested |
| :--- | :--- |
| **Unit tests** | Signature normalization, diff classification, URL canonicalization |
| **Integration tests** | Scan a local static HTML fixture with known violations; assert JSON output |
| **Diff tests** | Two fixture snapshots → assert correct new/resolved/legacy buckets |
| **CLI tests** | Exit codes for pass/fail/config-error scenarios |

Test fixtures live in `fixtures/` with intentional a11y violations (missing alt text, low contrast, etc.).

---

## 13. Implementation Timeline

**Total effort:** 20 working days + 5 days contingency = **25 days (5 weeks)**.

Revised phasing prioritizes **trustworthy scan data** before diff and reporting polish.

| Phase | Days | Deliverables |
| :--- | :--- | :--- |
| **Week 1: Scan Engine & Data Quality** | 5 | URL ingestion (`urls.txt` + JSON config); production URL validation (HTTPS, no localhost/private IPs); Playwright lifecycle; `@axe-core/playwright` integration; SPA wait strategies; per-URL error isolation (404/500/timeout); raw per-URL JSON output |
| **Week 2: State Ledger & Diff Core** | 5 | `./history/` JSON snapshots; URL-scoped signature algorithm; selector normalizer v1; baseline modes (`latest`, `golden`, explicit); `--init-baseline` and `--pin-golden`; unit tests for diff engine |
| **Week 3: Reporting & CI** | 5 | `report.html` template; `report.json` output; console summary; exit codes (`0`/`1`/`2`/`3`); `--fail-on new`; `--ci` mode; noise reduction (collapse legacy); README and `.env.example` |
| **Week 4: Hardening & Onboarding** | 5 | History retention policy; WCAG 2.2 level presets (`A` / `AA` / `AAA`) and baseline level validation; scan fixtures + integration tests; CI pipeline example (GitHub Actions); edge-case hardening (empty url list, invalid URLs, missing baseline, level mismatch) |
| **Week 5: Contingency** | 5 | Buffer for selector normalization edge cases, production content flake handling, axe upgrade baseline migration notes, team pilot feedback |

**Implementation timeline (5 weeks):**

```
Week 1          Week 2          Week 3          Week 4          Week 5
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Scan engine │ │ Ledger +    │ │ Reports +   │ │ Hardening + │ │ Contingency │
│ URL valid.  │ │ diff core   │ │ CI exit     │ │ integration │ │ buffer      │
│ SPA waits   │ │ signatures  │ │ codes       │ │ tests, docs │ │             │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
     5 days          5 days          5 days          5 days          5 days
```

| Week | Focus | Key deliverables |
| :--- | :--- | :--- |
| 1 | Scan engine & data quality | Playwright + axe, URL validation, SPA waits, per-URL errors |
| 2 | State ledger & diff | History JSON, signatures, normalizers, `--pin-golden` |
| 3 | Reporting & CI | `report.html`, exit codes, `--fail-on new`, README |
| 4 | Hardening & onboarding | WCAG 2.2 presets, fixtures, GitHub Actions example |
| 5 | Contingency | Selector edge cases, flake handling, pilot feedback |

---

## 14. Maintenance & Ownership

| Responsibility | Owner | Cadence |
| :--- | :--- | :--- |
| `urls.txt` per application | Feature team / QA | Update when production routes change |
| `golden-baseline.json` | QA lead | Re-pin after release or audit sprint |
| `axe-core` dependency updates | Tool maintainer | Monthly or on security advisory |
| History pruning | Automated (retention policy) | Continuous |

---

## 15. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| Unstable selectors cause diff noise | High | Medium | Normalizer v1 in Week 2; golden baseline review process; v2 snippet hashing |
| axe rule changes on upgrade | Medium | Medium | Pin axe version; CHANGELOG; baseline re-pin procedure |
| SPA content not loaded in time | Medium | High | Configurable wait strategies; per-URL overrides |
| Production content differs between runs (A/B, CMS) | Medium | Medium | Flake policy; golden baseline review; per-URL wait overrides |
| Teams expect full WCAG coverage | Low | Medium | Document automated vs manual testing limits in README |
| Baseline captured at different WCAG level than current scan | Medium | Medium | Enforce level match before diff; exit `2` with re-pin instructions |
| Screenshot capture failures (shadow DOM, iframes, stale selectors) | Medium | Low | Mark `screenshotStatus: unavailable`; fall back to selector + HTML snippet |
| Large history folders when screenshots enabled | Medium | Medium | Opt-in `--screenshots`; off by default in `--ci`; retention prunes PNGs |
| "Spider" name implies crawling | Low | Low | Rename to "URL scanner" in docs; crawling is v2 |

---

## 16. Final Deliverables (Day 25)

At project completion, Engineering and QA teams receive:

| Deliverable | Description |
| :--- | :--- |
| **CLI tool** | `npm run a11y-spider` with `scan`, baseline management, and `--level` (`A`, `AA`, `AAA`) |
| **Zero hosting footprint** | No servers, no cloud scanning subscription, no third-party URL submission |
| **HTML + JSON reports** | New / resolved / legacy / failed URL sections |
| **CI-ready exit codes** | Gate builds on new regressions against golden baseline |
| **Documentation** | README (install, `urls.txt`, first run, CI), `.env.example`, CHANGELOG |
| **Test suite** | Unit + integration tests for diff engine and scan fixtures |
| **CI example** | GitHub Actions workflow snippet |

### Report Categories

| Icon | Category | Definition |
| :--- | :--- | :--- |
| 🔴 | **Introduced regressions** | Violations whose signature is absent from the chosen baseline |
| 🟢 | **Resolved** | Baseline violations no longer present in current scan |
| ⚪ | **Legacy unchanged** | Known violations present in both baseline and current scan |
| ⚫ | **Failed URLs** | Pages that could not be scanned (network, DNS, timeout) |

---

## 17. v2 Roadmap (Post-MVP)

1. Link crawling with depth/scope configuration
2. **Violation screenshots** (`--screenshots`) — see §17.1
3. Parallel scan execution (configurable concurrency)
4. SARIF export for security/compliance pipelines
5. PR baseline comparison (diff feature branch vs `main` golden)
6. Advanced selector stability (snippet hash fallback)
7. SQLite option for multi-run analytics and trending dashboards
8. Internal npm package for cross-repository adoption
9. Authenticated environments (SSO, storage state) for teams that need non-public URLs

### 17.1 Violation Screenshot Capture (v2)

axe-core does **not** include screenshots in its standard JSON output. v2 adds an **optional post-scan step** using Playwright to capture visual evidence of failing elements and store it under `./history/` alongside each scan.

#### Why v2, not v1

| Factor | Assessment |
| :--- | :--- |
| Implementation | Moderate — custom logic on top of axe, not a core engine change |
| Edge cases | Selectors can fail for shadow DOM, iframes, hidden or unmounted nodes |
| Performance | Extra time per violation; larger disk and CI artifact footprint |
| Value | High for QA/dev triage, but not required for regression diffing |

Estimated effort: **2–4 days** as an opt-in feature with graceful fallback.

#### CLI & configuration

```bash
# Enable screenshots for a local scan
npm run a11y-spider -- scan --baseline golden --screenshots

# CI: screenshots off by default (artifact size)
npm run a11y-spider -- scan --baseline golden --fail-on new --ci
```

| Setting | Default | Notes |
| :--- | :--- | :--- |
| `--screenshots` | `off` | Enable per-run PNG capture |
| `SCREENSHOTS` (`.env`) | `false` | Env override for local defaults |
| `--ci` | screenshots off | Even if `SCREENSHOTS=true`, CI mode disables unless `--screenshots` passed explicitly |

#### Storage layout

Screenshots live **only under `history/`**, inside a per-run folder — not in `golden-baseline.json`.

```
history/
├── scan_2026-07-03T120000Z/
│   ├── scan.json
│   └── screenshots/
│       ├── www-example-com-dashboard__color-contrast__0.png
│       └── www-example-com-products__button-name__0.png
└── golden-baseline.json    # JSON only — no screenshots
```

Retention policy (§8.3) deletes the entire `scan_<runId>/` folder — JSON and screenshots together.

#### Capture workflow

1. Run axe audit per URL (unchanged).
2. For each violation node, read axe `target` selector array.
3. Locate element via Playwright `page.locator()`.
4. Optionally outline/highlight the element (red border).
5. Capture PNG:
   - **Preferred:** element screenshot (`locator.screenshot()`)
   - **Fallback:** full-page screenshot if element is not found or not visible
6. Write relative path into `scan.json`; set `screenshotStatus`.

#### Violation JSON fields (v2)

```json
{
  "ruleId": "color-contrast",
  "target": ["#main", ".card-title"],
  "html": "<h2 class=\"card-title\">Account summary</h2>",
  "failureSummary": "Fix any of the following...",
  "screenshot": "screenshots/www-example-com-dashboard__color-contrast__0.png",
  "screenshotStatus": "ok"
}
```

| `screenshotStatus` | Meaning |
| :--- | :--- |
| `ok` | PNG captured and linked |
| `unavailable` | Element not found, hidden, or in inaccessible iframe/shadow root |
| `skipped` | `--screenshots` not enabled |

#### HTML report integration

- `report.html` for the latest run references images from the corresponding `history/scan_<runId>/screenshots/` folder.
- Violation cards show a thumbnail when `screenshotStatus` is `ok`; otherwise display selector + `html` snippet only.
- Broken image links are never rendered — fallback to text-only card.

#### Scope limits (v2)

- No screenshots stored in `golden-baseline.json` (diff reference only).
- No per-violation video capture.
- No automatic upload to external storage (local/CI artifacts only).
- Screenshots are git-ignored with `./history/`.

---

## Appendix A: Comparison with Alternatives

| Tool | Why not sufficient alone |
| :--- | :--- |
| axe DevTools extension | No batch, no history, no CI |
| Lighthouse CI | Broader perf focus; less flexible diff control for a11y-only regression |
| Pa11y CI | Viable alternative; this proposal adds custom golden-baseline workflow and WCAG level selection |
| Cloud scanners (e.g. Siteimprove) | Subscription cost; less control over diff and baseline workflow |

This tool fills the gap: **local, batch, diff-aware, CI-gatable a11y regression tracking** against **production URLs**.

---

## Appendix B: Glossary

| Term | Definition |
| :--- | :--- |
| **Baseline** | A saved scan snapshot used as the reference for diffing |
| **Compliance level** | WCAG 2.2 conformance target for a scan: `A`, `AA`, or `AAA`; maps to a cumulative axe-core tag preset |
| **Golden baseline** | A deliberately pinned baseline representing accepted release state; a single scan snapshot, not a merge of all past runs |
| **Production URL** | A publicly accessible HTTPS endpoint; the only supported scan target in v1 |
| **Screenshot (v2)** | Optional PNG of a failing element; stored under `history/<runId>/screenshots/` |
| **Signature** | Unique identifier for a violation: URL + ruleId + normalized target |
| **Violation** | axe-core result with `impact` of serious or critical (configurable) |
