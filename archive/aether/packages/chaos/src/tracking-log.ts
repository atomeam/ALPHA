/**
 * Outreach Tracking Log
 * 
 * Tracks all outbound campaigns, drafts, and responses.
 * Used by @loxa/daemon for queue management.
 * 
 * Run: node packages/chaos/src/tracking-log.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = './logs';
const OUTREACH_LOG = `${LOG_DIR}/outreach.jsonl`;

// Outreach record
interface OutreachRecord {
  id: string;
  round: number;
  targetId: string;
  targetName: string;
  targetCompany: string;
  channel: 'linkedin' | 'email';
  status: 'drafted' | 'staged' | 'approved' | 'sent' | 'replied' | 'bounced';
  draft: string;
  sentAt: number | null;
  repliedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// Ensure log directory exists
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// Load all records
function loadRecords(): OutreachRecord[] {
  ensureLogDir();
  
  if (!fs.existsSync(OUTREACH_LOG)) {
    return [];
  }
  
  const lines = fs.readFileSync(OUTREACH_LOG, 'utf-8').split('\n').filter(Boolean);
  return lines.map(line => JSON.parse(line));
}

// Save record (append mode)
function saveRecord(record: OutreachRecord): void {
  ensureLogDir();
  fs.appendFileSync(OUTREACH_LOG, JSON.stringify(record) + '\n');
}

// Initialize with Round 1 targets
function initializeRound1(targets: Array<{ id: string; name: string; company: string }>): void {
  ensureLogDir();
  
  // Clear existing
  if (fs.existsSync(OUTREACH_LOG)) {
    fs.unlinkSync(OUTREACH_LOG);
  }
  
  for (const target of targets) {
    const record: OutreachRecord = {
      id: `r1_${target.id}`,
      round: 1,
      targetId: target.id,
      targetName: target.name,
      targetCompany: target.company,
      channel: 'linkedin', // default
      status: 'drafted',
      draft: '', // to be filled
      sentAt: null,
      repliedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveRecord(record);
  }
  
  console.log(`✅ Initialized ${targets.length} Round 1 targets`);
}

// Update record status
function updateStatus(id: string, status: OutreachRecord['status']): void {
  const records = loadRecords();
  const idx = records.findIndex(r => r.id === id);
  
  if (idx === -1) {
    console.log(`❌ Record not found: ${id}`);
    return;
  }
  
  records[idx].status = status;
  records[idx].updatedAt = Date.now();
  
  if (status === 'sent') {
    records[idx].sentAt = Date.now();
  }
  if (status === 'replied') {
    records[idx].repliedAt = Date.now();
  }
  
  // Rewrite all
  fs.writeFileSync(OUTREACH_LOG, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  
  console.log(`✅ Updated ${id} -> ${status}`);
}

// Get stats
function getStats(): void {
  const records = loadRecords();
  
  console.log('\n📊 OUTREACH STATS');
  console.log('='.repeat(40));
  
  const byStatus = {
    drafted: records.filter(r => r.status === 'drafted').length,
    staged: records.filter(r => r.status === 'staged').length,
    approved: records.filter(r => r.status === 'approved').length,
    sent: records.filter(r => r.status === 'sent').length,
    replied: records.filter(r => r.status === 'replied').length,
    bounced: records.filter(r => r.status === 'bounced').length,
  };
  
  console.log('\nBy Status:');
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${count}`);
  }
  
  const byRound = new Map<number, number>();
  for (const r of records) {
    byRound.set(r.round, (byRound.get(r.round) || 0) + 1);
  }
  console.log('\nBy Round:');
  for (const [round, count] of byRound) {
    console.log(`  Round ${round}: ${count}`);
  }
  
  // Response rate
  const sent = records.filter(r => r.status === 'sent').length;
  const replied = records.filter(r => r.status === 'replied').length;
  console.log(`\n📈 Response Rate: ${sent > 0 ? ((replied / sent) * 100).toFixed(1) : 0}%`);
  
  console.log('\n' + '='.repeat(40));
}

// Show all records
function showAll(): void {
  const records = loadRecords();
  
  console.log('\n📋 ALL RECORDS');
  console.log('='.repeat(60));
  
  for (const r of records) {
    const emoji = r.status === 'replied' ? '✅' : r.status === 'sent' ? '📤' : r.status === 'approved' ? '👍' : r.status === 'staged' ? '📋' : '✏️ ';
    console.log(`${emoji} ${r.id} | ${r.targetName} (${r.targetCompany}) | ${r.channel} | ${r.status}`);
  }
  
  console.log('\n' + '='.repeat(60));
}

// CLI
const command = process.argv[2];

if (command === 'init') {
  // Example initialization (replace with real targets)
  initializeRound1([
    { id: 'neal_ogrady', name: 'Neal O\'Grady', company: 'Demand Curve' },
    { id: 'brian', name: 'Brian', company: 'Clarityflow' },
    { id: 'sam', name: 'Sam', company: 'GrowthShop' },
    { id: 'jon', name: 'Jon', company: 'DesignJoy' },
    { id: 'george', name: 'George', company: 'Resend' },
  ]);
} else if (command === 'stats') {
  getStats();
} else if (command === 'list') {
  showAll();
} else if (command === 'update') {
  const id = process.argv[3];
  const status = process.argv[4] as OutreachRecord['status'];
  if (id && status) {
    updateStatus(id, status);
  } else {
    console.log('Usage: node tracking-log.ts update <id> <status>');
  }
} else {
  console.log('\n📋 Outreach Tracking Log');
  console.log('='.repeat(40));
  console.log('\nCommands:');
  console.log('  init     - Initialize with Round 1 targets');
  console.log('  stats   - Show statistics');
  console.log('  list    - Show all records');
  console.log('  update  <id> <status> - Update status');
}