export interface Env {
  ASSESSMENT_ENGINE: DurableObjectNamespace;
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

    // Simple health endpoint used by your dashboard
    if (url.pathname === "/health") {
      return Response.json(
        {
          ok: true,
          service: "self-adaptive-app",
          status: "stub-online",
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

    return new Response("self-adaptive-app: route not found", { status: 404, headers: CORS_HEADERS });
  },
};