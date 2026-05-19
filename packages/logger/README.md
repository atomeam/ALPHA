# @aether/logger

Pino logger + Proposals & Outcomes ledger for observability.

## Usage

```ts
import { log, createTraceLogger, commitToLedger } from "@aether/logger"

// Correlated logging
const txLog = createTraceLogger({ traceId: "trace_123" })
txLog.info({ prompt: "Add a stat" }, "Inbound request")

// Commit to ledger
commitToLedger({
  traceId: "trace_123",
  prompt: "Add a stat",
  promptHash: "abc123",
  verdict: "APPROVED",
  reason: "valid",
  rejectedIds: [],
  rawActions: [{ action: "ADD", plan: { type: "stat" } }],
})
```

## API

- `log` — pino instance
- `createTraceLogger(context)` — child logger with traceId
- `commitToLedger(record)` — append to proposals-outcomes.jsonl (fail-soft)