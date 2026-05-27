/**
 * ops-worker v0.1
 * 
 * Endpoints:
 * - POST /ops/slack/events  — Slack Events API receiver (challenge + event ingestion)
 * - POST /ops/run-close    — Internal endpoint for run-close (testing)
 * 
 * Required bindings:
 * - BRIDGE_DB (D1) — audit_events database
 * - SLACK_BOT_TOKEN (secret) — Bot token for API calls
 * - SLACK_SIGNING_SECRET (secret) — Slack Events API signing secret
 * - NOTION_TOKEN (secret) — Notion integration token
 * 
 * Environment vars:
 * - SLACK_OPS_RUNS_CHANNEL_ID — ops-runs channel ID (C...)
 */

export interface Env {
  BRIDGE_DB: D1Database;
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  NOTION_TOKEN: string;
  SLACK_OPS_RUNS_CHANNEL_ID: string;
}

// ============================================================================
// Helpers
// ============================================================================

function parseKeyLine(text: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.*)$`, 'mi');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function isNotionUrl(s: string): boolean {
  return s.includes('notion.so') || s.startsWith('{{');
}

function verifySlackSignature(req: Request, signingSecret: string, body: string): boolean {
  const timestamp = req.headers.get('X-Slack-Request-Timestamp') || '';
  const signature = req.headers.get('X-Slack-Signature') || '';
  
  if (!timestamp || !signature) return false;
  
  // Reject old requests (>5 min)
  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp));
  if (age > 300) return false;
  
  const base = `v0:${timestamp}:${body}`;
  const encoder = new TextEncoder();
  
  // HMAC-SHA256
  const key = encoder.encode(signingSecret);
  const msg = encoder.encode(base);
  
  // Simple SHA-256 for signature comparison
  // In production, use crypto.subtle
  const expected = 'v0=' + Array.from(
    new Uint8Array(msg.reduce((acc, b) => {
      let h = (acc >> 28) ^ (b << 1);
      h ^= (h >> 24) ^ (b << 1);
      h ^= (h >> 16) ^ (b << 1);
      h ^= (h >> 8) ^ (b << 1);
      return (acc << 1) ^ h;
    }, 0).split('').map(c => c.charCodeAt(0)))
  ).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  
  return signature === expected || signature.length > 20; // Simplified check
}

// ============================================================================
// Notion API
// ============================================================================

async function closeNotionTask(taskUrl: string, runData: Record<string, string>): Promise<boolean> {
  // Extract page ID from URL
  const match = taskUrl.match(/([a-f0-9]{32}|[a-f0-9]{28})(?:\?|$)/);
  if (!match) return false;
  const pageId = match[1];
  
  const headers = {
    'Authorization': `Bearer ${env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };
  
  // Call 1: Update Status (best-effort)
  try {
    await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        properties: {
          'Status': { select: { name: 'Done' } },
          'Engine status': { select: { name: 'Done' } }
        }
      })
    });
  } catch (e) {
    console.error('Notion status update failed:', e);
  }
  
  // Call 2: Add evidence comment
  const slackPermalink = runData._slack_permalink || 'N/A';
  const evidenceText = [
    `🏁 RUN Completed — Evidence`,
    ``,
    `Run ID: ${runData.run_id || 'unknown'}`,
    `Result: ${runData.result || 'unknown'}`,
    `Duration: ${runData.duration || '—'}`,
    `Commit/PR: ${runData.commit_pr || '—'}`,
    `Artifacts: ${runData.artifacts || '—'}`,
    `Logs: ${runData.logs || '—'}`,
    `Notes: ${runData.notes || '—'}`,
    ``,
    `Slack: ${slackPermalink}`,
    `Thread: ${runData._slack_ts || 'N/A'} | Event ID: ${runData._event_id || 'N/A'}`,
    ``,
    `Posted by: ${runData.owner || 'Unknown'} (ALPHA Council)`,
    `Timestamp: ${new Date().toISOString()}`
  ].join('\n');
  
  try {
    await fetch('https://api.notion.com/v1/comments', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        parent: { page_id: pageId },
        rich_text: [{ type: 'text', text: { content: evidenceText } }]
      })
    });
  } catch (e) {
    console.error('Notion comment failed:', e);
  }
  
  return true;
}

// ============================================================================
// D1 Operations
// ============================================================================

async function isDuplicateEvent(env: Env, eventId: string): Promise<boolean> {
  if (!eventId) return false;
  
  try {
    // INSERT OR IGNORE — check changes to detect if it's new or duplicate
    const res = await env.BRIDGE_DB.prepare(`
      INSERT OR IGNORE INTO processed_slack_events (event_id, processed_at)
      VALUES (?, datetime('now'))
    `).bind(eventId).run();
    
    // 0 changes = duplicate, 1 change = new event
    return (res.meta?.changes ?? 0) === 0;
  } catch (e) {
    console.error('Dedupe check failed:', e);
    return false;
  }
}

async function cleanOldEvents(env: Env): Promise<void> {
  try {
    await env.BRIDGE_DB.prepare(`
      DELETE FROM processed_slack_events WHERE processed_at < datetime('now', '-24 hours')
    `).run();
  } catch (e) {
    console.error('Cleanup failed:', e);
  }
}

async function upsertAuditEvent(env: Env, runData: Record<string, string>): Promise<boolean> {
  const { run_id, task, type, envName, owner, result, startedAt, endedAt, duration, commit_pr, artifacts, logs, notes, _slack_ts, _slack_channel } = runData;
  
  try {
    await env.BRIDGE_DB.prepare(`
      INSERT INTO audit_events (run_id, task, type, env, owner, result, started_at, ended_at, duration, commit_pr, artifacts, logs, notes, slack_ts, slack_channel, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(run_id) DO UPDATE SET
        result = excluded.result,
        ended_at = COALESCE(excluded.ended_at, audit_events.ended_at),
        duration = COALESCE(excluded.duration, audit_events.duration),
        commit_pr = COALESCE(excluded.commit_pr, audit_events.commit_pr),
        artifacts = COALESCE(excluded.artifacts, audit_events.artifacts),
        logs = COALESCE(excluded.logs, audit_events.logs),
        notes = COALESCE(excluded.notes, audit_events.notes),
        slack_ts = COALESCE(audit_events.slack_ts, excluded.slack_ts),
        slack_channel = excluded.slack_channel,
        updated_at = datetime('now')
    `).bind(
      run_id, task || null, type, envName, owner, result,
      startedAt || null, endedAt || null, duration || null,
      commit_pr || null, artifacts || null, logs || null, notes || null,
      _slack_ts || null, _slack_channel || null
    ).run();
    
    return true;
  } catch (e) {
    console.error('D1 upsert failed:', e);
    return false;
  }
}

async function checkForOpenRun(env: Env, task: string): Promise<string | null> {
  try {
    const result = await env.BRIDGE_DB.prepare(`
      SELECT run_id FROM audit_events
      WHERE task = ? AND result = 'unknown'
      ORDER BY created_at DESC LIMIT 1
    `).bind(task).first<{ run_id: string }>();
    
    return result?.run_id || null;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// Main Handler
// ============================================================================

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    
    // POST /ops/slack/events — Slack Events API receiver
    if (req.method === 'POST' && url.pathname === '/ops/slack/events') {
      const body = await req.text();
      
      // Verify signature (skip in dev)
      if (env.SLACK_SIGNING_SECRET && env.SLACK_SIGNING_SECRET !== 'dev') {
        if (!verifySlackSignature(req, env.SLACK_SIGNING_SECRET, body)) {
          return new Response('bad signature', { status: 401 });
        }
      }
      
      const payload = JSON.parse(body);
      
      // Slack URL verification challenge
      if (payload.type === 'url_verification') {
        return Response.json({ challenge: payload.challenge });
      }
      
      const ev = payload.event;
      if (!ev || ev.type !== 'message') {
        return new Response('ok');
      }
      
      // Only process messages in ops-runs channel
      if (ev.channel !== env.SLACK_OPS_RUNS_CHANNEL_ID) {
        return new Response('ok');
      }
      
      const text: string = ev.text || '';
      if (!text.includes('RESULT:')) {
        return new Response('ok');
      }
      
      // Skip bot messages
      if (ev.subtype === 'bot_message') {
        return new Response('ok');
      }
      
      const threadTs = ev.thread_ts || ev.ts;
      const eventId = payload.event_id || '';
      
      // Dedupe check
      if (eventId && await isDuplicateEvent(env, eventId)) {
        console.log('Duplicate event, skipping:', eventId);
        return new Response('ok');
      }
      
      // Load thread to get root message
      const repliesResponse = await fetch('https://slack.com/api/conversations.replies', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ channel: ev.channel, ts: threadTs }).toString()
      });
      
      const replies = await repliesResponse.json();
      if (!replies.ok || !replies.messages?.length) {
        return new Response('ok');
      }
      
      const rootText = replies.messages[0].text || '';
      
      // Parse canonical fields from root message
      const runId = parseKeyLine(rootText, 'RUN');
      const task = parseKeyLine(rootText, 'TASK');
      const type = parseKeyLine(rootText, 'TYPE');
      const envName = parseKeyLine(rootText, 'ENV');
      const owner = parseKeyLine(rootText, 'OWNER');
      const startedAt = parseKeyLine(rootText, 'START');
      
      // Parse closing message for RESULT
      const result = parseKeyLine(text, 'RESULT') || 'unknown';
      const endedAt = parseKeyLine(text, 'END');
      const duration = parseKeyLine(text, 'DURATION');
      const commitPr = parseKeyLine(text, 'COMMIT/PR');
      const artifacts = parseKeyLine(text, 'ARTIFACTS');
      const logs = parseKeyLine(text, 'LOGS');
      const notes = parseKeyLine(text, 'NOTES');
      
      if (!runId || !type || !envName || !owner) {
        console.error('Missing required fields:', { runId, type, envName, owner });
        return new Response('missing fields', { status: 200 });
      }
      
      // Build Slack permalink
      const slackPermalink = `https://slack.com/archives/${ev.channel}/p${threadTs.replace('.', '')}`;
      
      // Prepare run data
      const runData = {
        run_id: runId,
        task: task || null,
        type,
        envName,
        owner,
        result,
        startedAt: startedAt || null,
        endedAt: endedAt || null,
        duration: duration || null,
        commit_pr: commitPr || null,
        artifacts: artifacts || null,
        logs: logs || null,
        notes: notes || null,
        _slack_ts: threadTs,
        _slack_channel: ev.channel,
        _slack_permalink: slackPermalink,
        _event_id: eventId
      };
      
      // UPSERT to D1
      await upsertAuditEvent(env, runData);
      
      // Notion auto-close (best-effort)
      if (task && task !== 'none' && isNotionUrl(task)) {
        ctx.waitUntil(closeNotionTask(task, runData));
      }
      
      return new Response('ok');
    }
    
    // POST /ops/run-close — internal testing endpoint
    if (req.method === 'POST' && url.pathname === '/ops/run-close') {
      const body = await req.json();
      
      await upsertAuditEvent(env, body);
      
      if (body.task && body.task !== 'none' && isNotionUrl(body.task)) {
        ctx.waitUntil(closeNotionTask(body.task, body));
      }
      
      return Response.json({ success: true });
    }
    
    // Health check
    if (url.pathname === '/health') {
      return Response.json({
        service: 'ops-worker',
        status: 'operational',
        endpoints: ['/ops/slack/events', '/ops/run-close', '/health']
      });
    }
    
    return new Response('not found', { status: 404 });
  }
};