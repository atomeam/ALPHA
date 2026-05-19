# Aether - ALPHA Stack Monorepo

## Project State (Updated 2026-05-19)

### 🚀 Vercel Deployment (BLOCKED - needs manual retry)

| Commit | Fix |
|--------|-----|
| `115d36d` | package.json uses `file:../packages/*` |
| `ebb0530` | Regenerated lockfile with file references |

**Problem**: npm workspaces can't resolve `@aether/*` packages on Vercel (404 error)
**Solution**: Use `file:` dependency links (pushed, waiting for user to deploy)

---

### 🤖 Two-Agent System (DONE)

```
User Request → Curator (validates) → APPROVED → Executor (runs tools) → Ledger
                                      → REJECTED → 422 error
```

**Implemented**:
1. ✅ MCP Tool Registry (`packages/mcp-tools`)
   - `file_read`, `file_write`
   - `git_status`, `git_commit`
   - `http_request` (GET/HEAD only)
2. ✅ Executor Agent (`apps/backend/src/agents/executor.ts`)
3. ✅ Evaluator Agent (`apps/backend/src/agents/evaluator.ts`)
4. ✅ API endpoints:
   - `GET /api/agents` — Agent health
   - `GET /api/agents/evaluate` — Ledger pattern suggestions

## Quick Start

```bash
cd Aether
npm install
npm run dev:backend  # Terminal 1 - port 3000
npm run dev:frontend  # Terminal 2 - port 5173
```

Then open http://localhost:5173

## Workspace Structure

```
aether/
├── apps/
│   ├── backend/        # @aether/backend (port 3000)
│   ├── frontend/     # @aether/frontend (port 5173)
│   └── bridge/      # @aether/bridge
├── packages/
│   ├── contracts/   # Zod schemas for FE↔BE↔Bridge
│   └── curator/    # Default-deny security gate
├── frontend.legacy/  # DEPRECATED - do not use
└── tests/         # Integration tests
```

## Packages

### @aether/contracts
Shared Zod schemas for boundary validation:
- `BuildRequestSchema` - Frontend → Backend prompt payload
- `ComponentSchema` - UI component shapes
- `BuildResponseSchema` - Backend → Frontend response
- `ComponentActionSchema` - ADD/REMOVE/MODIFY actions

### @aether/curator
Default-deny security gate for generated UI:
- Allow-list: `['stat', 'chart', 'list', 'status', 'gauge']`
- Rate limit: max 10 actions per response
- Returns 422 on denial

## Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/build` | POST | Generate UI components |
| `/api/test/curator` | POST | Direct curator test |
| `/api/stack` | GET | Backend health |
| `/api/nexus/*` | * | Integration proxy |

## Environment Variables

```bash
GEMINI_API_KEY=...  # Required for /api/build
```

## Testing

```bash
npm run test -w @aether/contracts
npm run test -w @aether/curator

# Or via Turbo
npx turbo run test
npx turbo run typecheck
npx turbo run build
```

## Turborepo

The monorepo uses Turborepo for build orchestration. Pipeline defined in `turbo.json`:

- **test** - runs vitest in packages
- **typecheck** - runs tsc --noEmit  
- **build** - builds packages with dependencies
- **dev** - runs in parallel with no cache

```bash
# Run full pipeline
npx turbo run test typecheck build
```

## Deprecation Notes

- Root `server.ts` - DEPRECATED. Use `npm run dev:backend`
- `src/server.ts` - DEPRECATED. Use `npm run dev:backend`
- `frontend.legacy/` - Old frontend. Use `apps/frontend/`