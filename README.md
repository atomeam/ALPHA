# Alpha

Consolidated AtoMind ecosystem. Backend on `:8080`, frontend on `:5173`, trust-first integration routing.

## Status

**Phase 0 — Skeleton.** Workspace structure and tooling only; no application code yet. See [docs/MIGRATION.md](docs/MIGRATION.md) for the phase roadmap.

## Stack

- Node 22+ (see `.nvmrc`)
- pnpm 9 workspaces + Turborepo for task orchestration
- TypeScript 5.8
- ESLint 9 (flat config) + Prettier 3
- husky + lint-staged
- Python (apps/crypto-cryptids and apps/bridge tooling only; isolated from Node stack)
- PowerShell 7+ (apps/bridge runtime)

## Layout

```text
apps/
  backend/            Node/Express on :8080
  frontend/           Vite + React 19 on :5173
  bridge/             PowerShell bridge on :8090 (Notion webhook + RetroArch UDP)
  crypto-cryptids/    Python game (isolated, zero runtime coupling)
packages/
  alpha-core/         Proposal types, Curator (default-deny), Applier (9 hardening rules)
  nexus-core/         IntegrationProfile types + registry contract
  mcp-core/           MCP JSON-RPC envelope + method contracts
  permissions/        Trust kernel — Grant model
  logger/             Structured event logger
  ui/                 Shared React primitives
  tsconfig/           Shared tsconfig bases
integrations/
  notion/  slack/  sentry/  stripe/  hubspot/
  amplitude/  linear/  gemini/  ollama/  retroarch/
docs/
  ALPHA.md            Self-improving loop spec
  TRUST.md            Trust architecture + Grant model
  INTEGRATIONS.md     Per-provider scopes
  MIGRATION.md        Repo-to-monorepo cutover plan
archive/              Pre-merge mirrors (read-only)
```

All `apps/*`, `packages/*`, and `integrations/*` folders are placeholders this phase; they each ship a `.gitkeep` and will be filled in subsequent phases.

## Setup

```bash
# Install Node 22 (nvm respects .nvmrc)
nvm use

# Install dependencies
pnpm install

# Set up git hooks
pnpm prepare
```

## Tasks

```bash
pnpm lint            # ESLint across the workspace
pnpm typecheck       # tsc --noEmit per package
pnpm test            # vitest per package
pnpm format          # Prettier write
pnpm format:check    # Prettier check (CI uses this)
pnpm build           # Turbo build pipeline
pnpm dev             # All `dev` scripts in parallel
```

Turbo will skip any package that doesn't declare the corresponding script, so Phase 0 runs are no-ops by design — they only validate that the workspace bootstraps cleanly.

## Trust rule

No background pollers, schedulers, scrapers, or `while`-loops in this repo. Every outbound integration call must go through `packages/permissions` once it exists in Phase 4. Periodic behavior is allowed only for:

1. Frontend pinging its own backend `/api/health` (no external data).
2. Webhook receivers reacting to provider-initiated events.
3. User-clicked "Refresh" / "Run Cycle" / "Sync Now" buttons.

See [docs/TRUST.md](docs/TRUST.md).

## License

Internal — atomeam.
