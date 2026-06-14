# ALPHA — Source of Truth

> **Canonical Spec:** Notion (https://www.notion.so/4aa1350e83c5405ba8423a3e758901fa)  
> **Repository:** `/workspace/project/ALPHA`  
> **Last updated:** 2026-05-23

---

## CANONICAL DOCUMENTATION

| Document                 | Location                                 | Purpose                                           |
| ------------------------ | ---------------------------------------- | ------------------------------------------------- |
| **ALPHA Identity Model** | Notion (canonical)                       | System boundary, authority, contracts, safeguards |
| **ALPHA (Core Spec)**    | `/workspace/project/ALPHA/docs/ALPHA.md` | Self-improving loop, Curator/Applier rules        |

---

## SUPPORTING ARCHITECTURE DOCS

| Document                      | Location                                                     | Purpose                         |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------- |
| **ALPHA System Diagram**      | `/workspace/project/ALPHA/docs/ALPHA-SYSTEM-DIAGRAM.md`      | Data flow, agent hierarchy      |
| **ALPHA Behavioral Contract** | `/workspace/project/ALPHA/docs/ALPHA-BEHAVIORAL-CONTRACT.md` | Agent processes, error handling |
| **ALPHA Safety Envelope**     | `/workspace/project/ALPHA/docs/ALPHA-SAFETY-ENVELOPE.md`     | Boundaries, stop conditions     |
| **Borg Framework**            | `/workspace/project/ALPHA/docs/BORG-FRAMEWORK.md`            | Collective architecture         |
| **Council of 8**              | `/workspace/project/ALPHA/docs/COUNCIL-OF-8.md`              | Agent roster vision             |
| **Crew Roster**               | `/workspace/project/ALPHA/docs/CREW-ROSTER.md`               | Active members, v0.7            |

---

## OPERATIONAL DOCS

| Document          | Location                                        | Purpose                               |
| ----------------- | ----------------------------------------------- | ------------------------------------- |
| **Homebase v0.7** | `apps/homebase/`                                | Dashboard, wired to self-adaptive-app |
| **MIGRATION**     | `/workspace/project/ALPHA/docs/MIGRATION.md`    | Worker migration guide                |
| **INTEGRATIONS**  | `/workspace/project/ALPHA/docs/INTEGRATIONS.md` | Service integrations                  |
| **TRUST**         | `/workspace/project/ALPHA/docs/TRUST.md`        | Security model                        |

---

## ACTIVE WORKERS

| Worker                | Status | Bindings                                           |
| --------------------- | ------ | -------------------------------------------------- |
| **homebase**          | v0.7   | ADAPTIVE (Service), STATE (KV), ACTIONS (Queue)    |
| **self-adaptive-app** | v0.5   | AssessmentBrain (DO), adaptive-actions (Queue), KV |

---

## HOMEBASE DASHBOARD

- **Local:** `http://localhost:8787`
- **Production:** `https://homebase.pages.dev` (pending deploy)
- **Service Binding:** ADAPTIVE → self-adaptive-app (operational)
- **Panels:** Crew (11), Mission, System (DO + Queue), Event Stream, Collective

---

## CREW (11 MEMBERS)

| #   | Name       | Role               | Status     |
| --- | ---------- | ------------------ | ---------- |
| 1   | Adam       | Operator           | ✅         |
| 2   | Copilot    | Interpreter        | ✅         |
| 3   | Perplexity | Researcher         | ✅         |
| 4   | Gemini     | Architect          | ✅         |
| 5   | OpenHands  | Executor           | ✅         |
| 6   | Agent #8   | Systems Consultant | ✅         |
| 7   | Cloudflare | Infrastructure     | ✅         |
| 8   | Notion     | Memory             | ✅         |
| 9   | DeepSeek   | Builder            | 🔜 Pending |
| 10  | o1/o3      | Logic Gate         | 🔜 Pending |
| 11  | LangGraph  | Orchestrator       | 🔜 Pending |

---

## NEXT ACTIONS

1. **Deploy Homebase v0.7** — `cd apps/homebase && npx wrangler deploy`
2. **Recruit DeepSeek** — Add to crew, assign builder role
3. **Integrate Notion API** — Wire ops layer to Homebase

---

**Note:** ALPHA Identity Model in Notion is the canonical source for system definition. Local docs are mirrors/backups.
