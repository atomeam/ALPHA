/**
 * Circular Dependency Detector
 * 
 * Scans all packages to detect circular import chains.
 * A → B → C → A is a cycle that causes build issues.
 * 
 * Usage: node packages/chaos/src/circular-deps.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const PACKAGES_DIR = './packages';

interface PackageInfo {
  name: string;
  path: string;
  internalImports: Set<string>; // @aether/* imports
}

// Extract internal @aether/* imports from TypeScript/JavaScript files
function extractInternalImports(dirPath: string): Set<string> {
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
        const matches = content.match(/from ['"]@aether\/[^'")]+/g) || [];
        matches.forEach(m => {
          const pkg = m.replace(/from ['"]@aether\//, '').split('/')[0];
          imports.add(`@aether/${pkg}`);
        });
        
        // Match require('@aether/...')
        const requireMatches = content.match(/require\(['"]@aether\/[^'")]+/g) || [];
        requireMatches.forEach(m => {
          const pkg = m.replace(/require\(['"]@aether\//, '').split('/')[0];
          imports.add(`@aether/${pkg}`);
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

// Build adjacency list: pkg -> Set of packages it imports
function buildGraph(): Map<string, Set<string>> {
  const packageDirs = fs.readdirSync(PACKAGES_DIR).filter(name => {
    const pkgPath = path.join(PACKAGES_DIR, name);
    return fs.statSync(pkgPath).isDirectory();
  });
  
  const graph = new Map<string, Set<string>>();
  
  for (const dir of packageDirs) {
    const pkgPath = path.join(PACKAGES_DIR, dir);
    const internalImports = extractInternalImports(pkgPath);
    graph.set(dir, internalImports);
  }
  
  return graph;
}

// DFS-based cycle detection with path tracking
function findCycles(): Map<string, string[]> {
  const graph = buildGraph();
  const cycles = new Map<string, string[]>();
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];
  
  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    
    const deps = graph.get(node) || new Set<string>();
    
    for (const dep of deps) {
      const target = dep.replace('@aether/', '');
      
      if (!graph.has(target)) continue; // External package, skip
      
      if (!recursionStack.has(target)) {
        dfs(target);
      } else if (recursionStack.has(target)) {
        // Cycle detected! Extract the cycle path
        const cycleStart = path.indexOf(target);
        const cycle = path.slice(cycleStart);
        cycle.push(target); // Close the loop
        
        const cycleKey = cycle.join(' → ');
        if (!cycles.has(cycleKey)) {
          cycles.set(cycleKey, cycle);
        }
      }
    }
    
    path.pop();
    recursionStack.delete(node);
  }
  
  // Run DFS from each unvisited node
  for (const [node] of graph) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }
  
  return cycles;
}

// Alternative: transitive closure to find all paths between packages
function findAllCircularPaths(): Array<{ from: string; to: string; path: string[] }> {
  const graph = buildGraph();
  const circulars: Array<{ from: string; to: string; path: string[] }> = [];
  
  function canReach(start: string, target: string, visited: Set<string>, path: string[]): boolean {
    if (start === target) return path.length > 0;
    if (visited.has(start)) return false;
    
    visited.add(start);
    const deps = graph.get(start) || new Set<string>();
    
    for (const dep of deps) {
      const next = dep.replace('@aether/', '');
      if (graph.has(next) && canReach(next, target, new Set(visited), [...path, next])) {
        return true;
      }
    }
    return false;
  }
  
  // Check each pair
  for (const [from] of graph) {
    for (const [to] of graph) {
      if (from === to) continue;
      if (canReach(from, to, new Set(), [from])) {
        // Now check if to can reach back to from (circular)
        if (canReach(to, from, new Set(), [to])) {
          // Find the shortest cycle
          const cyclePath = findShortestCycle(from, to, graph);
          if (cyclePath) {
            circulars.push({ from, to, path: cyclePath });
          }
        }
      }
    }
  }
  
  return circulars;
}

function findShortestCycle(start: string, target: string, graph: Map<string, Set<string>>): string[] | null {
  // BFS to find shortest path from target back to start
  const queue: Array<{ node: string; path: string[] }> = [];
  const visited = new Set<string>();
  
  queue.push({ node: target, path: [target] });
  
  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    
    if (node === start && path.length > 1) {
      return path.reverse();
    }
    
    if (visited.has(node)) continue;
    visited.add(node);
    
    const deps = graph.get(node) || new Set<string>();
    for (const dep of deps) {
      const next = dep.replace('@aether/', '');
      if (graph.has(next) && !visited.has(next)) {
        queue.push({ node: next, path: [...path, next] });
      }
    }
  }
  
  return null;
}

// Main
async function run(): Promise<void> {
  console.log('🔄 Circular Dependency Detector\n');
  console.log('='.repeat(50));
  
  const graph = buildGraph();
  console.log(`\n📦 Built graph for ${graph.size} packages`);
  
  // Simple DFS cycle detection
  const cycles = findCycles();
  
  console.log(`\n📊 RESULTS\n`);
  console.log('='.repeat(50));
  
  if (cycles.size === 0) {
    console.log('\n✅ No circular dependencies detected!');
    console.log('   The package graph is clean.');
  } else {
    console.log(`\n🔴 CIRCULAR DEPENDENCIES FOUND: ${cycles.size}`);
    console.log('');
    
    for (const [cycleKey, cycle] of cycles) {
      console.log(`  🔄 ${cycle.join(' → ')}`);
    }
  }
  
  // Also show package interconnectivity stats
  console.log('\n📈 INTERCONNECTIVITY');
  
  const stats: Array<{ pkg: string; imports: number; importedBy: number }> = [];
  
  for (const [pkg, imports] of graph) {
    let importedBy = 0;
    for (const [other, otherImports] of graph) {
      if (other !== pkg && otherImports.has(`@aether/${pkg}`)) {
        importedBy++;
      }
    }
    stats.push({ pkg, imports: imports.size, importedBy });
  }
  
  // Top importers
  stats.sort((a, b) => b.importedBy - a.importedBy);
  
  console.log('\n  Top referenced packages:');
  for (const { pkg, importedBy } of stats.slice(0, 5)) {
    console.log(`    ${pkg}: imported by ${importedBy} packages`);
  }
  
  // Most dependent (imports most)
  stats.sort((a, b) => b.imports - a.imports);
  console.log('\n  Most dependent packages:');
  for (const { pkg, imports } of stats.slice(0, 5)) {
    console.log(`    ${pkg}: imports ${imports} packages`);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`\n✅ Scan complete`);
}

run().catch(console.error);