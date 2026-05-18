import { SOURCE_REPOS, resolveProviderRuntime } from '@alpha/nexus-core';

export interface StackSnapshot {
  generatedAt: string;
  sourceRepos: typeof SOURCE_REPOS;
  providers: ReturnType<typeof resolveProviderRuntime>;
  ports: {
    backend: number;
    frontend: number;
    bridge: number;
    retroarchUdp: number;
  };
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createStackSnapshot(env: Record<string, string | undefined>): StackSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    sourceRepos: SOURCE_REPOS,
    providers: resolveProviderRuntime(env),
    ports: {
      backend: numberFromEnv(env.PORT, 8080),
      frontend: 5173,
      bridge: numberFromEnv(env.BRIDGE_PORT, 8090),
      retroarchUdp: numberFromEnv(env.RETROARCH_PORT, 55355),
    },
  };
}
