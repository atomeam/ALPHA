/**
 * Proposals Tracker
 * 
 * Mirrors the Notion Proposals DB for local testing.
 * Seed with example proposals to test Curator approval/denial loop.
 * 
 * Run: node packages/chaos/src/proposals.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = './logs';
const PROPOSALS_LOG = `${LOG_DIR}/proposals.jsonl`;

// Proposal schema (matching Notion DB fields)
interface Proposal {
  id: string;
  title: string;
  type: 'feature' | 'fix' | 'chore' | 'docs';
  status: 'draft' | 'pending_review' | 'approved' | 'denied' | 'merged';
  proponent: string;
  filesOrPagesTouched: string[];
  requires: string[]; // e.g., ['code_review', 'security_audit']
  summary: string;
  createdAt: number;
  updatedAt: number;
}

function ensureDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function load(): Proposal[] {
  ensureDir();
  if (!fs.existsSync(PROPOSALS_LOG)) return [];
  return fs.readFileSync(PROPOSALS_LOG, 'utf-8')
    .split('\n').filter(Boolean)
    .map(line => JSON.parse(line));
}

function save(proposals: Proposal[]): void {
  ensureDir();
  fs.writeFileSync(PROPOSALS_LOG, 
    proposals.map(p => JSON.stringify(p)).join('\n') + '\n'
  );
}

function seed(): void {
  const proposals: Proposal[] = [
    {
      id: 'prop_001',
      title: 'Add confidence score to curator-audit',
      type: 'feature',
      status: 'pending_review',
      proponent: 'adam',
      filesOrPagesTouched: [
        'packages/curator-audit/src/index.ts',
        'packages/curator/src/index.ts'
      ],
      requires: ['code_review'],
      summary: 'Add numerical confidence score (0-1) to audit entries for threshold-based escalation. Currently uses categorical source tags.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'prop_002',
      title: 'Emit policy.yaml snapshot',
      type: 'feature',
      status: 'pending_review',
      proponent: 'adam',
      filesOrPagesTouched: [
        'packages/governance/src/index.ts',
        'packages/curator/src/index.ts'
      ],
      requires: ['code_review', 'security_audit'],
      summary: 'Add curator.exportPolicy() to emit human-readable YAML snapshot of scope-binding graph. Useful for SOC2 narrative.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
  
  save(proposals);
  console.log(`✅ Seeded ${proposals.length} proposals`);
}

function list(): void {
  const proposals = load();
  
  console.log('\n📋 PROPOSALS');
  console.log('='.repeat(50));
  
  for (const p of proposals) {
    const statusEmoji = p.status === 'approved' ? '✅' 
      : p.status === 'denied' ? '❌'
      : p.status === 'pending_review' ? '⏳'
      : p.status === 'merged' ? '🔰'
      : '✏️ ';
    
    console.log(`\n${statusEmoji} ${p.id} | ${p.type} | ${p.status}`);
    console.log(`   Title: ${p.title}`);
    console.log(`   Files: ${p.filesOrPagesTouched.join(', ')}`);
    console.log(`   Requires: ${p.requires.join(', ')}`);
  }
  
  console.log('\n' + '='.repeat(50));
}

// CLI
const cmd = process.argv[2];

if (cmd === 'seed') {
  seed();
} else if (cmd === 'list') {
  list();
} else {
  console.log('\n📋 Proposals Tracker');
  console.log('='.repeat(40));
  console.log('\nCommands:');
  console.log('  seed  - Seed with example proposals');
  console.log('  list  - Show all proposals');
}