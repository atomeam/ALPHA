export interface Env {
  ASSESSMENT_ENGINE: DurableObjectNamespace;
  ADAPTIVE_STATE: KVNamespace;
  ADAPTIVE_QUEUE: Queue;
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

  // Queue consumer for action execution
  async queue(batch: MessageBatch, env: Env, _ctx: ExecutionContext): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const data = msg.body as { type: string; payload: unknown; timestamp: number };
        console.log(`Processing queue message: ${data.type}`, data.payload);
        
        // Process action and store result in KV
        if (data.type === "action") {
          await env.ADAPTIVE_STATE.put(
            `action:${msg.id}`,
            JSON.stringify({ ...data, processedAt: Date.now(), messageId: msg.id })
          );
        }
      } catch (err) {
        console.error(`Failed to process message ${msg.id}:`, err);
      }
    }
  },
};