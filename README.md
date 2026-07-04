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
npm run dev -- scan --urls urls.txt
```

## Documentation

- [Technical proposal](./A11y_Spider_Proposal_v2.md)
- [Agent implementation guide](./AGENTS.md)

## Status

v0.1.0 — project scaffold. Scan, diff, and report pipelines are not yet implemented.
