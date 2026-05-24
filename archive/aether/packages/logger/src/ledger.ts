import fs from "fs"
import path from "path"

export interface ProposalRecord {
  traceId: string
  timestamp: string
  prompt: string
  promptHash: string
  verdict: "APPROVED" | "REJECTED"
  reason: string
  rejectedIds: string[]
  rawActions: unknown[]
}

// Write transactions to a shared workspace analytics root
const LEDGER_PATH = path.resolve(process.cwd(), "../../logs/proposals-outcomes.jsonl")

/**
 * Commits a generative proposal transaction safely to the historical ledger.
 * Fail-soft: telemetry errors don't drop client requests.
 */
export function commitToLedger(record: Omit<ProposalRecord, "timestamp">): void {
  const fullRecord: ProposalRecord = {
    timestamp: new Date().toISOString(),
    ...record,
  }

  try {
    const dir = path.dirname(LEDGER_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.appendFileSync(LEDGER_PATH, JSON.stringify(fullRecord) + "\n", "utf8")
  } catch (err) {
    // Fail-soft on telemetry recording so it doesn't drop client requests
    console.error("TELEMETRY ERROR: Failed to commit transaction to ledger:", err)
  }
}