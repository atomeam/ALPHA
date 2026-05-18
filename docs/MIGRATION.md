# Migration — repos → Alpha monorepo

Source repos:

- [`atomeam/Aether`](https://github.com/atomeam/Aether) — TS, Vite/Express, Nexus Gateway, MCP, Neural Bridge.
- [`atomeam/HomeBase-`](https://github.com/atomeam/HomeBase-) — JS/TS, Vite/Express, Alpha loop (Curator/Applier), 8 prompt endpoints.
- [`atomeam/atomarcade-bridge`](https://github.com/atomeam/atomarcade-bridge) — PowerShell, Notion command bus, RetroArch UDP.
- [`atomeam/Broke`](https://github.com/atomeam/Broke) — empty.
- [`atomeam/Crypto-Cryptids`](https://github.com/atomeam/Crypto-Cryptids) — Python RPG game scaffold.

## File-by-file map

| From                                          | To                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `Aether/server.ts`                            | `apps/backend/src/{server.ts, routes/nexus.ts, mcp/, neural-bridge/}`        |
| `Aether/src/App.tsx`                          | `apps/frontend/src/operator/`                                                |
| `Aether/src/components/Primitives.tsx`        | `packages/ui/src/Primitives.tsx`                                             |
| `Aether/src/lib/utils.ts`                     | `apps/frontend/src/lib/utils.ts`                                             |
| `Aether/bridge_protocol.ps1`                  | `apps/bridge/scripts/bridge_protocol.ps1`                                    |
| `Aether/.env.example`                         | merged into root `.env.example`                                              |
| `HomeBase-/server.js`                         | rewritten to TS in `apps/backend/src/server.ts`                              |
| `HomeBase-/src/alpha/*`                       | `packages/alpha-core/src/*`                                                  |
| `HomeBase-/src/alpha/*.test.ts`               | `apps/backend/tests/alpha/*.test.ts`                                         |
| `HomeBase-/src/App.tsx`                       | `apps/frontend/src/home/`                                                    |
| `HomeBase-/ALPHA.md` + `docs/`                | `docs/`                                                                      |
| `HomeBase-/mini/`                             | **retired** (frontend stays clean)                                           |
| `HomeBase-/install.ps1`                       | `apps/bridge/scripts/install-homebase.ps1`                                   |
| `HomeBase-/.env.example`                      | merged into root `.env.example`                                              |
| `atomarcade-bridge/homebase.ps1`              | `apps/bridge/homebase.ps1` with `Tick-NotionPoller` removed and port `:8090` |
| `atomarcade-bridge/handlers/*`                | `apps/bridge/handlers/*`                                                     |
| `atomarcade-bridge/schemas/*`                 | `apps/bridge/schemas/` + referenced from `packages/alpha-core`               |
| `atomarcade-bridge/mappings/*`                | `apps/bridge/mappings/` (used by on-demand sync, not by a poller)            |
| `atomarcade-bridge/tools/*.ps1`               | `apps/bridge/scripts/*.ps1`                                                  |
| `atomarcade-bridge/viktor/`, `viktor-worker/` | `apps/bridge/viktor/` (loop becomes one-shot)                                |
| `atomarcade-bridge/sentry_smoke.py`           | `apps/bridge/scripts/sentry_smoke.py` (DSN → env var)                        |
| `atomarcade-bridge/requirements.txt`          | `apps/bridge/requirements.txt`                                               |
| `atomarcade-bridge/docs/*`                    | `apps/bridge/docs/*`                                                         |
| `Broke/`                                      | `archive/broke/`                                                             |
| `Crypto-Cryptids/*`                           | `apps/crypto-cryptids/*` (zero runtime coupling)                             |

## Phase plan

| Phase | Scope                                                                                                        | Status                    |
| ----- | ------------------------------------------------------------------------------------------------------------ | ------------------------- |
| 0     | Skeleton: workspace + tooling + CI + hooks. No app code.                                                     | **in progress (this PR)** |
| 1     | Backend cutover: HomeBase `server.js` → `apps/backend/src/server.ts`; alpha modules → `packages/alpha-core`. | pending                   |
| 2     | Frontend cutover: HomeBase `App.tsx` → `apps/frontend/src/home/` on `:5173`.                                 | pending                   |
| 3     | Aether merge: Nexus/MCP/Neural-Bridge → `apps/backend`; `App.tsx` → `apps/frontend/src/operator/`.           | pending                   |
| 4     | Trust kernel: `packages/permissions` + Grant management UI.                                                  | pending                   |
| 5     | Integrations scaffold: typed clients + scopes for all 10 providers.                                          | pending                   |
| 6     | Bridge refactor: port to `:8090`; webhook receiver + "Sync Now" button ship **alongside** existing poller.   | pending                   |
| 6a    | Poller flipped off by default.                                                                               | pending                   |
| 6b    | Poller deleted after one operator review cycle.                                                              | pending                   |
| 7     | Curator hardening: extend with bridge policy table; wire cosign UI + snapshot store.                         | pending                   |
| 8     | Game side-car: `Crypto-Cryptids/*` → `apps/crypto-cryptids/`.                                                | pending                   |
| 9     | Archive + retire: `Broke` → `archive/`; old repos read-only.                                                 | pending                   |

## Port map

| Service         | Port         | Notes                                                                  |
| --------------- | ------------ | ---------------------------------------------------------------------- |
| `apps/backend`  | `:8080`      | Node/Express. Owns the canonical HTTP surface.                         |
| `apps/frontend` | `:5173`      | Vite dev server. Proxies `/api/*` → `:8080`.                           |
| `apps/bridge`   | `:8090`      | PowerShell HTTP listener. Previously bound `:8080`; freed for backend. |
| RetroArch       | `:55355` UDP | Controlled by `apps/bridge` only.                                      |

## Risk-tagged changes

- **Port flip on bridge.** Any existing consumer hitting `http://localhost:8080` against the PowerShell side breaks. Mitigation: document in `apps/bridge/README.md` once Phase 6 lands; provide a one-line `BRIDGE_PORT=8080` env override for the cutover window.
- **Notion poller retirement.** Workflows that rely on auto-execution of `Status=Pending` rows pause for one operator review cycle (Phase 6 → 6b). Mitigation: webhook + "Sync Now" ship first; operator decides when to flip the poller off.
- **Sentry DSN move.** Hardcoded DSN in `sentry_smoke.py` is removed. Mitigation: `SENTRY_DSN` env var documented in `.env.example` from Phase 0.
