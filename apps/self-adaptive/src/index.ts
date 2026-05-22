/**
 * Cloudflare Worker Entry Point
 * 
 * This is the main HTTP handler that routes requests and orchestrates
 * the self-adaptive system.
 */

import type { Metric, HealthStatus, Assessment } from './types';
import { AssessmentEngine } from './assessment-engine';
import { MonitoringLayer, SystemMetricsSource, HealthCheckSource } from './monitoring';
import { ActionExecutor, ScaleUpHandler, ClearCacheHandler, SendAlertHandler, RestartServiceHandler } from './action-executor';

interface Env {
  ASSESSMENT_ENGINE: DurableObjectNamespace<AssessmentEngine>;
  METRICS_KV: KVNamespace;
  ACTION_QUEUE: Queue<any>;
  
  // Environment variables
  LOG_LEVEL: string;
  ASSESSMENT_INTERVAL_MS: string;
  METRICS_RETENTION_HOURS: string;
  
  // Secrets
  SLACK_WEBHOOK_URL?: string;
}

export default {
  /**
   * Main worker fetch handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route based on path
      if (url.pathname === '/api/health') {
        return handleHealthCheck(env);
      }

      if (url.pathname === '/api/metrics' && request.method === 'POST') {
        return await handleIngestMetrics(request, env);
      }

      if (url.pathname === '/api/assess') {
        return await handleRunAssessment(env);
      }

      if (url.pathname === '/api/status') {
        return await handleGetStatus(env);
      }

      if (url.pathname === '/api/actions') {
        return await handleActions(request, env);
      }

      if (url.pathname === '/api/metrics') {
        return handleGetMetrics(env);
      }

      // Default: return API info
      return new Response(JSON.stringify({
        service: 'alpha-self-adaptive',
        version: '0.1.0',
        endpoints: [
          'GET /api/health - Health check',
          'POST /api/metrics - Ingest metrics',
          'GET /api/metrics - Get recent metrics',
          'POST /api/assess - Run assessment',
          'GET /api/status - System status',
          'GET /api/actions - List pending actions',
          'POST /api/actions/:id/approve - Approve action',
        ],
      }, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Request error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        detail: error instanceof Error ? error.message : String(error),
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },

  /**
   * Scheduled handler for periodic assessments
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Running scheduled assessment...');
    
    const interval = parseInt(env.ASSESSMENT_INTERVAL_MS || '60000', 10);
    
    // Run assessment using Durable Object
    const id = env.ASSESSMENT_ENGINE.idFromName('main-assessment-engine');
    const stub = env.ASSESSMENT_ENGINE.get(id);
    
    // Collect metrics
    const monitoring = new MonitoringLayer();
    monitoring.registerSource(new SystemMetricsSource());
    
    const metrics = await monitoring.collectMetrics();
    
    // Ingest metrics
    await stub.fetch(new Request('http://internal/ingest', {
      method: 'POST',
      body: JSON.stringify(metrics),
    }));

    // Run assessment
    await stub.fetch(new Request('http://internal/assess', { method: 'POST' }));
    
    console.log('Scheduled assessment complete');
  },
};

/**
 * Health check endpoint
 */
async function handleHealthCheck(env: Env): Promise<Response> {
  return new Response(JSON.stringify({
    status: 'healthy',
    service: 'alpha-self-adaptive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime?.() || 'unknown',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Ingest metrics from external sources
 */
async function handleIngestMetrics(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Metric | Metric[];
  const metrics = Array.isArray(body) ? body : [body];

  // Get the durable object stub
  const id = env.ASSESSMENT_ENGINE.idFromName('main-assessment-engine');
  const stub = env.ASSESSMENT_ENGINE.get(id);

  // Send metrics to the assessment engine
  const response = await stub.fetch(new Request('http://internal/ingest', {
    method: 'POST',
    body: JSON.stringify(metrics),
  }));

  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Run a full assessment
 */
async function handleRunAssessment(env: Env): Promise<Response> {
  const id = env.ASSESSMENT_ENGINE.idFromName('main-assessment-engine');
  const stub = env.ASSESSMENT_ENGINE.get(id);

  const response = await stub.fetch(new Request('http://internal/assess', {
    method: 'POST',
  }));

  return new Response(await response.text(), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Get system status
 */
async function handleGetStatus(env: Env): Promise<Response> {
  const id = env.ASSESSMENT_ENGINE.idFromName('main-assessment-engine');
  const stub = env.ASSESSMENT_ENGINE.get(id);

  const response = await stub.fetch(new Request('http://internal/status'));

  return new Response(await response.text(), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Handle action-related requests
 */
async function handleActions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // GET /api/actions - list pending
  if (request.method === 'GET') {
    const id = env.ASSESSMENT_ENGINE.idFromName('main-assessment-engine');
    const stub = env.ASSESSMENT_ENGINE.get(id);
    const response = await stub.fetch(new Request('http://internal/actions'));
    return new Response(await response.text(), { headers: { 'Content-Type': 'application/json' } });
  }

  // POST /api/actions/:id/approve
  const pathParts = url.pathname.split('/');
  if (pathParts.length === 5 && pathParts[3] === 'approve') {
    const actionId = pathParts[4];
    const body = await request.json();

    const id = env.ASSESSMENT_ENGINE.idFromName('main-assessment-engine');
    const stub = env.ASSESSMENT_ENGINE.get(id);
    const response = await stub.fetch(new Request('http://internal/actions', {
      method: 'POST',
      body: JSON.stringify({ actionId, approved: body.approved }),
    }));

    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Not found', { status: 404 });
}

/**
 * Get recent metrics
 */
async function handleGetMetrics(env: Env): Promise<Response> {
  try {
    // List metrics from KV
    const metrics = await env.METRICS_KV.list({ prefix: 'metric:' });
    
    const items = await Promise.all(
      metrics.keys.map(async (key) => {
        const value = await env.METRICS_KV.get(key.name);
        return { key: key.name, value: value ? JSON.parse(value) : null };
      })
    );

    return new Response(JSON.stringify({ metrics: items }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to retrieve metrics',
      detail: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}