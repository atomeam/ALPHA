import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolve a short git SHA for /api/health.
 * Order: env (GIT_SHA / K_REVISION / GITHUB_SHA) → repo `.git/HEAD` → "unknown".
 */
export function readGitSha(repoRoot: string): string {
  const fromEnv = process.env.GIT_SHA ?? process.env.K_REVISION ?? process.env.GITHUB_SHA;
  if (fromEnv) return String(fromEnv).slice(0, 7);

  try {
    const headPath = join(repoRoot, '.git', 'HEAD');
    if (!existsSync(headPath)) return 'unknown';
    const head = readFileSync(headPath, 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const refPath = join(repoRoot, '.git', head.slice(5).trim());
      if (existsSync(refPath)) return readFileSync(refPath, 'utf8').trim().slice(0, 7);
    }
    return head.slice(0, 7);
  } catch {
    return 'unknown';
  }
}
