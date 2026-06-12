/**
 * ALPHA Orchestrator Worker v0.1
 * HTTP interface to OrchestrationBrain DO
 */

// Import the locally embedded DO
import { OrchestrationBrain } from './orchestration-brain';

// Export for wrangler DO binding
export { OrchestrationBrain };

// ============================================================================
// Environment
// ============================================================================

interface Env {
  ORCHESTRATION_BRAIN: DurableObjectNamespace;
  METRICS: KVNamespace;
}

// ============================================================================
// Durable Object Name
// ============================================================================

const DO_NAME = 'orchestration-brain';

function getBrainId(env: Env): string {
  return env.ORCHESTRATION_BRAIN.idFromName(DO_NAME).toString();
}

function getBrain(env: Env): DurableObjectStub {
  return env.ORCHESTRATION_BRAIN.get(env.ORCHESTRATION_BRAIN.idFromName(DO_NAME));
}

// ============================================================================
// HTTP Handlers
// ============================================================================

async function handleHealth(env: Env): Promise<Response> {
  try {
    const stub = getBrain(env);
    const id = getBrainId(env);
    const response = await stub.fetch('http://localhost/health');
    const data = (await response.json()) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        orchestrator: 'operational',
        brainId: id,
        ...data,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        orchestrator: 'degraded',
        error: err instanceof Error ? err.message : 'Unknown',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

async function handleState(env: Env): Promise<Response> {
  const stub = getBrain(env);
  const response = await stub.fetch('http://localhost/state');
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { ...Object.fromEntries(response.headers.entries()) },
  });
}

async function handleTransition(request: Request, env: Env): Promise<Response> {
  const stub = getBrain(env);

  try {
    const event = (await request.json()) as { sourceAgent?: string };

    const stateResp = await stub.fetch('http://localhost/state');
    let state: { version: number } = { version: 0 };
    if (stateResp.ok) {
      state = (await stateResp.json()) as { version: number };
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('X-Agent-Identity', event.sourceAgent || 'unknown');

    const response = await stub.fetch('http://localhost/transition', {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    });

    const result = (await response.json()) as { newVersion?: number };

    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'X-Version': String(result.newVersion || state.version),
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'TransitionFailed',
        details: err instanceof Error ? err.message : 'Unknown',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

async function handleIdempotentTransition(request: Request, env: Env): Promise<Response> {
  const stub = getBrain(env);

  try {
    const event = (await request.json()) as { sourceAgent?: string };

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('X-Agent-Identity', event.sourceAgent || 'unknown');

    const response = await stub.fetch('http://localhost/transition/idempotent', {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    });

    const result = (await response.json()) as { newVersion?: number };

    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'X-Version': String(result.newVersion || 0) },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'TransitionFailed',
        details: err instanceof Error ? err.message : 'Unknown',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

async function handleAgents(env: Env): Promise<Response> {
  const stub = getBrain(env);
  const response = await stub.fetch('http://localhost/agents');
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { ...Object.fromEntries(response.headers.entries()) },
  });
}

async function handleLock(request: Request, env: Env): Promise<Response> {
  const stub = getBrain(env);
  const url = new URL(request.url);

  const params = new URLSearchParams();
  if (url.searchParams.has('action')) params.set('action', url.searchParams.get('action')!);
  if (url.searchParams.has('id')) params.set('id', url.searchParams.get('id')!);
  if (url.searchParams.has('ttl')) params.set('ttl', url.searchParams.get('ttl')!);

  const headers = new Headers();
  if (request.headers.has('X-Agent-Identity')) {
    headers.set('X-Agent-Identity', request.headers.get('X-Agent-Identity')!);
  }

  const response = await stub.fetch(`http://localhost/lock?${params.toString()}`, {
    method: request.method,
    headers,
  });

  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleReconcile(env: Env): Promise<Response> {
  const stub = getBrain(env);
  const response = await stub.fetch('http://localhost/reconcile', { method: 'POST' });
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleEvents(request: Request, env: Env): Promise<Response> {
  const stub = getBrain(env);
  const url = new URL(request.url);
  const limit = url.searchParams.get('limit') || '100';
  const response = await stub.fetch(`http://localhost/events?limit=${limit}`);
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleSnapshot(env: Env): Promise<Response> {
  const stub = getBrain(env);
  const response = await stub.fetch('http://localhost/snapshot');
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// Worker Entry Point
// ============================================================================

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Agent-Identity, X-Expected-Version',
        },
      });
    }

    try {
      let response: Response;

      switch (path) {
        case '/health':
          response = await handleHealth(env);
          break;
        case '/state':
          response = await handleState(env);
          break;
        case '/transition':
          response =
            request.method === 'POST'
              ? await handleTransition(request, env)
              : new Response('Method Not Allowed', { status: 405 });
          break;
        case '/transition/idempotent':
          response =
            request.method === 'POST'
              ? await handleIdempotentTransition(request, env)
              : new Response('Method Not Allowed', { status: 405 });
          break;
        case '/agents':
          response = await handleAgents(env);
          break;
        case '/lock':
          response = await handleLock(request, env);
          break;
        case '/reconcile':
          response = await handleReconcile(env);
          break;
        case '/events':
          response = await handleEvents(request, env);
          break;
        case '/snapshot':
          response = await handleSnapshot(env);
          break;
        default:
          response = new Response(
            JSON.stringify({
              routes: [
                '/health',
                '/state',
                '/transition',
                '/transition/idempotent',
                '/agents',
                '/lock',
                '/reconcile',
                '/events',
                '/snapshot',
              ],
            }),
            { headers: { 'Content-Type': 'application/json' } },
          );
      }

      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: 'InternalError',
          message: err instanceof Error ? err.message : 'Unknown',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  },
};
