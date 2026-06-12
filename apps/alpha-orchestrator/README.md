# ALPHA Orchestrator Worker

HTTP interface to the OrchestrationBrain Durable Object. Handles agent registration, state transitions, and system queries.

## Architecture

```
Agent → alpha-orchestrator → OrchestrationBrain (DO)
                              │
                              ├── /state — Get current state
                              ├── /transition — OCC-verified state change
                              ├── /lock — Lock management
                              ├── /agents — Agent state queries
                              └── /health — System health check
```

## API Endpoints

| Endpoint                       | Method | Purpose                                      |
| ------------------------------ | ------ | -------------------------------------------- |
| `/health`                      | GET    | Health check with brain status               |
| `/transition`                  | POST   | Submit agent state transition (OCC verified) |
| `/agents`                      | GET    | List all agent states                        |
| `/agents?id=<id>`              | GET    | Get specific agent state                     |
| `/lock?action=status&id=<id>`  | GET    | Check lock status                            |
| `/lock?action=release&id=<id>` | POST   | Release a lock                               |

## Transition Event Format

```typescript
{
  eventId: "evt-001",
  correlationId: "task-123",
  timestamp: 1716456000000,
  sourceAgent: "copilot",
  transition: {
    fromState: "idle",
    toState: "running",
    actionPerformed: "interpret-intent"
  },
  budget: {
    tokensUsed: 500,
    executionTimeMs: 1200
  },
  payload: {
    spec: "deployment spec...",
    context: { /* ... */ }
  }
}
```

## Response Codes

| Code | Meaning                              |
| ---- | ------------------------------------ |
| 200  | Success                              |
| 400  | Invalid payload                      |
| 404  | Agent not found                      |
| 409  | Lock conflict                        |
| 412  | Stale state revision (OCC violation) |
| 500  | Internal error                       |

## Development

```bash
cd apps/alpha-orchestrator
pnpm install
pnpm dev    # Local dev on :8788
pnpm deploy # Deploy to Cloudflare
```

## Related Docs

- `/workspace/project/ALPHA/docs/ALPHA-BEHAVIORAL-CONTRACT.md`
- `/workspace/project/ALPHA/packages/alpha-core/src/orchestration-brain.ts`
