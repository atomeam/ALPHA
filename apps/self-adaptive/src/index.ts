export interface Env {
  ASSESSMENT_ENGINE: DurableObjectNamespace;
  ADAPTIVE_STATE: KVNamespace;
  ADAPTIVE_QUEUE: Queue;
}

interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Health endpoint with KV state
    if (url.pathname === "/health") {
      // Check KV for deployment metadata
      let deploymentInfo = { version: "0.0.1", lastDeployed: null };
      try {
        const kvData = await env.ADAPTIVE_STATE.get("deployment", "json");
        if (kvData) deploymentInfo = kvData as typeof deploymentInfo;
      } catch {
        // KV not configured yet
      }

      return Response.json(
        {
          ok: true,
          service: "self-adaptive-app",
          status: "online",
          deployment: deploymentInfo,
        },
        { headers: CORS_HEADERS }
      );
    }

    // Proxy to the AssessmentEngine DO for investigation summary
    if (url.pathname.startsWith("/assessment")) {
      const id = env.ASSESSMENT_ENGINE.idFromName("global-assessment");
      const stub = env.ASSESSMENT_ENGINE.get(id);
      const forwardPath = url.pathname.replace("/assessment", "") || "/status";
      const req = new Request(new URL(forwardPath, request.url), request);
      const response = await stub.fetch(req);
      
      // If DO returned a projection, cache it in KV
      if (response.ok && request.method === "POST") {
        try {
          const data = await response.clone().json();
          if (data.projection) {
            await env.ADAPTIVE_STATE.put(
              "projection:assessment:latest",
              JSON.stringify(data.projection)
            );
          }
        } catch {
          // Projection write failed - DO is still authoritative
        }
      }
      
      // Add CORS headers to DO response
      const newHeaders = new Headers(response.headers);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    }

    // Queue action endpoint
    if (url.pathname === "/action" && request.method === "POST") {
      try {
        const body = await request.json();
        await env.ADAPTIVE_QUEUE.send({
          type: "action",
          payload: body,
          timestamp: Date.now(),
        });
        return Response.json({ queued: true }, { headers: CORS_HEADERS });
      } catch {
        return Response.json({ error: "Invalid request" }, { status: 400, headers: CORS_HEADERS });
      }
    }

    return new Response("self-adaptive-app: route not found", { status: 404, headers: CORS_HEADERS });
  },

  // Queue consumer - triggers DO (authoritative), writes KV cache only
  async queue(batch: MessageBatch, env: Env, _ctx: ExecutionContext): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const data = msg.body as { type: string; payload: unknown; timestamp: number };
        console.log(`Processing queue message: ${data.type}`, data.payload);

        // Queue MUST go through DO to maintain authoritative state
        if (data.type === "action") {
          const id = env.ASSESSMENT_ENGINE.idFromName("global-assessment");
          const stub = env.ASSESSMENT_ENGINE.get(id);

          // Call DO method to process action (DO is authoritative)
          const doResponse = await stub.fetch(
            new Request("http://internal/process-action", {
              method: "POST",
              body: JSON.stringify(data.payload),
              headers: { "Content-Type": "application/json" },
            })
          );

          if (doResponse.ok) {
            // DO updated its state and returned projection
            // Write projection to KV cache under "projection:*" namespace
            const result = await doResponse.json();
            if (result.projection) {
              await env.ADAPTIVE_STATE.put(
                "projection:assessment:latest",
                JSON.stringify(result.projection)
              );
            }
          }
        }
      } catch (err) {
        console.error(`Failed to process message ${msg.id}:`, err);
      }
    }
  },

  // Scheduled handler for cron triggers
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log("Cron triggered - running assessment");

    // Trigger a new assessment on schedule
    const id = env.ASSESSMENT_ENGINE.idFromName("global-assessment");
    const stub = env.ASSESSMENT_ENGINE.get(id);

    const response = await stub.fetch(
      new Request("http://internal/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    if (response.ok) {
      const data = await response.json();
      if (data.projection) {
        await env.ADAPTIVE_STATE.put(
          "projection:assessment:latest",
          JSON.stringify(data.projection)
        );
      }
      console.log("Scheduled assessment completed:", data.assessmentCount);
    }
  },
};