export interface Env {
  ASSESSMENT_ENGINE: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Simple health endpoint used by your dashboard
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "self-adaptive-app",
        status: "stub-online",
      });
    }

    // Proxy to the AssessmentEngine DO for investigation summary
    if (url.pathname.startsWith("/assessment")) {
      const id = env.ASSESSMENT_ENGINE.idFromName("global-assessment");
      const stub = env.ASSESSMENT_ENGINE.get(id);
      const forwardPath = url.pathname.replace("/assessment", "") || "/status";
      const req = new Request(new URL(forwardPath, request.url), request);
      return stub.fetch(req);
    }

    return new Response("self-adaptive-app: route not found", { status: 404 });
  },
};