# ALPHA System Diagram v0.1

> **Version:** 0.1  
> **Status:** Active  
> **Type:** System Architecture Diagram  
> **Last updated:** 2026-05-23

---

## HIGH-LEVEL ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              ADAM                                       │
│                         (Human Operator)                                │
│                              │                                          │
│                              ▼                                          │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                       HOMEBASE                                  │   │
│   │                  (Identity Surface)                              │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │   │
│   │  │  Crew   │ │ Mission │ │ System  │ │ Event   │ │Collective│ │   │
│   │  │ Panel   │ │ Panel   │ │ Panel   │ │ Stream  │ │ Panel   │  │   │
│   │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │   │
│   └───────┼───────────┼───────────┼───────────┼───────────┼───────┘   │
│           │           │           │           │           │          │
│           └───────────┴───────────┴───────────┴───────────┘          │
│                               │                                          │
│                    ┌──────────┴──────────┐                              │
│                    │    SERVICE BINDING   │                              │
│                    │   ADAPTIVE ──────────┼────────────────────────────│
│                    └──────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SELF-ADAPTIVE-APP                                │
│                         (Worker v0.5)                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    ASSESSMENT BRAIN (DO)                         │   │
│   │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────┐  │   │
│   │  │ State   │  │ Evaluate│  │  Adapt  │  │ Metrics │  │Health│  │   │
│   │  │ Manager │  │ Engine  │  │ Logic   │  │ Collector│ │Check│  │   │
│   │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────┘  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│              ┌───────────────┼───────────────┐                          │
│              │               │               │                          │
│   ┌──────────┴───┐  ┌────────┴────┐  ┌──────┴───────┐                  │
│   │  QUEUE        │  │  KV         │  │  HANDLERS    │                  │
│   │(adaptive-     │  │(f3171ead)   │  │              │                  │
│   │ actions)      │  │             │  │  fetch       │                  │
│   │              │  │             │  │  queue       │                  │
│   └──────────────┘  └─────────────┘  └──────────────┘                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         COUNCIL OF 11                                   │
│                      (Multi-Agent Council)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│   │ COGNITIVE   │  │   DESIGN    │  │  EXECUTION  │  │   MEMORY    │   │
│   │   Layer     │  │   Layer     │  │   Layer     │  │   Layer     │   │
│   ├─────────────┤  ├─────────────┤  ├─────────────┤  ├─────────────┤   │
│   │ • Copilot   │  │ • Gemini    │  │ • DeepSeek  │  │ • Notion    │   │
│   │ • Perplexity│  │ • Agent #8  │  │ • OpenHands │  │ • KV        │   │
│   │ • o1/o3     │  │ • LangGraph │  │ • Cloudflare│  │             │   │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## DATA FLOW

```
ADAM
  │
  ▼ [Intent]
HOMEBASE
  │
  ▼ [Service Binding]
SELF-ADAPTIVE-APP
  │
  ├──► ASSESSMENT BRAIN (DO)
  │         │
  │         ├──► State Manager (session state)
  │         ├──► Evaluate Engine (decision logic)
  │         ├──► Adapt Logic (self-modification)
  │         └──► Metrics Collector (KPIs)
  │
  ├──► QUEUE (adaptive-actions)
  │         │
  │         └──► Action Processor → Execute → Result
  │
  └──► KV (f3171ead...)
            │
            └──► Metrics Storage ← Feedback Loop
                   │
                   └──► Health Check → Homebase
```

---

## AGENT INTERACTION DIAGRAM

```
                    ┌──────────────┐
                    │     ADAM     │
                    └──────┬───────┘
                           │
                           ▼
              ┌────────────────────────┐
              │        COPILOT         │
              │   (Interpret Intent)   │
              └──────────┬────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
   ┌──────────────┐          ┌──────────────┐
   │  PERPLEXITY  │          │     O1/O3    │
   │  (Research) │          │  (Validate)  │
   └──────┬───────┘          └──────┬───────┘
          │                         │
          └─────────┬───────────────┘
                    │
                    ▼
           ┌────────────────┐
           │     GEMINI     │
           │   (Architect)  │
           └───────┬────────┘
                   │
      ┌────────────┴────────────┐
      │                         │
      ▼                         ▼
┌──────────────┐        ┌──────────────┐
│   DEEPSEEK   │        │  AGENT #8     │
│   (Build)    │        │  (Integrate) │
└──────┬───────┘        └──────┬───────┘
       │                       │
       └───────────┬───────────┘
                   │
                   ▼
          ┌────────────────┐
          │   OPENHANDS    │
          │    (Execute)   │
          └───────┬────────┘
                  │
                  ▼
         ┌────────────────┐
         │   CLOUDFLARE   │
         │    (Deploy)    │
         └───────┬────────┘
                 │
                 ▼
          ┌────────────────┐
          │     NOTION     │
          │   (Document)   │
          └────────────────┘
```

---

## SERVICE BINDINGS

| From              | To                       | Purpose                           |
| ----------------- | ------------------------ | --------------------------------- |
| Homebase          | self-adaptive-app        | Fetch metrics, health, state      |
| self-adaptive-app | AssessmentBrain (DO)     | Stateful computation              |
| self-adaptive-app | adaptive-actions (Queue) | Async action processing           |
| self-adaptive-app | f3171ead... (KV)         | Metrics persistence               |
| Council agents    | Homebase                 | Report status, receive directives |

---

## HEALTH CHECKS

```
Self-Adaptive-App
      │
      ├──► DO Health (ping AssessmentBrain)
      │         │
      │         └──► Response time < 100ms → OK
      │              Response time > 100ms → WARN
      │              No response → FAIL → Restart
      │
      ├──► Queue Health (check consumer lag)
      │         │
      │         └──► Messages < 100 → OK
      │              Messages > 100 → WARN
      │              Messages > 1000 → CRITICAL
      │
      └──► KV Health (check read/write latency)
                │
                └──► Latency < 50ms → OK
                     Latency > 50ms → WARN
                     Errors > 1% → CRITICAL
```

---

## DEPLOYMENT TOPOLOGY

```
Cloudflare Edge Network
         │
    ┌────┴────┐
    │         │
┌───┴───┐ ┌───┴───┐
│Homebase│ │Self-  │
│Worker  │ │Adapt  │
│(x-n)   │ │App (x-n)│
└───┬───┘ └───┬───┘
    │         │
    │    ┌────┴────┐
    │    │         │
    │ ┌──┴──┐ ┌───┴───┐
    │ │DO   │ │ Queue │ ← Single globally
    │ │     │ │       │   (Cloudflare handles)
    │ └─────┘ └───────┘
    │
    └──► KV Namespaces (regional)
```

---

## VERSION HISTORY

| Version | Date       | Changes                |
| ------- | ---------- | ---------------------- |
| 0.1     | 2026-05-23 | Initial system diagram |

---

**ALPHA is operational. The diagram is the architecture.**
