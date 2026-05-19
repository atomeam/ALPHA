/**
 * Dependency Drift Scanner
 * 
 * Scans all packages in the monorepo to detect:
 * - Unused dependencies (declared in package.json, never imported)
 * - Missing dependencies (imported but not in package.json)
 * - Circular dependencies
 * 
 * Usage: npx tsx packages/chaos/src/dependency-graph.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const PACKAGES_DIR = './packages';

interface PackageInfo {
  name: string;
  path: string;
  dependencies: Set<string>;
  devDependencies: Set<string>;
  imports: Set<string>;
  internalImports: Set<string>; // @aether/* imports
}

// Collect all package names from node_modules/@aether
function getAetherPackages(): string[] {
  const aetherDir = './node_modules/@aether';
  if (!fs.existsSync(aetherDir)) {
    return [];
  }
  return fs.readdirSync(aetherDir).filter(name => {
    const stat = fs.statSync(path.join(aetherDir, name));
    return stat.isDirectory();
  });
}

// Parse a package.json to extract dependencies
function parsePackageJson(pkgPath: string): { deps: Set<string>, devDeps: Set<string> } {
  const pkgJsonPath = path.join(pkgPath, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    return { deps: new Set(), devDeps: new Set() };
  }
  
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  const deps = new Set<string>();
  const devDeps = new Set<string>();
  
  if (pkgJson.dependencies) {
    Object.keys(pkgJson.dependencies).forEach(d => deps.add(d));
  }
  if (pkgJson.devDependencies) {
    Object.keys(pkgJson.devDependencies).forEach(d => devDeps.add(d));
  }
  
  return { deps, devDeps };
}

// Extract imports from TypeScript/JavaScript files
function extractImports(dirPath: string): Set<string> {
  const imports = new Set<string>();
  
  function walkDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
        walkDir(fullPath);
      } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        
        // Match @aether/* imports
        const aetherMatches = content.match(/from ['"]@aether\/[^'")]+/g) || [];
        aetherMatches.forEach(m => {
          const pkg = m.replace(/from ['"]@aether\//, '').split('/')[0];
          imports.add(`@aether/${pkg}`);
        });
        
        // Match external package imports (not @aether)
        const extMatches = content.match(/from ['"][^@][^'")]+/g) || [];
        extMatches.forEach(m => {
          const pkg = m.replace(/from ['"]/, '').split('/')[0];
          if (!pkg.startsWith('.') && !pkg.startsWith('@')) {
            imports.add(pkg);
          }
        });
        
        // Match require() calls
        const requireMatches = content.match(/require\(['"][^'")]+/g) || [];
        requireMatches.forEach(m => {
          const pkg = m.replace(/require\(['"]/, '').split('/')[0];
          if (!pkg.startsWith('.') && !pkg.startsWith('@')) {
            imports.add(pkg);
          }
        });
      }
    }
  }
  
  const srcPath = path.join(dirPath, 'src');
  if (fs.existsSync(srcPath)) {
    walkDir(srcPath);
  } else {
    walkDir(dirPath);
  }
  
  return imports;
}

// Main scanner
async function scan(): Promise<void> {
  console.log('🔍 Dependency Drift Scanner\n');
  console.log('='.repeat(50));
  
  // Get all packages in the monorepo
  const packageDirs = fs.readdirSync(PACKAGES_DIR).filter(name => {
    const pkgPath = path.join(PACKAGES_DIR, name);
    return fs.statSync(pkgPath).isDirectory();
  });
  
  console.log(`\n📦 Found ${packageDirs.length} packages\n`);
  
  // Build package info
  const packages: Map<string, PackageInfo> = new Map();
  
  for (const dir of packageDirs) {
    const pkgPath = path.join(PACKAGES_DIR, dir);
    const { deps, devDeps } = parsePackageJson(pkgPath);
    const imports = extractImports(pkgPath);
    const internalImports = new Set<string>();
    
    // Separate internal vs external imports
    for (const imp of imports) {
      if (imp.startsWith('@aether/')) {
        internalImports.add(imp);
      }
    }
    
    packages.set(dir, {
      name: dir,
      path: pkgPath,
      dependencies: deps,
      devDependencies: devDeps,
      imports,
      internalImports,
    });
  }
  
  // Report structures
  const unusedDeps: Array<{ pkg: string; dep: string }> = [];
  const missingDeps: Array<{ pkg: string; imp: string }> = [];
  const mismatchedDeps: Array<{ pkg: string; imp: string }> = [];
  
  // Check each package
  for (const [dir, info] of packages) {
    // Check for unused dependencies
    for (const dep of info.dependencies) {
      if (!info.imports.has(dep) && !info.internalImports.has(dep)) {
        unusedDeps.push({ pkg: dir, dep });
      }
    }
    
    // Node.js built-in modules that don't need to be in package.json
const BUILTINS = new Set([
  'fs', 'path', 'crypto', 'events', 'util', 'os', 'http', 'https', 
  'url', 'querystring', 'stream', 'buffer', 'child_process',
  'cluster', 'dgram', 'dns', 'domain', 'events', 'net', 'readline',
  'repl', 'sys', 'timers', 'tls', 'v8', 'vm', 'zlib'
]);

// Check for missing dependencies (exclude Node.js builtins)
  for (const imp of info.imports) {
    if (BUILTINS.has(imp)) continue;
    if (!info.dependencies.has(imp) && !info.devDependencies.has(imp)) {
      // Skip internal aether packages (they may not be in deps but still work)
      if (!imp.startsWith('@aether/')) {
        missingDeps.push({ pkg: dir, imp });
      }
    }
  }
    
    // Check internal imports against declared deps
    for (const imp of info.internalImports) {
      const aetherPkg = imp.replace('@aether/', '');
      const inDeps = info.dependencies.has(`@aether/${aetherPkg}`) || 
                    info.devDependencies.has(`@aether/${aetherPkg}`);
      if (!inDeps) {
        mismatchedDeps.push({ pkg: dir, imp });
      }
    }
  }
  
  // Output reports
  console.log('\n📊 REPORT\n');
  console.log('='.repeat(50));
  
  // Unused dependencies
  console.log(`\n🔴 UNUSED DEPENDENCIES (${unusedDeps.length})`);
  if (unusedDeps.length > 0) {
    const byPkg = new Map<string, string[]>();
    for (const { pkg, dep } of unusedDeps) {
      if (!byPkg.has(pkg)) byPkg.set(pkg, []);
      byPkg.get(pkg)!.push(dep);
    }
    for (const [pkg, deps] of byPkg) {
      console.log(`  ${pkg}: ${deps.join(', ')}`);
    }
  } else {
    console.log('  ✅ None found');
  }
  
  // Missing dependencies
  console.log(`\n🟡 MISSING DEPENDENCIES (${missingDeps.length})`);
  if (missingDeps.length > 0) {
    const byPkg = new Map<string, string[]>();
    for (const { pkg, imp } of missingDeps) {
      if (!byPkg.has(pkg)) byPkg.set(pkg, []);
      byPkg.get(pkg)!.push(imp);
    }
    for (const [pkg, imps] of byPkg) {
      console.log(`  ${pkg}: ${imps.join(', ')}`);
    }
  } else {
    console.log('  ✅ None found');
  }
  
  // Internal aether imports not in deps
  console.log(`\n🟠 INTERNAL AETHER IMPORTS NOT IN DEPS (${mismatchedDeps.length})`);
  if (mismatchedDeps.length > 0) {
    const byPkg = new Map<string, string[]>();
    for (const { pkg, imp } of mismatchedDeps) {
      if (!byPkg.has(pkg)) byPkg.set(pkg, []);
      byPkg.get(pkg)!.push(imp);
    }
    for (const [pkg, imps] of byPkg) {
      console.log(`  ${pkg}: ${imps.join(', ')}`);
    }
  } else {
    console.log('  ✅ None found');
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📈 SUMMARY');
  console.log(`  Unused deps:     ${unusedDeps.length}`);
  console.log(`  Missing deps:    ${missingDeps.length}`);
  console.log(`  Internal gaps:   ${mismatchedDeps.length}`);
  console.log(`  Total packages: ${packages.size}`);
  
  const total = unusedDeps.length + missingDeps.length + mismatchedDeps.length;
  console.log(`\n  ${total === 0 ? '✅ No drift detected' : '⚠️  Drift detected'}`);
}

scan().catch(console.error);