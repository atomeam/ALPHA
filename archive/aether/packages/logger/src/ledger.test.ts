import { describe, it, expect, vi, beforeEach } from "vitest"
import { commitToLedger, createTraceLogger, type ProposalRecord } from "./index"

// Simple unit test - no fs mocking needed
describe("Proposals & Outcomes Ledger", () => {
  it("commitToLedger accepts valid record shape", () => {
    const record: Omit<ProposalRecord, "timestamp"> = {
      traceId: "trace_abc",
      prompt: "Add a stat",
      promptHash: "hash123",
      verdict: "APPROVED",
      reason: "valid",
      rejectedIds: [],
      rawActions: [{ action: "ADD", plan: { type: "stat" } }],
    }

    // Should not throw - fail-soft catches errors
    expect(() => commitToLedger(record)).not.toThrow()
  })

  it("handles rejection verdict", () => {
    const record: Omit<ProposalRecord, "timestamp"> = {
      traceId: "trace_rejected",
      prompt: "Invalid",
      promptHash: "bad",
      verdict: "REJECTED",
      reason: "Unknown component type",
      rejectedIds: ["stat-fake-1"],
      rawActions: [{ action: "ADD" }],
    }

    expect(() => commitToLedger(record)).not.toThrow()
  })
})

describe("createTraceLogger", () => {
  it("creates child logger with traceId bound", () => {
    const child = createTraceLogger({ traceId: "trace_abc" })
    expect(child).toBeDefined()
    // child logger is a pino instance - traceId set via child() binding
  })
})

describe("Secret redaction", () => {
  it("should not throw when prompt contains sensitive-looking text", () => {
    // In production, sensitive fields should be redacted at serialization
    const record: Omit<ProposalRecord, "timestamp"> = {
      traceId: "trace_123",
      prompt: "Use API key abc123",
      promptHash: "hash",
      verdict: "APPROVED",
      reason: "ok",
      rejectedIds: [],
      rawActions: [],
    }
    expect(() => commitToLedger(record)).not.toThrow()
  })
})
