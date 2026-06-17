/**
 * Tasks Hub Compliance Checker
 * 
 * Validates that Tasks Hub implementation adheres to specs/tasks-hub.contract.md
 * 
 * Usage: node scripts/check-tasks-hub-compliance.mjs
 * 
 * Exit codes:
 *   0 = all checks passed
 *   1 = one or more checks failed
 * 
 * Requirements: Node.js 18+ (uses built-in modules only)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename, relative } from 'path';

// ANSI colors for output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(msg, color = RESET) {
  console.log(`${color}${msg}${RESET}`);
}

function logPass(msg) {
  log(`  ✓ ${msg}`, GREEN);
}

function logFail(msg) {
  log(`  ✗ ${msg}`, RED);
}

function logInfo(msg) {
  log(`  → ${msg}`, YELLOW);
}

function findFiles(dir, pattern, maxDepth = 4, depth = 0) {
  const results = [];
  if (depth > maxDepth) return results;
  
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        results.push(...findFiles(fullPath, pattern, maxDepth, depth + 1));
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch (e) {
    // Ignore permission errors
  }
  
  return results;
}

let errors = 0;
let warnings = 0;

// ============================================================
// CHECK 1: Contract file exists
// ============================================================
log('\n=== CHECK 1: Contract File ===');
const CONTRACT_PATH = 'specs/tasks-hub.contract.md';

if (existsSync(CONTRACT_PATH)) {
  logPass(`Contract file exists: ${CONTRACT_PATH}`);
  
  const content = readFileSync(CONTRACT_PATH, 'utf-8');
  
  // Verify contract has required sections
  const requiredSections = [
    'Canonical Enums',
    'Validation Rules',
    'Query Rules',
    'JSON Schemas',
    'Error Codes',
    'Audit Events',
    'Non-Negotiables'
  ];
  
  for (const section of requiredSections) {
    if (content.includes(section)) {
      logPass(`  Contract contains: ${section}`);
    } else {
      logFail(`  Contract missing: ${section}`);
      errors++;
    }
  }
  
  // Check for ok: true in contract
  if (content.includes('"ok"') || content.includes("'ok'")) {
    logPass('  Contract includes ok field');
  } else {
    logInfo('  Contract may need update: ok field not found');
  }
} else {
  logFail(`Contract file missing: ${CONTRACT_PATH}`);
  errors++;
}

// ============================================================
// CHECK 2: ALPHA-Spec.md references contract
// ============================================================
log('\n=== CHECK 2: ALPHA-Spec.md Reference ===');
const SPEC_PATH = 'ALPHA-Spec.md';

if (existsSync(SPEC_PATH)) {
  logPass(`Spec file exists: ${SPEC_PATH}`);
  const specContent = readFileSync(SPEC_PATH, 'utf-8');
  
  if (specContent.includes('specs/tasks-hub.contract.md')) {
    logPass('  ALPHA-Spec.md references tasks-hub.contract.md');
  } else {
    logFail('  ALPHA-Spec.md does not reference specs/tasks-hub.contract.md');
    errors++;
  }
} else {
  logFail(`ALPHA-Spec.md missing: ${SPEC_PATH}`);
  errors++;
}

// ============================================================
// CHECK 3: Wrangler config validation
// ============================================================
log('\n=== CHECK 3: Wrangler Config ===');

// Find all wrangler.toml files in apps
const wranglerFiles = findFiles('apps', /wrangler\.toml$/);

if (wranglerFiles.length === 0) {
  logFail('No wrangler.toml files found in apps/');
  errors++;
} else {
  logPass(`Found ${wranglerFiles.length} wrangler.toml file(s)`);
}

// Check if any wrangler config defines the Tasks Hub worker
const tasksHubConfigs = wranglerFiles.filter(wranglerPath => {
  try {
    const content = readFileSync(wranglerPath, 'utf-8');
    return content.includes('BRIDGE_DB');
  } catch (e) {
    return false;
  }
});

if (tasksHubConfigs.length > 0) {
  logPass(`Found ${tasksHubConfigs.length} Tasks Hub config(s)`);
  
  for (const configPath of tasksHubConfigs) {
    logInfo(`Checking: ${configPath}`);
    const content = readFileSync(configPath, 'utf-8');
    
    // Check for aether-bridge worker name
    if (content.includes('name = "aether-bridge"')) {
      logPass('  Worker name: aether-bridge');
    } else if (content.match(/name\s*=\s*"([^"]+)"/)) {
      const match = content.match(/name\s*=\s*"([^"]+)"/);
      logFail(`  Worker name mismatch: expected "aether-bridge", found "${match[1]}"`);
      errors++;
    } else {
      logInfo('  Worker name check skipped');
    }
    
    // Check for BRIDGE_DB binding
    if (content.includes('binding = "BRIDGE_DB"')) {
      logPass('  BRIDGE_DB binding present');
    } else {
      logFail('  BRIDGE_DB binding missing');
      errors++;
    }
    
    // Check for correct database name
    if (content.includes('database_name = "aether-bridge-db"')) {
      logPass('  database_name: aether-bridge-db');
    } else if (content.match(/database_name\s*=\s*"([^"]+)"/)) {
      const match = content.match(/database_name\s*=\s*"([^"]+)"/);
      logFail(`  database_name mismatch: expected "aether-bridge-db", found "${match[1]}"`);
      errors++;
    } else {
      logFail('  database_name not found');
      errors++;
    }
  }
} else {
  logInfo('No Tasks Hub wrangler config found with BRIDGE_DB binding');
}

// ============================================================
// CHECK 4: Code compliance checks
// ============================================================
log('\n=== CHECK 4: Code Compliance ===');

// Find tasks-related route files
const routeFiles = findFiles('apps', /tasks.*\.ts$/);

if (routeFiles.length === 0) {
  logFail('No tasks route files found');
  errors++;
} else {
  logPass(`Found ${routeFiles.length} tasks route file(s)`);
}

for (const routePath of routeFiles) {
  logInfo(`Checking: ${routePath}`);
  const content = readFileSync(routePath, 'utf-8');
  
  // Skip test files for code structure checks (they mock responses)
  const isTestFile = routePath.endsWith('.test.ts') || routePath.endsWith('.spec.ts');
  
  // X-Correlation-Id header (only for production files)
  if (isTestFile) {
    logInfo('  Skipping response checks for test file');
  } else if (content.includes('X-Correlation-Id') || content.includes('x-correlation-id')) {
    logPass('  X-Correlation-Id header set');
  } else {
    logFail('  X-Correlation-Id header missing');
    errors++;
  }
  
  // ok envelope shape (only for production files)
  if (!isTestFile) {
    if (content.includes("ok: true") || content.includes("ok:true")) {
      logPass('  ok: true in success responses');
    } else {
      logFail('  ok: true missing from success responses');
      errors++;
    }
    
    // tasks array in response
    if (content.includes('tasks:')) {
      logPass('  tasks array in response');
    } else {
      logFail('  tasks array missing from response');
      errors++;
    }
  } else {
    logInfo('  Response format checks skipped for test file');
  }
  
  // tags normalization ([] never null)
  const tagsDefaultPattern = /tags\s*[:=]\s*\[\]|tags\s*\?\s*:\s*\[\]/;
  if (tagsDefaultPattern.test(content) || (content.includes('tags:') && !content.match(/tags\s*:\s*null[^a-z]/))) {
    logPass('  tags normalized to [] (never null outward)');
  } else {
    logInfo('  tags handling found');
  }
  
  // BRIDGE_API_TOKEN auth
  if (content.includes('BRIDGE_API_TOKEN')) {
    logPass('  BRIDGE_API_TOKEN auth guard present');
  } else {
    logFail('  BRIDGE_API_TOKEN auth missing');
    errors++;
  }
  
  // audit_events write
  if (content.includes('writeAuditEvent') || content.includes('audit_events')) {
    logPass('  audit_events write found');
  } else {
    logFail('  audit_events write missing');
    errors++;
  }
  
  // correlationId in response
  if (content.includes('correlationId')) {
    logPass('  correlationId in body');
  } else {
    logFail('  correlationId in body missing');
    errors++;
  }
  
  // UUID validation
  if (content.includes('uuid') || content.includes('UUID')) {
    logPass('  UUID handling found');
  } else {
    logInfo('  UUID handling check skipped');
  }
  
  // Status monotonic transitions
  if (content.includes('status') && (content.includes('Not started') || content.includes('In progress') || content.includes('Done'))) {
    logPass('  Status enum validation found');
  } else {
    logInfo('  Status validation check skipped');
  }
}

// Check database files for D1-safe ordering and atomic transactions
const dbFiles = findFiles('apps', /db.*\.ts$/);
for (const dbPath of dbFiles) {
  try {
    const content = readFileSync(dbPath, 'utf-8');
    
    if (content.includes('audit_events') || content.includes('tasks')) {
      logInfo(`Checking: ${dbPath}`);
      
      // D1-safe ordering (CASE expression instead of NULLS LAST)
      if (content.includes('CASE WHEN') && content.includes('due_date')) {
        logPass('  D1-safe ordering (CASE expression for NULLS LAST)');
      } else if (content.includes('NULLS LAST')) {
        logFail('  Uses NULLS LAST (not SQLite/D1 compatible)');
        errors++;
      } else {
        logInfo('  No special NULL handling (verify for D1 compatibility)');
      }
      
      // Check for atomic task + audit write pattern
      if (content.includes('batch') || content.includes('transaction') || content.includes('BEGIN')) {
        logPass('  Transaction support found for atomic writes');
      } else {
        logInfo('  No explicit transaction pattern found');
      }
    }
  } catch (e) {
    // Skip unreadable files
  }
}

// ============================================================
// CHECK 5: Migration file exists
// ============================================================
log('\n=== CHECK 5: Migration Files ===');

const migrationsDir = findFiles('apps', /.*/).filter(p => p.includes('migrations') && p.endsWith('.sql'));
if (migrationsDir.length > 0) {
  logPass(`Found ${migrationsDir.length} migration file(s)`);
} else {
  logInfo('No SQL migrations found (may use wrangler migrations)');
}

// ============================================================
// SUMMARY
// ============================================================
log('\n=== SUMMARY ===');

if (errors === 0 && warnings === 0) {
  log('All checks passed! ✓', GREEN);
  console.log('\n');
  process.exit(0);
} else if (errors === 0) {
  log(`${warnings} warning(s) found. Implementation looks good.`, YELLOW);
  console.log('\n');
  process.exit(0);
} else {
  log(`${errors} error(s) found. Fix before merging.`, RED);
  console.log('\n');
  process.exit(1);
}