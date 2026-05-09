# Contributing

Thanks for taking the time to contribute to the Govex Futarchy SDK.

## Prerequisites

- Node.js >= 18
- npm (recommended) or pnpm

## Development Setup

```bash
npm ci
```

## Common Commands

```bash
# Type-check
npm run type-check

# Build
npm run build

# Watch build
npm run dev
```

## Pull Requests

- Keep PRs focused and small when possible.
- Run `npm run type-check` and `npm run build` before opening a PR.
- If you change any public API, update documentation under `docs/`.

## Repo Structure

- `src/`: SDK source
- `dist/`: build output (generated)
- `docs/`: usage guides and reference documentation

