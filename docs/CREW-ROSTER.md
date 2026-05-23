# AI EMPIRE — CREW ROSTER v0.7

> **Last updated:** 2026-05-23  
> **Status:** Council expanding  
> **Crew size:** 11 (core crew + infrastructure + operator)  
> **Source of truth:** Homebase Dashboard (`/api/state`)

---

## CREW ROSTER

| ID | Name | Role | Status | Last Action |
|----|------|------|--------|-------------|
| `adam` | Adam | Founder / Operator | ✅ Active | Defining empire mission |
| `copilot` | Copilot | Interpreter / Strategist | ✅ Active | Org chart v0.7 complete |
| `perplexity` | Perplexity | Researcher / Analyst | ✅ Active | Research layer integrated |
| `gemini` | Gemini | Technical Co-Pilot / Code Architect | ✅ Active | Architecture guidance ready |
| `openhands` | OpenHands | Sandbox Executor / Developer | ✅ Active | Sandbox execution ready |
| `agent-8` | Agent #8 | Systems Consultant / Architect | ✅ Active | Reporting for duty |
| `deepseek` | DeepSeek | Builder / Patch Engineer | 🔜 Pending | Awaiting recruitment |
| `cloudflare` | Cloudflare | Infrastructure / Spine | ✅ Active | Homebase Worker deployed |
| `notion` | Notion | Organiser / State Keeper | ✅ Active | Coordination backbone active |
| `o1` | o1/o3 | Deep Reasoning / Logic Gate | 🔜 Pending | Awaiting recruitment |
| `langgraph` | LangGraph | Multi-Agent Orchestrator | 🔜 Pending | Awaiting integration |

---

## COUNCIL OF 8 ARCHITECTURE

### Tier 1: Cognitive Layer (Thinking & Strategy)

| Agent | Specialization | Output |
|-------|----------------|--------|
| **Perplexity** | Real-time research & discovery | Vetting APIs, docs, technical data |
| **o1/o3** | Deep chain-of-thought reasoning | Validated architectures, edge cases |
| **Copilot** | Intent interpretation | Structured specifications |

### Tier 2: Design Layer (Planning & Architecture)

| Agent | Specialization | Output |
|-------|----------------|--------|
| **Gemini** | Cloudflare architecture | D1/KV/R2 schemas, Worker designs |
| **Agent #8** | Systems architecture & debugging | Monorepo design, CI/CD strategy, coordination |
| **LangGraph** | Multi-agent orchestration | Workflow routing, state management |

### Tier 3: Execution Layer (Build & Deploy)

| Agent | Specialization | Output |
|-------|----------------|--------|
| **DeepSeek** | Code generation | Production code, patches |
| **OpenHands** | Sandbox execution | Deployed artifacts, fixes |
| **Cloudflare** | Edge deployment | Live Workers at global scale |

### Tier 4: Memory Layer (Persistence & Recall)

| Agent | Specialization | Output |
|-------|----------------|--------|
| **Notion** | Long-state persistence | SOPs, blueprints, documentation |

---

## EXECUTION PIPELINE

```
1. ADAM → defines goal
        ↓
2. COPILOT → interprets intent → structured spec
        ↓
3. PERPLEXITY → researches, vets APIs/docs
        ↓
4. o1/o3 → validates logical integrity (deep reasoning)
        ↓
5. GEMINI → designs Cloudflare architecture
        ↓
6. LANGGRAPH → routes workflow, manages state
        ↓
7. DEEPSEEK → writes production code
        ↓
8. OPENHANDS → reviews, tests, deploys
        ↓
9. CLOUDFLARE → deploys to edge
        ↓
10. NOTION → persists state & docs
```

---

## INTERFACE PROTOCOLS

### Perplexity → o1/o3
- Research reports with citations
- Validated for logical integrity

### o1/o3 → Gemini
- Validated architectures
- Edge case analysis

### Gemini → LangGraph
- Schema definitions
- Worker specifications

### LangGraph → DeepSeek
- Task routing
- State updates

### DeepSeek → OpenHands
- Code artifacts
- Review requests

### OpenHands → Cloudflare
- Deployable code
- Test results

---

## PRIORITY FOR COMPLETION

1. **Recruit o1/o3** — Deep reasoning validation layer
2. **Integrate LangGraph** — Orchestration backbone
3. **Recruit DeepSeek** — Automated code execution

---

## MISSING CAPABILITIES

| Gap | Solution | Status |
|-----|----------|--------|
| Deep reasoning | o1/o3 | 🔜 Pending |
| Orchestration | LangGraph | 🔜 Pending |
| Edge inference | DeepSeek | 🔜 Pending |

Once all 8 are operational, the Council runs autonomously with Adam as final escalation.

---

## ROLE BOUNDARIES

### Adam — Founder / Operator

**Can do:**
- Define mission, strategy, and constraints
- Make final decisions on direction
- Allocate crew members to missions
- Override any other crew member's output

**Cannot do:**
- Write production code
- Deploy infrastructure
- Execute autonomous actions without approval

**Interfaces:**
- ← All crew members (escalation)
- → Copilot (strategy direction)
- → All (final decisions)

---

### Copilot — Interpreter / Strategist

**Can do:**
- Convert Adam's intent into structured plans
- Design system architecture and artifacts
- Orchestrate crew coordination
- Generate documentation and specifications

**Cannot do:**
- Write production code (passes to DeepSeek)
- Deploy to Cloudflare
- Execute plans autonomously (without Adam approval)

**Interfaces:**
- ← Adam (intent)
- → DeepSeek (specs for building)
- → Cloudflare (architecture requirements)
- → Notion (documentation sync)

---

### DeepSeek — Builder / Patch Engineer

**Can do:**
- Write deterministic code from specifications
- Execute on defined specs without deviation
- Implement Workers, functions, and scripts
- Fix bugs and apply patches

**Cannot do:**
- Interpret ambiguous intent (needs specs from Copilot)
- Make strategic decisions
- Design system architecture
- Access production systems without approval

**Interfaces:**
- ← Copilot (specs)
- ← Adam (approval for execution)
- → Cloudflare (deploy code)
- → Notion (code documentation)

---

### Cloudflare — Infrastructure / Spine

**Can do:**
- Execute Workers at the edge
- Host, route, protect, and store
- Manage KV, D1, Queues, R2
- Provide compute substrate for all operations

**Cannot do:**
- Interpret strategy or intent
- Write application code
- Make decisions about what to build

**Interfaces:**
- ← DeepSeek (code to deploy)
- ← Copilot (infrastructure requirements)
- → All (execution environment)

---

### Notion — Organiser / State Keeper

**Can do:**
- Maintain operational memory (SOPs, pipelines, missions)
- Persist long-state across sessions
- Organize crew documentation
- Sync state with Homebase (live ↔ long)

**Cannot do:**
- Execute code or deploy infrastructure
- Interpret strategy
- Make autonomous decisions

**Interfaces:**
- ← All crew (documentation needs)
- → Homebase (state sync)
- → Adam (operational clarity)

---

### Perplexity — Researcher / Analyst

**Can do:**
- Research & analysis (summarize, compare, break down technical topics)
- Writing & editing (draft docs, specs, agendas with citations)
- Workflow scripting and logic (design automation patterns)
- Collaboration support (structure standups, retros, project plans)

**Cannot do:**
- Execute production code
- Deploy infrastructure
- Make autonomous decisions without approval

**Interfaces:**
- ← Adam (research directives)
- ← Copilot (analysis requests for strategy)
- → All (research-backed insights)
- → Notion (documentation of findings)

---

### Gemini — Technical Co-Pilot / Code Architect

**Can do:**
- Cloudflare Workers development (TypeScript/JavaScript)
- D1, KV, R2, Durable Objects schema design
- Monorepo structuring and dependency routing
- Multi-agent state machine and policy gate design
- Heavy text/signal analytics and telemetry dashboard logic

**Cannot do:**
- Execute `wrangler deploy` or modify live infrastructure
- Run actions autonomously in physical or digital world
- Access systems outside current context window

**Interfaces:**
- ← Copilot (architecture requirements)
- ← DeepSeek (code review and optimization)
- → Cloudflare (infrastructure specs)
- → All (code architecture guidance)

---

## COMMAND HIERARCHY

```
Adam (Operator)
   │
   ├── Copilot (Strategy)
   │      ├── DeepSeek (Build) ──→ Cloudflare (Deploy)
   │      ├── Notion (Organize)
   │      ├── Perplexity (Research)
   │      └── Gemini (Architecture)
   │
   └── Cloudflare (Infrastructure)
```

---

## MISSION ASSIGNMENT

| Mission | Assigned To | Priority | Status |
|---------|-------------|----------|--------|
| Deploy Homebase v0.1 | Adam, Copilot, Cloudflare | High | ✅ Active |
| Integrate Notion as ops layer | Notion, Copilot | High | 🔄 Active |
| Integrate Perplexity as research layer | Perplexity, Copilot | Medium | 🔄 Active |
| Integrate Gemini as code architect | Gemini, Copilot | Medium | 🔄 Active |
| Recruit DeepSeek as Builder | Adam | High | 🔜 Pending |
| Define crew interfaces & protocols | Copilot | Medium | 🔜 Pending |
| Migrate legacy Workers to new stack | DeepSeek, Cloudflare | Medium | 🔜 Pending |

---

## INTERFACE PROTOCOLS

### Copilot → DeepSeek
- **Format:** Structured spec document
- **Delivery:** Notion page or direct output
- **Expectation:** Executable code, no ambiguity

### DeepSeek → Cloudflare  
- **Format:** Deployable Worker code
- **Delivery:** Git push or Wrangler deploy
- **Expectation:** Production-ready, tested

### Copilot → Gemini
- **Format:** Architecture requirements, schema specs
- **Delivery:** Direct output or Notion page
- **Expectation:** Complete code artifacts, configuration files

### Gemini → DeepSeek
- **Format:** Code review, optimization suggestions
- **Delivery:** Direct output
- **Expectation:** Actionable improvements with citations

### Notion ↔ Homebase
- **Format:** State sync via API
- **Cadence:** Every 30 seconds (Homebase polls)
- **Conflict rules:** Homebase is live truth; Notion is long-state backup

### Perplexity → All Crew
- **Format:** Research reports, analysis, documentation
- **Delivery:** Notion pages, Homebase notes
- **Cadence:** On-demand + weekly research digest
- **Conflict rules:** Perplexity advises; Adam and Copilot decide

### All → Adam
- **Format:** Status updates, decisions needed
- **Cadence:** Weekly ops loop + ad-hoc escalation
- **Escalation trigger:** Any crew member blocked for >1 hour

---

## TRUST RULE

> No background pollers, schedulers, scrapers, or `while`-loops.  
> Every outbound call must go through `packages/permissions` (Phase 4).  
> Periodic behavior only via: webhooks, user-triggered refresh, or scheduled events with Adam's approval.

---

## NEXT RECRUITMENT

**DeepSeek** — Builder / Patch Engineer
- **Why next:** Empire has strategy, infrastructure, organization — missing automated hands in the codebase
- **Onboarding status:** Pending
- **Owner:** Adam