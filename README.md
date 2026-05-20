# Aether - ALPHA Stack Monorepo

This is the ALPHA Stack monorepo with npm workspaces.

## Quick Start

```bash
# Clone and install
cd Aether
npm install
npm run dev
```

## Two Terminals Required

### Terminal 1 (Backend)

```bash
npm run dev:backend
```

### Terminal 2 (Frontend)

```bash
npm run dev:frontend
```

### Then open in browser

```
http://localhost:5173
```

## Project Structure

```text
aether/
├── apps/
│   ├── backend/    # @aether/backend (port 3000)
│   ├── frontend/  # @aether/frontend (port 5173)
│   └── bridge/    # @aether/bridge
├── packages/      # Shared packages
├── turbo.json    # Turborepo configuration
└── package.json  # Root with workspaces config
```

## Scripts

| Script | Description |
|--------|-----------|
| `npm run dev` | Run all dev servers |
| `npm run dev:backend` | Start backend on port 3000 |
| `npm run dev:frontend` | Start frontend on port 5173 |
| `npm run build` | Build all packages |
| `npm run test` | Run tests |
