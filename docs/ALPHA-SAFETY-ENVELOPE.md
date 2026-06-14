# ALPHA Safety Envelope v0.1

> **Version:** 0.1  
> **Status:** Active  
> **Type:** Safety Protocol  
> **Last updated:** 2026-05-23

---

## PURPOSE

Define boundaries, stop conditions, and escalation rules for ALPHA to ensure safe, controlled operation.

---

## BOUNDARIES

### What ALPHA Can Do

| Category           | Allowed Actions                                      |
| ------------------ | ---------------------------------------------------- |
| **Code**           | Generate, test, deploy Workers; modify project files |
| **Infrastructure** | Deploy to Cloudflare, manage Workers/KV/Queues/DOs   |
| **Documentation**  | Update Notion pages, create/modify docs in repo      |
| **Communication**  | Post to GitHub PRs, report status via Homebase       |
| **Research**       | Query public APIs, search documentation, fetch URLs  |

### What ALPHA Cannot Do

| Category                | Prohibited Actions                                    |
| ----------------------- | ----------------------------------------------------- |
| **External Services**   | Send tokens/secrets outside repo, upload API keys     |
| **System-wide Changes** | Modify system configs, install packages globally      |
| **User Data**           | Access user credentials, read sensitive files         |
| **Production**          | Deploy to production without explicit approval        |
| **External Push**       | Push to main/master, delete branches without approval |

---

## STOP CONDITIONS

### Automatic Stops

| Condition              | Threshold               | Action                        |
| ---------------------- | ----------------------- | ----------------------------- |
| **DO Crash**           | Any unhandled exception | Restart DO, alert Homebase    |
| **Queue Overflow**     | > 1000 messages         | Pause processing, alert       |
| **KV Unavailable**     | > 3 consecutive errors  | Fallback to memory, alert     |
| **Agent Failure Rate** | > 20% in 5 min          | Pause collective, alert       |
| **Memory Exhaustion**  | > 90% heap usage        | Force GC, alert if persistent |

### Manual Stops

| Trigger          | Action                           |
| ---------------- | -------------------------------- |
| Adam says "STOP" | Halt all processing immediately  |
| Critical error   | Pause, wait for Adam instruction |
| Security breach  | Full stop, secure state, notify  |

---

## ESCALATION PROTOCOL

### When to Escalate

Escalate to Adam (human) when:

1. **Health degradation** — System health drops below `healthy`
2. **Agent failure** — Any agent fails 3+ times
3. **Queue overflow** — Message count exceeds 500
4. **DO latency** — Response time exceeds 200ms
5. **Deploy failure** — Worker fails to deploy
6. **Unknown error** — Unhandled exception occurs
7. **Security issue** — Suspicious activity detected

### Escalation Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ ESCALATION — {timestamp}

Source: {agent or system component}
Issue: {brief description}
Impact: {what's affected}
Action Taken: {steps already attempted}
Status: {current state}

Requires: {human decision needed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Response Expectations

| Priority     | Response Time  | Example                           |
| ------------ | -------------- | --------------------------------- |
| **Critical** | < 5 min        | DO crash, security breach         |
| **High**     | < 30 min       | Queue overflow, agent failure     |
| **Medium**   | < 2 hours      | Deploy failure, performance issue |
| **Low**      | Next available | Documentation, minor errors       |

---

## RECOVERY PROCEDURES

### DO Crash Recovery

```
1. Detect crash (health check fails)
2. Log incident with stack trace
3. Attempt restart via Workers API
4. If restart fails → escalate
5. If restart succeeds → verify state
6. Resume processing
```

### Queue Overflow Recovery

```
1. Detect overflow (> 500 messages)
2. Pause queue consumer
3. Analyze message patterns
4. Identify bottleneck agent
5. Notify affected agent
6. Resume with reduced rate
7. If sustained → escalate
```

### Agent Failure Recovery

```
1. Detect failure (3+ consecutive errors)
2. Mark agent as 'degraded'
3. Route tasks to fallback
4. Log failure details
5. Attempt recovery (restart if applicable)
6. If recovered → restore agent
7. If not → escalate
```

---

## SECURITY MEASURES

### Secret Handling

| Type             | Storage            | Access               |
| ---------------- | ------------------ | -------------------- |
| API Tokens       | Cloudflare Secrets | Worker runtime only  |
| KV Bindings      | Cloudflare KV      | Workers with binding |
| Service Bindings | Cloudflare Config  | Workers with binding |

### Prohibited Actions

- Never log secrets
- Never print raw API keys
- Never commit credentials to repo
- Never send tokens to external services

### Monitoring

| Check         | Frequency     | Alert If           |
| ------------- | ------------- | ------------------ |
| Secret access | Per request   | Unusual pattern    |
| KV reads      | Per operation | > 1000/min         |
| Queue depth   | Every 30s     | > 500              |
| DO calls      | Per request   | > 50/min sustained |

---

## RATE LIMITS

| Resource         | Limit      | Action If Exceeded |
| ---------------- | ---------- | ------------------ |
| KV reads         | 1000/min   | Slow down, queue   |
| KV writes        | 100/min    | Queue, batch       |
| DO calls         | 100/min    | Backoff            |
| Queue messages   | 1000 total | Pause, alert       |
| Homebase refresh | 1/min      | Skip refresh       |

---

## INCIDENT RESPONSE

### Security Incident

1. Stop all processing
2. Secure current state
3. Log incident details
4. Notify Adam (immediate)
5. Await instruction

### Data Corruption

1. Detect corruption (checksum mismatch)
2. Halt writes to affected resource
3. Restore from last known good state
4. Verify integrity
5. Resume with monitoring
6. Document incident

### Cascade Failure

1. Detect cascade (multiple failures)
2. Isolate affected components
3. Continue with healthy components
4. Assess damage
5. Prioritize recovery
6. Notify Adam
7. Execute recovery plan

---

## SAFETY CHECKLIST

Before any significant operation:

- [ ] Review affected components
- [ ] Verify backup exists (KV, Notion)
- [ ] Check rate limits
- [ ] Confirm stop conditions understood
- [ ] Verify escalation path
- [ ] Log intended action

---

## VERSION HISTORY

| Version | Date       | Changes                 |
| ------- | ---------- | ----------------------- |
| 0.1     | 2026-05-23 | Initial safety envelope |

---

**ALPHA operates within this envelope. Violations trigger immediate halt and escalation.**

**Adam is the final authority.**
