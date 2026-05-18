import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readGitSha(env: NodeJS.ProcessEnv = process.env, repoRoot = process.cwd()): string {
  const fromEnv = env.GIT_SHA ?? env.K_REVISION ?? env.GITHUB_SHA;

  if (fromEnv) {
    return fromEnv.slice(0, 7);
  }

  try {
    const headPath = join(repoRoot, '.git', 'HEAD');

    if (!existsSync(headPath)) {
      return 'unknown';
    }

    const head = readFileSync(headPath, 'utf8').trim();

    if (head.startsWith('ref: ')) {
      const refPath = join(repoRoot, '.git', head.slice(5).trim());

      if (existsSync(refPath)) {
        return readFileSync(refPath, 'utf8').trim().slice(0, 7);
      }
    }

    return head.slice(0, 7);
  } catch {
    return 'unknown';
  }
}
