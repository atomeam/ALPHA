# Homebase — AI Empire Cockpit

The operational dashboard for the AI empire. A single Cloudflare Worker serving as the central command center for all crew members, systems, and state.

## Purpose

Homebase provides a unified view of:
- **Crew Panel** — Live status of all 11 empire members
- **Mission Panel** — Current objectives, backlog, now playing
- **System Panel** — Worker health, DO class, queue depth readouts  
- **Event Stream** — Heartbeat feed of all actions
- **Orchestration Panel** — Multi-agent workflow status

## Architecture

**v0.7 — Council of 11 with Service Binding**

```
Homebase Worker ──[Service Binding]──→ self-adaptive-app
                    │
                    ├── Fetches /api/health
                    ├── Fetches /api/state  
                    └── Fetches /api/metrics
                              │
                              ├── AssessmentBrain (Durable Object)
                              ├── adaptive-actions (Queue)
                              └── f3171ead... (KV)
```

## Stack

- Cloudflare Workers
- Service Bindings (inter-Worker communication)
- KV Namespace (state persistence)
- Queues (action processing)
- TypeScript

## Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `ADAPTIVE` | Service | self-adaptive-app Worker |
| `STATE` | KV | Persist crew state |
| `ACTIONS` | Queue | Action processing |

## Crew (11 Members)

1. Adam — Founder / Operator
2. Copilot — Interpreter / Strategist
3. Perplexity — Researcher / Analyst
4. Gemini — Technical Co-Pilot / Code Architect
5. OpenHands — Sandbox Executor / Developer
6. Agent #8 — Systems Consultant / Architect
7. Cloudflare — Infrastructure / Spine
8. Notion — Organiser / State Keeper
9. DeepSeek — Builder / Patch Engineer (pending)
10. o1/o3 — Deep Reasoning / Logic Gate (pending)
11. LangGraph — Multi-Agent Orchestrator (pending)

## Development

```bash
cd apps/homebase
pnpm install
pnpm dev    # Local dev server on :8787
pnpm deploy # Deploy to Cloudflare
```

## Version History

- **v0.7** — Council of 11, Orchestration panel added, wired to self-adaptive-app
- **v0.2** — Service Binding to self-adaptive-app added
- **v0.1** — Initial dashboard with 4 panels
