# 1. OBJECTIVE

Build the integrated Aether monorepo application locally in this workspace. Install dependencies and compile the TypeScript backend, frontend, and bridge apps, then prepare them to run concurrently.

# 2. CONTEXT SUMMARY

- **Project:** Aether monorepo at `/workspace/project/Aether`
- **Workspaces:**
  - `@aether/backend` - Express server (port 8080)
  - `@aether/frontend` - Vite + React app (port 5173)
  - `@aether/bridge` - Bridge service
- **Available Scripts:** `npm run dev --workspaces --parallel` runs all apps concurrently
- **Goal:** Install all dependencies, compile TypeScript, and prepare services to run

# 3. APPROACH OVERVIEW

1. First install root dependencies already present in node_modules
2. Install dependencies for each workspace (backend, frontend, bridge)
3. Compile TypeScript for all apps using their build scripts
4. Start all services concurrently using npm workspaces

# 4. IMPLEMENTATION STEPS

## Step 1: Verify Node.js and npm Availability

**Goal:** Confirm Node.js runtime is available
**Method:** Run `node --version` and `npm --version` to verify environment
**Reference:** System environment

## Step 2: Install Workspace Dependencies

**Goal:** Install dependencies for all three workspaces
**Method:** Run `npm install` at root - npm workspaces will install all workspace packages
**Reference:** package.json workspaces config

## Step 3: Compile TypeScript Backend

**Goal:** Build the backend TypeScript code
**Method:** Run `npm run build -w @aether/backend` to compile backend
**Reference:** apps/backend/

## Step 4: Compile Frontend

**Goal:** Build the frontend React application
**Method:** Run `npm run build -w @aether/frontend` to compile frontend assets
**Reference:** apps/frontend/

## Step 5: Verify Bridge Compilation

**Goal:** Verify bridge workspace (no build script available)
**Method:** Bridge has no `build` script - only `dev` and `start`. It can be run directly via `npm run dev -w @aether/bridge`
**Reference:** apps/bridge/

## Step 6: Start Development Servers

**Goal:** Launch all services concurrently
**Method:** Run `npm run dev --workspaces --parallel` to start all apps
- Frontend: http://localhost:5173
- Backend: http://localhost:8080
- Bridge: Runs on its configured port

# 5. TESTING AND VALIDATION

- **Backend health:** Confirm Express server responds on port 8080
- **Frontend:** Verify Vite serves React app on port 5173
- **All services running:** Use `npm run dev` output to confirm all three workspaces started without errors
- **API proxy:** Frontend should be able to proxy /api requests to backend
