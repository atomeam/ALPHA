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
const VERSION = '0.3.0';
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
            const raw = await env.STATE_CACHE.get('proposals:snapshot');
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
            const rawValue = await env.STATE_CACHE.get('proposals:snapshot');
                    const value = rawValue;
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
          
          await env.STATE_CACHE.put('proposals:snapshot', JSON.stringify(payload));
          
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
          console.log('[Webhook] Received Notion event');
          const timestamp = new Date().toISOString();

          // Log to D1 events table for audit trail
          if (env.DB) {
            const eventId = event.data?.id || event.id || `notion-${Date.now()}`;
            const pageId = event.data?.id || '';
            const databaseId = event.data?.parent?.database_id || event.data?.parent?.page_id || '';
            await env.DB.prepare(
              "INSERT INTO events (event_id, source, kind, level, page_id, database_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(eventId, 'tier2-webhook', 'WHK_RECEIVED', 'info', pageId, databaseId, rawBody.substring(0, 500), timestamp).run();
          }

          // Use STATE_CACHE (lessons KV) for proposals as fallback since STATE has issues
          if (env.STATE_CACHE) {
                        const existing = await env.STATE_CACHE.get('proposals:snapshot');
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
            
            await env.STATE_CACHE.put('proposals:snapshot', JSON.stringify({
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
      

      // GET /api/events - query events from D1
      if (path === '/api/events') {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
        const source = url.searchParams.get("source");
        const kind = url.searchParams.get("kind");
        const level = url.searchParams.get("level");

        let query = "SELECT * FROM events";
        const conditions: string[] = [];
        const params: any[] = [];

        if (source) { conditions.push("source = ?"); params.push(source); }
        if (kind) { conditions.push("kind = ?"); params.push(kind); }
        if (level) { conditions.push("level = ?"); params.push(level); }

        if (conditions.length > 0) {
          query += " WHERE " + conditions.join(" AND ");
        }
        query += " ORDER BY created_at DESC LIMIT ?";
        params.push(limit);

        const { results } = await env.DB.prepare(query).bind(...params).all();

        return new Response(JSON.stringify({ ok: true, count: results.length, events: results }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
        });
      }

      // GET /dashboard - HTML dashboard
      if (path === '/dashboard') {
        const { results } = await env.DB.prepare(
          "SELECT * FROM events ORDER BY created_at DESC LIMIT 100"
        ).all();

        const proposals = await env.STATE_CACHE.get("proposals:snapshot", "json");
        const lessons = await env.STATE_CACHE.get("lessons:index", "json");

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aether Bridge — Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'SF Mono', 'Fira Code', monospace; background: #080808; color: #e0e0e0; padding: 24px; }
    h1 { color: #00ff88; font-size: 18px; margin-bottom: 8px; }
    h2 { color: #4db8ff; font-size: 14px; margin: 20px 0 8px; }
    .meta { color: #888; font-size: 12px; margin-bottom: 20px; }
    .cards { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .card { background: #0d0d0d; border: 1px solid #222; border-radius: 8px; padding: 16px; min-width: 180px; }
    .card .label { color: #888; font-size: 11px; text-transform: uppercase; }
    .card .value { color: #00ff88; font-size: 24px; font-weight: bold; }
    .card .sub { color: #666; font-size: 11px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; color: #888; padding: 8px 12px; border-bottom: 1px solid #222; font-size: 11px; text-transform: uppercase; }
    td { padding: 6px 12px; border-bottom: 1px solid #111; }
    tr:hover { background: #0d0d0d; }
    .kind { color: #4db8ff; }
    .source { color: #f59e0b; }
    .level-info { color: #00ff88; }
    .level-warn { color: #f59e0b; }
    .level-error { color: #ff4444; }
    .ts { color: #666; font-size: 11px; }
    .empty { color: #555; text-align: center; padding: 40px; }
    .refresh { background: none; border: 1px solid #333; color: #888; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 11px; float: right; }
    .refresh:hover { border-color: #00ff88; color: #00ff88; }
  </style>
</head>
<body>
  <h1>AETHER BRIDGE <span style="color:#666">v0.3.0</span></h1>
  <div class="meta">Operator dashboard &middot; ${new Date().toISOString()}</div>

  <div class="cards">
    <div class="card">
      <div class="label">Proposals</div>
      <div class="value">${(proposals as any)?.proposals?.length ?? (proposals as any)?.count ?? 0}</div>
      <div class="sub">${(proposals as any)?.source ?? "—"}</div>
    </div>
    <div class="card">
      <div class="label">Lessons</div>
      <div class="value">${(lessons as any)?.lessons?.length ?? (lessons as any)?.count ?? 0}</div>
      <div class="sub">${(lessons as any)?.source ?? "—"}</div>
    </div>
    <div class="card">
      <div class="label">Events</div>
      <div class="value">${results.length}</div>
      <div class="sub">last 100</div>
    </div>
  </div>

  <h2>Event Log <button class="refresh" onclick="location.reload()">↻ refresh</button></h2>
  ${results.length > 0 ? `<table>
    <tr><th>Time</th><th>Kind</th><th>Source</th><th>Level</th><th>Page ID</th><th>Event ID</th></tr>
    ${(results as any[]).map((e: any) => `<tr>
      <td class="ts">${e.created_at?.slice(11, 19) ?? "—"}</td>
      <td class="kind">${e.kind ?? "—"}</td>
      <td class="source">${e.source ?? "—"}</td>
      <td class="level-${e.level ?? "info"}">${e.level ?? "—"}</td>
      <td>${e.page_id?.slice(0, 12) ?? "—"}${e.page_id?.length > 12 ? "…" : ""}</td>
      <td class="ts">${e.event_id?.slice(0, 12) ?? "—"}…</td>
    </tr>`).join("")}
  </table>` : `<div class="empty">No events recorded yet. Webhook and queue activity will appear here.</div>`}
</body>
</html>`;

        return new Response(html, {
          headers: { "Content-Type": "text/html", "Cache-Control": "no-cache" },
        });
      }

      // 404
      return json({ error: 'Not found' }, 404);
      
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
    }
  },

  // Queue consumer handler
  async queue(batch: any, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      try {
        const job = message.body as CuratorJob;
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          kind: "WHK_QUEUE_CONSUME",
          level: "info",
          source: "curator-consumer",
          payload: { jobId: job.id, eventType: job.eventType, pageId: job.pageId },
        }));

        // Process the job - write to KV as processed marker
        if (job.pageId && env.STATE_CACHE) {
          const existingStr = await env.STATE_CACHE.get("lessons:index");
          let existing = { ok: true, lessons: [], source: "curator-queue", updatedAt: "" };
          if (existingStr) {
            try { existing = JSON.parse(existingStr); } catch {}
          }

          if (!existing.lessons) existing.lessons = [];
          existing.lessons.push({
            id: `curator-${job.id}`,
            source: "curator-queue",
            eventType: job.eventType,
            pageId: job.pageId,
            processedAt: new Date().toISOString(),
          });
          existing.updatedAt = new Date().toISOString();
          existing.source = "curator-queue";

          await env.STATE_CACHE.put("lessons:index", JSON.stringify(existing));
        }

        message.ack();
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          kind: "WHK_JOB_COMPLETED",
          level: "info",
          source: "curator-consumer",
          payload: { jobId: job.id },
        }));
      } catch (err) {
        console.error(JSON.stringify({
          ts: new Date().toISOString(),
          kind: "WHK_DISPATCH_FAIL",
          level: "error",
          source: "curator-consumer",
          payload: { error: String(err) },
        }));
        message.retry();
      }
    }
  },
};

// Types for Cloudflare
interface Env {
  DB: D1Database;
  STATE: KVNamespace;
  STATE_CACHE: KVNamespace;
  MYBROWSER: any;
  NOTION_WEBHOOK_SECRET: string;
  CURATOR_QUEUE: any; // Cloudflare Queue producer
}

// Queue message type
interface CuratorJob {
  id: string;
  eventId: string;
  eventType: string;
  pageId: string;
  databaseId?: string;
  receivedAt: string;
  raw?: string;
  source?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<void>): void;
  passThroughOnException(): void;
}



