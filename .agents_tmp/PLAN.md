# 1. OBJECTIVE

Help sync local ALPHA environment: pull fresh code from repository, set up Vite frontend on port 5173 with API proxy to backend on port 8080.

# 2. CONTEXT SUMMARY

- **Local Project:** ALPHA at `C:\Users\adamm\ALPHA`
- **Backend:** Already has Express server in `apps/backend/src/server.ts` (port 8080)
- **Frontend:** Empty in `apps/frontend/` - needs Vite + React
- **Goal:** Frontend on 5173 → proxies /api to backend on 8080

# 3. APPROACH

1. First sync: pull latest backend code
2. Create Vite + React frontend in apps/frontend/
3. Configure vite.config.ts with port 5173 + /api proxy to http://localhost:8080

# 4. IMPLEMENTATION STEPS

## Step 1: Sync Backend Code

**Goal:** Get latest backend from repo
**Method:** cd ALPHA, git pull, npm install

## Step 2: Create Frontend Structure

**Method:**
- Create apps/frontend/index.html
- Create apps/frontend/vite.config.ts (port 5173, proxy to 8080)
- Create main.tsx, App.tsx entry points

## Step 3: Configure API Proxy

vite.config.ts:
```typescript
server: { port: 5173 },
proxy: {
  '/api': 'http://localhost:8080'
}
```

## Step 4: Run Both

- Backend: npm run dev (8080)
- Frontend: cd apps/frontend && npm run dev (5173)

# 5. TESTING

- Backend responds at http://localhost:8080/api/health
- Frontend fetches /api/* via proxy to backend
