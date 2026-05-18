# ALPHA

Alpha — consolidated AtoMind ecosystem (backend `:8080`, frontend `:5173`,
trust-first integration routing).

> **Status:** Phase 0 — skeleton only. No application code yet. The
> workspace is intentionally empty so it can build clean while we land
> the structural contracts.

## Layout

```
.
├── apps/                # Deployable applications
│   ├── backend/         # API + trust kernel host (port 8080)
│   └── frontend/        # Vite UI (port 5173)
├── packages/            # Internal libraries
│   ├── alpha-core/      # Runtime kernel + shared primitives
│   ├── permissions/     # Trust kernel + grants (see docs/TRUST.md)
│   ├── logger/          # Structured logging
│   └── ui/              # Shared UI components
├── integrations/        # One folder per external integration
├── archive/             # Frozen / migrated-from artifacts
└── docs/                # Architecture docs (see docs/TRUST.md)
```

## Requirements

- Node `>=22` (see `.nvmrc`)
- pnpm `9.15.1` (pinned via `packageManager`)

## Getting started

```bash
# Install workspace dependencies
pnpm install

# Build everything (no-op until packages land)
pnpm build

# Type-check, lint, and test (no-op until packages land)
pnpm typecheck
pnpm lint
pnpm test
```

Copy `.env.example` to `.env` and fill in real values before running any
app. Real `.env` files are git-ignored.

## Trust model

Alpha is trust-first: every cross-boundary action is routed through a
single explicit-request trust kernel. The kernel, the grant models, and
the routing contract are defined in [`docs/TRUST.md`](./docs/TRUST.md).
Read that document before adding any new integration or app.
