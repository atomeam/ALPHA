#!/usr/bin/env node
/**
 * ProposalsWatcher - Nervous System
 * 
 * Polls Proposals DB for new pending items.
 * Part of the ALPHA Gate workflow.
 * 
 * Usage: node packages/chaos/src/proposals-watcher.ts
 * 
 * Environment (loaded from .env if present):
 *   NOTION_API_KEY - Notion integration token
 *   PROPOSALS_DB_ID - Database ID to poll
 *   POLL_INTERVAL_MS - Polling interval (default: 5000ms)
 *   USE_MOCK - Set to 'true' for mock responses
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env if present
const ENV_FILE = '.env';
if (fs.existsSync(ENV_FILE)) {
  const envContent = fs.readFileSync(ENV_FILE, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
  console.log('[Watcher] Loaded .env configuration');
}

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const PROPOSALS_DB_ID = process.env.PROPOSALS_DB_ID || process.env.ALPHA_PROPOSALS_DB_URL;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000');
const USE_MOCK = process.env.USE_MOCK === 'true';

// Cloudflare KV credentials
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_KV_STATE_ID = process.env.CF_KV_STATE_ID;
const CF_KV_STATE_CACHE_ID = process.env.CF_KV_STATE_CACHE_ID;

// Local fallback path
const PROPOSALS_LOG = './logs/proposals.jsonl';

// Mock responses for testing/fallback
const MOCK_PROPOSALS = [
  { id: 'mock_prop_001', title: 'Mock Proposal - Test', status: 'pending_review', summary: 'Mock response for testing' },
];

interface Proposal {
  id: string;
  title: string;
  status: string;
  summary: string;
}

async function fetchFromNotion(): Promise<Proposal[]> {
  if (USE_MOCK) {
    console.log('[Watcher] Using mock responses');
    return MOCK_PROPOSALS;
  }
  
  if (!NOTION_API_KEY || !PROPOSALS_DB_ID) {
    throw new Error('NOTION_API_KEY or PROPOSALS_DB_ID not set');
  }
  
  const response = await fetch(`https://api.notion.com/v1/databases/${PROPOSALS_DB_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: { property: 'Status', status: { equals: 'Drafted' } },
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.results?.map((page: any) => ({
    id: page.id,
    title: page.properties?.Title?.title?.[0]?.plain_text || 'Untitled',
    status: page.properties?.Status?.status?.name || 'unknown',
    summary: page.properties?.Summary?.rich_text?.[0]?.plain_text || '',
  })) || [];
}

function fetchFromLocal(): Proposal[] {
  if (!fs.existsSync(PROPOSALS_LOG)) {
    // Use fallback mock data when no local file exists (CI scenario)
    console.log('[Watcher] No local proposals file, using fallback');
    return MOCK_PROPOSALS;
  }
  
  const lines = fs.readFileSync(PROPOSALS_LOG, 'utf-8').split('\n').filter(Boolean);
  return lines
    .map(line => JSON.parse(line))
    .filter(p => p.status === 'pending_review' || p.status === 'draft');
}

async function dispatch(proposal: Proposal): Promise<void> {
  const debug = (msg: string) => console.error(`[Dispatcher] ${msg}`);
  debug(`Dispatching proposal: ${proposal.id}`);
  debug(`Title: ${proposal.title}`);
  debug(`Status: ${proposal.status}`);
  debug(`CF_ACCOUNT_ID: ${CF_ACCOUNT_ID ? 'SET' : 'MISSING'}`);
  debug(`CF_API_TOKEN: ${CF_API_TOKEN ? 'SET' : 'MISSING'}`);
  debug(`CF_KV_STATE_ID: ${CF_KV_STATE_ID ? 'SET' : 'MISSING'}`);
  
  // Write to Cloudflare KV via REST API
  if (CF_ACCOUNT_ID && CF_API_TOKEN && CF_KV_STATE_ID) {
    debug(`Attempting write to CF KV...`);
    try {
      const payload = JSON.stringify({
        proposals: [{ id: proposal.id, title: proposal.title, stage: proposal.status, source: 'backend-proposals-watcher', updatedAt: new Date().toISOString() }],
        updatedAt: new Date().toISOString()
      });
      
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_STATE_ID}/values/proposals:snapshot`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: payload,
        }
      );
      
      if (response.ok) {
        debug(`KV write SUCCESS`);
      } else {
        const err = await response.text();
        debug(`KV write FAILED: ${response.status} - ${err}`);
      }
    } catch (error) {
      debug(`KV Error: ${error}`);
    }
  } else {
    debug(`CF credentials not configured - skipping KV write`);
  }
}

async function poll(): Promise<void> {
  console.log('[Dispatcher] ProposalsWatcher initialized.');
  console.log(`  Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`  Source: ${NOTION_API_KEY ? 'Notion API' : 'Local fallback'}\n`);
  
  let lastIds: string[] = [];
  
  while (true) {
    try {
      const proposals = NOTION_API_KEY 
        ? await fetchFromNotion() 
        : fetchFromLocal();
      
      const newProposals = proposals.filter(p => !lastIds.includes(p.id));
      
      if (newProposals.length > 0) {
        console.log(`[Dispatcher] ${newProposals.length} new proposal(s) detected`);
        for (const proposal of newProposals) {
          await dispatch(proposal);
        }
      }
      
      lastIds = proposals.map(p => p.id);
    } catch (error) {
      console.error(`[Dispatcher] Heartbeat failure: ${error}`);
    }
    
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// CLI entry
const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(`
ProposalsWatcher - Nervous System

Usage: node packages/chaos/src/proposals-watcher.ts [--once]

Environment:
  NOTION_API_KEY       - Notion integration token
  PROPOSALS_DB_ID      - Database ID to poll
  POLL_INTERVAL_MS    - Polling interval (default: 5000)

Example:
  NOTION_API_KEY=secret_xxx POLL_INTERVAL_MS=3000 node packages/chaos/src/proposals-watcher.ts --once
`);
  process.exit(0);
}

// Run once mode
if (args.includes('--once')) {
  console.log('[Watcher] Running in one-shot mode');
  (async () => {
    try {
      const proposals = NOTION_API_KEY 
        ? await fetchFromNotion() 
        : fetchFromLocal();
      
      console.log(`[Watcher] Found ${proposals.length} proposal(s)`);
      for (const proposal of proposals) {
        await dispatch(proposal);
      }
    } catch (error) {
      console.error(`[Watcher] Error: ${error}`);
    }
    process.exit(0);
  })();
} else {
  poll().catch(console.error);
}