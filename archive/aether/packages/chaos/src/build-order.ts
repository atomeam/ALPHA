/**
 * Build Order Analyzer
 * 
 * Determines the correct topological build order for all packages.
 * Packages must be built after their dependencies.
 * 
 * Usage: node packages/chaos/src/build-order.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const PACKAGES_DIR = './packages';

// Extract internal @aether/* imports
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
        
        const matches = content.match(/from ['"]@aether\/[^'")]+/g) || [];
        matches.forEach(m => {
          const pkg = m.replace(/from ['"]@aether\//, '').split('/')[0];
          imports.add(pkg);
        });
        
        const requireMatches = content.match(/require\(['"]@aether\/[^'")]+/g) || [];
        requireMatches.forEach(m => {
          const pkg = m.replace(/require\(['"]@aether\//, '').split('/')[0];
          imports.add(pkg);
        });
      }
    }
  }
  
  const srcPath = path.join(dirPath, 'src');
  if (fs.existsSync(srcPath)) walkDir(srcPath);
  else walkDir(dirPath);
  
  return imports;
}

// Build adjacency list (pkg -> packages it depends on)
function buildGraph(): Map<string, Set<string>> {
  const packageDirs = fs.readdirSync(PACKAGES_DIR).filter(name => {
    const pkgPath = path.join(PACKAGES_DIR, name);
    return fs.statSync(pkgPath).isDirectory();
  });
  
  const graph = new Map<string, Set<string>>();
  
  for (const dir of packageDirs) {
    const pkgPath = path.join(PACKAGES_DIR, dir);
    const deps = extractInternalImports(pkgPath);
    graph.set(dir, deps);
  }
  
  return graph;
}

// Kahn's algorithm for topological sort
function topologicalSort(): string[] {
  const graph = buildGraph();
  
  // Calculate in-degree (number of packages depending on each package)
  const inDegree = new Map<string, number>();
  for (const [node] of graph) {
    inDegree.set(node, 0);
  }
  
  for (const [, deps] of graph) {
    for (const dep of deps) {
      inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
    }
  }
  
  // Find all nodes with in-degree 0
  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }
  
  const result: string[] = [];
  
  while (queue.length > 0) {
    // Sort queue for deterministic order
    queue.sort();
    const node = queue.shift()!;
    result.push(node);
    
    const deps = graph.get(node) || new Set<string>();
    for (const dep of deps) {
      const newDegree = (inDegree.get(dep) || 1) - 1;
      inDegree.set(dep, newDegree);
      if (newDegree === 0) queue.push(dep);
    }
  }
  
  return result;
}

// Find critical path (longest chain of dependencies)
function findCriticalPath(): string[] {
  const graph = buildGraph();
  const visited = new Map<string, number>();
  
  function dfs(node: string): number {
    if (visited.has(node)) return visited.get(node)!;
    
    const deps = graph.get(node) || new Set<string>();
    if (deps.size === 0) return 0;
    
    let maxDepth = 0;
    for (const dep of deps) {
      if (graph.has(dep)) {
        const depth = dfs(dep);
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    
    const result = maxDepth + 1;
    visited.set(node, result);
    return result;
  }
  
  // Find node with longest path
  let maxNode = '';
  let maxDepth = 0;
  
  for (const [node] of graph) {
    const depth = dfs(node);
    if (depth > maxDepth) {
      maxDepth = depth;
      maxNode = node;
    }
  }
  
  // Reconstruct path
  const path: string[] = [maxNode];
  let current = maxNode;
  const seen = new Set<string>();
  
  while (!seen.has(current)) {
    seen.add(current);
    const deps = graph.get(current) || new Set<string>();
    let found = false;
    for (const dep of deps) {
      if (graph.has(dep)) {
        const depDepth = dfs(dep);
        if (depDepth === maxDepth - 1) {
          path.push(dep);
          current = dep;
          maxDepth = depDepth;
          found = true;
          break;
        }
      }
    }
    if (!found) break;
  }
  
  return path.reverse();
}

// Main
async function run(): Promise<void> {
  console.log('📦 Build Order Analyzer\n');
  console.log('='.repeat(50));
  
  const order = topologicalSort();
  const graph = buildGraph();
  
  console.log(`\n📦 ${graph.size} packages\n`);
  
  // Detect cycles (order length should equal graph size)
  if (order.length < graph.size) {
    console.log('⚠️  Warning: Circular dependencies detected!');
    console.log(`   Expected: ${graph.size}, Got: ${order.length}\n`);
  }
  
  console.log('🔧 BUILD ORDER (run first → build last):\n');
  
  // Group by dependency level
  const levels = new Map<string, string[]>();
  
  for (let i = 0; i < order.length; i++) {
    const pkg = order[i];
    const deps = graph.get(pkg) || new Set<string>();
    const level = deps.size === 0 ? 'leaf' : 'dependent';
    
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level)!.push(pkg);
  }
  
  // Print in order
  for (let i = 0; i < order.length; i++) {
    const pkg = order[i];
    const deps = graph.get(pkg) || new Set<string>();
    const internalDeps = [...deps].filter(d => graph.has(d));
    
    let label = '📦';
    if (internalDeps.length === 0) label = '🌿 leaf';
    else if (internalDeps.length === 1) label = '🪺 1 dep';
    else label = `🪺 ${internalDeps.length} deps`;
    
    console.log(`  ${i + 1}. ${label} ${pkg}`);
  }
  
  console.log('\n' + '='.repeat(50));
  
  // Critical path
  const criticalPath = findCriticalPath();
  console.log('\n⚡ CRITICAL PATH (longest chain):');
  console.log(`   ${criticalPath.join(' → ')}`);
  console.log(`   Length: ${criticalPath.length} hops`);
  
  // Summary stats
  const leafCount = order.filter(pkg => {
    const deps = graph.get(pkg) || new Set<string>();
    return deps.size === 0;
  }).length;
  
  console.log('\n📊 STATS:');
  console.log(`   Total packages: ${order.length}`);
  console.log(`   Leaf packages: ${leafCount} (no internal deps)`);
  console.log(`   Max depth: ${criticalPath.length}`);
  
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ Build order determined');
  console.log('\nTo build all packages, run in this order:');
  console.log(order.join(' → '));
}

run().catch(console.error);