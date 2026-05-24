# @aether/env

Environment schema validation for Aether apps.

## Usage

### Backend

```ts
import { parseEnv, BackendEnvSchema } from "@aether/env"
const env = parseEnv(BackendEnvSchema, process.env, "backend")
```

### Frontend

⚠️ Only `VITE_*` variables are inlined into the client bundle. Never put secrets in `VITE_*` variables.

```ts
import { env } from "./env" // wraps parseEnv for import.meta.env
```

## Schemas

- `BackendEnvSchema` — requires `GEMINI_API_KEY`, `PORT` (default 3000)
- `BridgeEnvSchema` — requires `BRIDGE_PORT` (default 4000)  
- `FrontendEnvSchema` — requires `VITE_API_URL`

## Files

- `apps/backend/.env.example` — maps to BackendEnvSchema
- `apps/frontend/.env.example` — maps to FrontendEnvSchema