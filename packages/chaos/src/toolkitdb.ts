/**
 * ToolkitDB - Arsenal Inventory
 * 
 * Catalogs tools/assets used in the Loxa system.
 * Part of the ALPHA Gate workflow.
 * 
 * Schema:
 * - Tool Name (title)
 * - Kind: API | SDK | Tunnel | Auth | Infrastructure
 * - Status: Active | Mocking | Offline
 * - Auth Model: OAuth | API-Key | Scoped Token | Bearer | SSH
 * - Referenced By: proposal ID
 * - Cost: complexity score (1-10)
 */

import * as fs from 'fs';

const LOG_DIR = './logs';
const TOOLKIT_LOG = `${LOG_DIR}/toolkit.jsonl`;

// --- Types ---

interface ToolkitEntry {
  id: string;
  toolName: string;
  kind: 'API' | 'SDK' | 'Tunnel' | 'Auth' | 'Infrastructure';
  status: 'Active' | 'Mocking' | 'Offline';
  authModel: 'OAuth' | 'API-Key' | 'Scoped Token' | 'Bearer' | 'SSH';
  referencedBy?: string;  // Proposal ID
  cost: number;           // Complexity score 1-10
  createdAt: number;
  updatedAt: number;
}

// --- Helpers ---

function ensureDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function load(): ToolkitEntry[] {
  ensureDir();
  if (!fs.existsSync(TOOLKIT_LOG)) return [];
  return fs.readFileSync(TOOLKIT_LOG, 'utf-8')
    .split('\n').filter(Boolean)
    .map(line => JSON.parse(line));
}

function save(entries: ToolkitEntry[]): void {
  ensureDir();
  fs.writeFileSync(TOOLKIT_LOG, 
    entries.map(e => JSON.stringify(e)).join('\n') + '\n'
  );
}

// --- Seed ---

function seed(): ToolkitEntry[] {
  const entries: ToolkitEntry[] = [
    {
      id: 'tool_notion_api',
      toolName: 'Notion API',
      kind: 'API',
      status: 'Active',
      authModel: 'Bearer',
      referencedBy: 'prop_002',
      cost: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'tool_aether_testbed',
      toolName: 'Aether Testbed',
      kind: 'Infrastructure',
      status: 'Active',
      authModel: 'SSH',
      referencedBy: 'prop_002',
      cost: 7,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'tool_proposals_watcher',
      toolName: 'Proposals Watcher',
      kind: 'SDK',
      status: 'Active',
      authModel: 'API-Key',
      referencedBy: undefined,
      cost: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
  
  save(entries);
  console.log(`✅ Seeded ${entries.length} toolkit entries`);
  return entries;
}

function list(): void {
  const entries = load();
  
  console.log('\n🛠️ TOOLKIT');
  console.log('='.repeat(50));
  
  for (const e of entries) {
    const statusEmoji = e.status === 'Active' ? '✅' 
      : e.status === 'Mocking' ? '🔶'
      : '❌';
    
    console.log(`\n${statusEmoji} ${e.id}`);
    console.log(`   Tool: ${e.toolName}`);
    console.log(`   Kind: ${e.kind} | Status: ${e.status} | Auth: ${e.authModel}`);
    console.log(`   Cost: ${e.cost}/10 | Ref: ${e.referencedBy || 'N/A'}`);
  }
  
  console.log('\n' + '='.repeat(50));
}

// --- CLI ---

const cmd = process.argv[2];

if (cmd === 'seed') {
  seed();
} else if (cmd === 'list') {
  list();
} else {
  console.log('\n🛠️ ToolkitDB');
  console.log('='.repeat(40));
  console.log('\nCommands:');
  console.log('  seed  - Seed with initial arsenal');
  console.log('  list  - Show all tools');
}