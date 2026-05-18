---
name: testing-alpha
description: How to smoke-test the ALPHA monorepo (backend, frontend, bridge) locally.
---

# Testing ALPHA Locally

## Prerequisites

```bash
pnpm install
pnpm build   # required so packages exporting from dist/ resolve
```

## Start Services

Run each in a separate shell from the repo root:

```bash
# Backend on :8080
cd apps/backend && node --import tsx src/server.ts

# Frontend on :5173 (Vite dev server)
pnpm dev --filter @alpha/frontend

# Bridge on :8090
cd apps/bridge && node --import tsx src/server.ts
```

## Shell Smoke Tests

| Endpoint | Method | Expected |
|----------|--------|----------|
| `localhost:8080/api/health` | GET | `{"status":"ok","service":"alpha-backend",...}` |
| `localhost:5173/api/health` | GET | Same as above (Vite proxy) |
| `localhost:8090/health` | GET | `{"status":"ok","service":"alpha-bridge",...}` |
| `localhost:8090/relay/health` | GET | Backend health proxied through bridge |
| `localhost:8090/relay/prompt/unknown` | POST | 404 with `{"error":"unknown prompt"}` |

## Browser UI Tests (localhost:5173)

1. **Page renders**: Building banner at top, HOMEBASE button center, footer status bar
2. **Click counter**: Click button → counter increments in footer
3. **localStorage**: Counter persists across page refresh
4. **Space key**: Pressing space increments counter (same as click)
5. **Double-click reset**: Double-click the CLICKS label in footer → resets to 0
6. **Bridge status dot**: Green when backend healthy, red when backend down
7. **Idle animation**: Button pulses after 10s of inactivity
8. **Backend down recovery**: Kill backend → status goes red/offline. Restart → auto-recovers on next 15s poll.

## Known Quirks

- Health polls every 15s — wait at least one cycle to see status changes
- `pnpm build` must run before `pnpm typecheck` because some packages (nexus-core, mcp-core, permissions) export from `dist/`
- Bridge ESLint is skipped until Phase 6
- Port 8080 can remain occupied after killing backend; use `ss -tlnp | grep 8080` to find the PID
