# Aether - ALPHA Stack Monorepo

This is the ALPHA Stack monorepo with npm workspaces.

## Quick Start

```powershell
# Windows PowerShell
cd Aether
npm install
npm run dev
```

## Two Terminals Required

**Terminal 1 (Backend):**
```powershell
npm run dev:backend
```

**Terminal 2 (Frontend):**
```powershell
npm run dev:frontend
```

## Then open in browser:
```
http://localhost:5173
```

## Project Structure

```
aether/
├── apps/
│   ├── backend/    # @aether/backend (port 3000)
│   ├── frontend/   # @aether/frontend (port 5173)
│   └── bridge/    # @aether/bridge
├── package.json   # Root with workspaces config
```
