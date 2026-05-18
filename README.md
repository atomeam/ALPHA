# Aether - ALPHA Stack Monorepo

This is the ALPHA Stack monorepo with npm workspaces.

## Quick Start

```powershell
# Windows PowerShell
# Navigate to your project folder first:
cd C:\Path\To\Aether

# Then run:
npm run dev
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
