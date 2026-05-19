/**
 * Cloudflare Worker Entry Point
 * 
 * Wraps Express app for Cloudflare Workers compatibility.
 * Uses the 'fetch' event listener pattern.
 */

import { default as app } from './server';

// Cloudflare Workers export
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle CORS
    const url = new URL(request.url);
    
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    
    // Map request to Express-like call
    // Note: Full Express wrapper would need more work
    // This is a light translation layer
    
    try {
      const path = url.pathname;
      const method = request.method;
      
      // Simple routing
      if (path === '/api/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (path === '/api/stack') {
        return new Response(JSON.stringify({
          status: 'online',
          backend: 'alpha-bridge',
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (path === '/api/execute' && method === 'POST') {
        const body = await request.json();
        // Execute endpoint - note: orchestrator integration needs async
        return new Response(JSON.stringify({
          success: true,
          result: { message: 'Execution queued' }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (path === '/api/execute/status' && method === 'GET') {
        return new Response(JSON.stringify({
          status: 'idle',
          currentStep: 0,
          totalSteps: 0
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // 404
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

// Types for Cloudflare
interface Env {
  GovernanceDB?: D1Database;
  RATE_LIMIT?: KVNamespace;
}

interface ExecutionContext {
  waitUntil(promise: Promise<void>): void;
  passThroughOnException(): void;
}

// Fallback for local dev
if (typeof globalThis !== 'undefined' && !('fetch' in globalThis)) {
  // Development export
  export { default as app };
}