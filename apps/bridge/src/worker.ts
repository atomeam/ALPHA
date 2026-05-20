/**
 * Cloudflare Worker Entry Point
 * 
 * Aether Bridge v0.2.0 - Provides:
 * - /health - Bridge status and bindings
 * - /proposals - Proposal queue
 * - /lessons - Lesson learned
 * - /crew/status - Summary with all bindings
 * - /api/* - Legacy API compatibility
 */

import { default as app } from './server';

// Shared constants
const VERSION = '0.2.0';
const SERVICE = 'aether-bridge';

// No-store JSON helper - prevents stale cache
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}

// Shared helper - returns binding status
function getBindings(env: Env) {
  return {
    DB: !!env.DB,
    STATE: !!env.STATE,
    STATE_CACHE: !!env.STATE_CACHE,
    MYBROWSER: !!env.MYBROWSER,
  };
}

// Cloudflare Workers export
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return json(null, 204);
    }
    
    try {
      const path = url.pathname;
      const method = request.method;
      
      // GET /health - returns v0.2 contract with bindings
      if (path === '/health') {
        return json({
          ok: true,
          service: SERVICE,
          version: VERSION,
          ts: new Date().toISOString(),
          bindings: getBindings(env),
        });
      }
      
      // GET /crew/status - summary with all bindings
      if (path === '/crew/status' || path === '/crew') {
        const bindings = getBindings(env);
        const bindingsMissing = !bindings.DB || !bindings.STATE || !bindings.STATE_CACHE || !bindings.MYBROWSER;
        
        let proposals = { count: 0, updatedAt: null, items: [] as unknown[] };
        let lessons = { count: 0, updatedAt: null, items: [] as unknown[] };
        
        if (env.STATE) {
          try {
            const raw = await env.STATE.get('proposals:snapshot');
            const parsed = raw ? JSON.parse(raw) : null;
            if (Array.isArray(parsed)) {
              proposals.items = parsed;
            } else if (parsed && Array.isArray(parsed.proposals)) {
              proposals.items = parsed.proposals;
              proposals.updatedAt = parsed.updatedAt ?? null;
            }
            proposals.count = proposals.items.length;
            proposals.updatedAt = proposals.updatedAt || (proposals.count > 0 ? new Date().toISOString() : null);
          } catch { /* ignore */ }
        }
        
        if (env.STATE_CACHE) {
          try {
            const raw = await env.STATE_CACHE.get('lessons:index');
            const parsed = raw ? JSON.parse(raw) : null;
            if (Array.isArray(parsed)) {
              lessons.items = parsed;
            } else if (parsed && Array.isArray(parsed.lessons)) {
              lessons.items = parsed.lessons;
              lessons.updatedAt = parsed.updatedAt ?? null;
            }
            lessons.count = lessons.items.length;
            lessons.updatedAt = lessons.updatedAt || (lessons.count > 0 ? new Date().toISOString() : null);
          } catch { /* ignore */ }
        }
        
        return json({
          ok: true,
          service: SERVICE,
          version: VERSION,
          ts: new Date().toISOString(),
          bindings,
          bindingsMissing,
          proposals,
          lessons,
        });
      }
      
      // GET /proposals - returns proposals from STATE KV
      if (path === '/proposals') {
        let proposals: unknown[] = [];
        let updatedAt: string | null = null;
        
        if (env.STATE) {
          try {
            const value = await env.STATE.get('proposals:snapshot');
            const parsed = value ? JSON.parse(value) : null;
            if (Array.isArray(parsed)) {
              proposals = parsed;
            } else if (parsed && Array.isArray(parsed.proposals)) {
              proposals = parsed.proposals;
              updatedAt = parsed.updatedAt ?? null;
            }
          } catch { /* ignore */ }
        }
        
        return json({
          ok: true,
          proposals,
          updatedAt,
          count: proposals.length,
        });
      }
      
      // GET /lessons - returns lessons from STATE_CACHE KV
      if (path === '/lessons') {
        let lessons: unknown[] = [];
        let updatedAt: string | null = null;
        
        if (env.STATE_CACHE) {
          try {
            const value = await env.STATE_CACHE.get('lessons:index');
            const parsed = value ? JSON.parse(value) : null;
            if (Array.isArray(parsed)) {
              lessons = parsed;
            } else if (parsed && Array.isArray(parsed.lessons)) {
              lessons = parsed.lessons;
              updatedAt = parsed.updatedAt ?? null;
            }
          } catch { /* ignore */ }
        }
        
        return json({
          ok: true,
          lessons,
          updatedAt,
          count: lessons.length,
        });
      }
      
      // POST /lessons/check - detect hash collisions
      if (path === '/lessons/check' && method === 'POST') {
        let hash = '';
        let collision: unknown | null = null;
        
        try {
          const body = await request.json() as { hash?: string };
          if (typeof body.hash === 'string' && body.hash.length > 0) {
            hash = body.hash;
            if (env.STATE_CACHE) {
              const existing = await env.STATE_CACHE.get(`lessons:hash:${hash}`);
              if (existing) collision = JSON.parse(existing);
            }
          } else {
            return json({ ok: false, error: 'Missing hash' }, 400);
          }
        } catch {
          return json({ ok: false, error: 'Invalid request body' }, 400);
        }
        
        return json({ ok: true, hash, collision });
      }
      
      // POST /proposals/write - write proposals snapshot (workflow writer)
      if (path === '/proposals/write' && method === 'POST' && env.STATE) {
        try {
          const body = await request.json() as { items?: unknown[]; source?: string };
          const items = body.items || [];
          
          const payload = {
            items,
            source: body.source || 'backend-proposals-watcher',
            updatedAt: new Date().toISOString(),
          };
          
          await env.STATE.put('proposals:snapshot', JSON.stringify(payload));
          
          return json({ ok: true, updatedAt: payload.updatedAt });
        } catch {
          return json({ ok: false, error: 'Invalid request body' }, 400);
        }
      }
      
      // POST /lessons/write - write lessons index (workflow writer)
      if (path === '/lessons/write' && method === 'POST' && env.STATE_CACHE) {
        try {
          const body = await request.json() as { items?: unknown[]; source?: string };
          const items = body.items || [];
          
          const payload = {
            items,
            source: body.source || 'backend-proposals-watcher',
            updatedAt: new Date().toISOString(),
          };
          
          await env.STATE_CACHE.put('lessons:index', JSON.stringify(payload));
          
          return json({ ok: true, updatedAt: payload.updatedAt });
        } catch {
          return json({ ok: false, error: 'Invalid request body' }, 400);
        }
      }
      

      // POST /webhooks/notion - Notion webhook receiver with HMAC verification
      if (path === '/webhooks/notion' && method === 'POST') {
        const signature = request.headers.get('x-notion-signature') || request.headers.get('x-hub-signature');
        const rawBody = await request.clone().text();
        
        if (signature && env.NOTION_WEBHOOK_SECRET) {
          const crypto = await import('crypto');
          const expectedSig = crypto.createHmac('sha256', env.NOTION_WEBHOOK_SECRET).update(rawBody).digest('hex');
          const providedSig = signature.replace(/^sha256=/, '');
          
          let valid = false;
          if (expectedSig.length === providedSig.length) {
            valid = true;
            for (let i = 0; i < expectedSig.length; i++) {
              valid = valid && expectedSig[i] === providedSig[i];
            }
          }
          
          if (!valid) {
            console.log('[Webhook] HMAC verification FAILED');
            return json({ ok: false, error: 'Invalid signature' }, 401);
          }
          console.log('[Webhook] HMAC verification PASSED');
        } else if (!env.NOTION_WEBHOOK_SECRET) {
          console.log('[Webhook] WARNING: NOTION_WEBHOOK_SECRET not configured');
        } else {
          console.log('[Webhook] WARNING: No signature header');
        }
        
        try {
          const event = JSON.parse(rawBody);
          console.log('[Webhook] Received Notion event:', JSON.stringify(event).slice(0, 200));
          const timestamp = new Date().toISOString();
          
          if (env.STATE) {
            const existing = await env.STATE.get('proposals:snapshot');
            let items = [];
            if (existing) {
              try { items = JSON.parse(existing).items || JSON.parse(existing).proposals || []; } catch {}
            }
            
            items.push({
              id: event.data?.id || event.id || `notion-${Date.now()}`,
              title: event.data?.title || event.data?.Name?.title?.[0]?.plain_text || 'Untitled',
              stage: 'pending_review',
              source: 'notion-webhook',
              timestamp,
            });
            
            await env.STATE.put('proposals:snapshot', JSON.stringify({
              items,
              source: 'notion-webhook',
              updatedAt: timestamp,
            }));
          }
          
          if (env.STATE_CACHE) {
            const existingCache = await env.STATE_CACHE.get('lessons:index');
            let lessons = [];
            if (existingCache) {
              try { lessons = JSON.parse(existingCache).lessons || JSON.parse(existingCache).items || []; } catch {}
            }
            
            lessons.push({
              id: event.data?.id || event.id || `notion-${Date.now()}`,
              title: `Notion Update: ${event.data?.title || 'Event'}`,
              hash: event.data?.id || event.id,
              source: 'notion-webhook',
              timestamp,
            });
            
            await env.STATE_CACHE.put('lessons:index', JSON.stringify({
              lessons,
              source: 'notion-webhook',
              updatedAt: timestamp,
            }));
          }
          
          return json({ ok: true, received: true, timestamp });
        } catch (e) {
          return json({ ok: false, error: 'Invalid JSON' }, 400);
        }
      }


      // POST /webhooks/notion - Notion webhook receiver with HMAC verification
      if (path === '/webhooks/notion' && method === 'POST') {
        const signature = request.headers.get('x-notion-signature') || request.headers.get('x-hub-signature');
        const rawBody = await request.clone().text();
        
        if (signature && env.NOTION_WEBHOOK_SECRET) {
          const crypto = await import('crypto');
          const expectedSig = crypto.createHmac('sha256', env.NOTION_WEBHOOK_SECRET).update(rawBody).digest('hex');
          const providedSig = signature.replace(/^sha256=/, '');
          
          let valid = false;
          if (expectedSig.length === providedSig.length) {
            valid = true;
            for (let i = 0; i < expectedSig.length; i++) {
              valid = valid && expectedSig[i] === providedSig[i];
            }
          }
          
          if (!valid) {
            console.log('[Webhook] HMAC verification FAILED');
            return json({ ok: false, error: 'Invalid signature' }, 401);
          }
          console.log('[Webhook] HMAC verification PASSED');
        } else if (!env.NOTION_WEBHOOK_SECRET) {
          console.log('[Webhook] WARNING: NOTION_WEBHOOK_SECRET not configured');
        } else {
          console.log('[Webhook] WARNING: No signature header');
        }
        
        try {
          const event = JSON.parse(rawBody);
          console.log('[Webhook] Received Notion event');
          const timestamp = new Date().toISOString();
          
          if (env.STATE) {
            const existing = await env.STATE.get('proposals:snapshot');
            let items: any[] = [];
            if (existing) {
              try { items = JSON.parse(existing).proposals || []; } catch {}
            }
            
            items.push({
              id: event.data?.id || event.id || `notion-${Date.now()}`,
              title: event.data?.title || event.data?.Name?.title?.[0]?.plain_text || 'Untitled',
              stage: 'pending_review',
              source: 'notion-webhook',
              timestamp,
            });
            
            await env.STATE.put('proposals:snapshot', JSON.stringify({
              proposals: items,
              source: 'notion-webhook',
              updatedAt: timestamp,
            }));
          }
          
          if (env.STATE_CACHE) {
            const existingCache = await env.STATE_CACHE.get('lessons:index');
            let lessons: any[] = [];
            if (existingCache) {
              try { lessons = JSON.parse(existingCache).lessons || []; } catch {}
            }
            
            lessons.push({
              id: event.data?.id || event.id || `notion-${Date.now()}`,
              title: `Notion Update: ${event.data?.title || 'Event'}`,
              hash: event.data?.id || event.id,
              source: 'notion-webhook',
              timestamp,
            });
            
            await env.STATE_CACHE.put('lessons:index', JSON.stringify({
              lessons: lessons,
              source: 'notion-webhook',
              updatedAt: timestamp,
            }));
          }
          
          return json({ ok: true, received: true, timestamp });
        } catch (e) {
          return json({ ok: false, error: 'Invalid JSON' }, 400);
        }
      }

      // Legacy API: /api/stack
      if (path === '/api/stack') {
        return json({
          status: 'online',
          backend: 'alpha-bridge',
          timestamp: new Date().toISOString()
        });
      }
      
      // Legacy API: /api/execute
      if (path === '/api/execute' && method === 'POST') {
        return json({ success: true, result: { message: 'Execution queued' } });
      }
      
      // Legacy API: /api/execute/status
      if (path === '/api/execute/status' && method === 'GET') {
        return json({ status: 'idle', currentStep: 0, totalSteps: 0 });
      }
      
      // 404
      return json({ error: 'Not found' }, 404);
      
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
    }
  }
};

// Types for Cloudflare
interface Env {
  DB: D1Database;
  STATE: KVNamespace;
  STATE_CACHE: KVNamespace;
  MYBROWSER: any;
  NOTION_WEBHOOK_SECRET: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<void>): void;
  passThroughOnException(): void;
}

// Fallback for local dev
if (typeof globalThis !== 'undefined' && !('fetch' in globalThis)) {
  export { default as app };
}
