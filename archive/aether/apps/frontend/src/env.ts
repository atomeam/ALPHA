import { parseEnv, FrontendEnvSchema } from "@aether/env"

// Vite uses import.meta.env, not process.env
// Only VITE_* variables are inlined into the client bundle
export const env = parseEnv(
  FrontendEnvSchema, 
  import.meta.env as Record<string, unknown>, 
  "frontend"
)

// Session traceId for correlation across requests
let lastTraceId: string | null = null

/**
 * Dispatches a build request with traceId correlation.
 */
export async function sendBuildRequest(prompt: string, currentComponents: unknown[] = []) {
  const traceId = lastTraceId || `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  const response = await fetch(`${env.VITE_API_URL}/api/build`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Id": traceId,
    },
    body: JSON.stringify({ prompt, currentComponents }),
  })

  if (!response.ok) {
    const errorPayload = await response.json()
    console.error(`[TELEMETRY] Request failed under trace: ${errorPayload.traceId}`)
    throw errorPayload
  }

  const result = await response.json()
  if (result.traceId) {
    lastTraceId = result.traceId  // remember for session continuity
  }

  return result
}