export type ProviderId =
  | 'notion'
  | 'slack'
  | 'sentry'
  | 'stripe'
  | 'hubspot'
  | 'amplitude'
  | 'linear'
  | 'gemini'
  | 'ollama'
  | 'retroarch';

export type ProviderStatus = 'configured' | 'available-local' | 'missing-secret' | 'not-configured';

export interface ProviderDefinition {
  id: ProviderId;
  displayName: string;
  purpose: string;
  inbound: 'webhook' | 'optional-webhook' | 'none';
  outbound: true;
  requiredEnv: string[];
  optionalEnv: string[];
  localOnly?: boolean;
  scopeExamples: string[];
}

export interface ProviderRuntime extends ProviderDefinition {
  status: ProviderStatus;
  configuredEnv: string[];
  missingEnv: string[];
}

export interface SourceRepo {
  id: 'aether' | 'homebase' | 'atomarcade-bridge' | 'crypto-cryptids' | 'broke' | 'alpha';
  name: string;
  url: string;
  role: string;
  target: string;
  status: 'connected' | 'empty' | 'current';
}

export const SOURCE_REPOS: SourceRepo[] = [
  {
    id: 'alpha',
    name: 'atomeam/ALPHA',
    url: 'https://github.com/atomeam/ALPHA',
    role: 'Consolidated AtoMind monorepo and trust-first router',
    target: 'root',
    status: 'current',
  },
  {
    id: 'aether',
    name: 'atomeam/Aether',
    url: 'https://github.com/atomeam/Aether',
    role: 'Axiom operator UI, Nexus gateway, MCP shell, neural bridge patterns',
    target: 'apps/frontend, apps/backend, packages/nexus-core, packages/mcp-core',
    status: 'connected',
  },
  {
    id: 'homebase',
    name: 'atomeam/HomeBase-',
    url: 'https://github.com/atomeam/HomeBase-',
    role: 'Alpha loop prompts, backend health, Curator and Applier runtime',
    target: 'apps/backend, apps/frontend, packages/alpha-core',
    status: 'connected',
  },
  {
    id: 'atomarcade-bridge',
    name: 'atomeam/atomarcade-bridge',
    url: 'https://github.com/atomeam/atomarcade-bridge',
    role: 'PowerShell bridge, Notion command bus, RetroArch UDP controls',
    target: 'apps/bridge, integrations/notion, integrations/retroarch',
    status: 'connected',
  },
  {
    id: 'crypto-cryptids',
    name: 'atomeam/Crypto-Cryptids',
    url: 'https://github.com/atomeam/Crypto-Cryptids',
    role: 'Python RPG sidecar kept isolated from the Node runtime',
    target: 'apps/crypto-cryptids',
    status: 'connected',
  },
  {
    id: 'broke',
    name: 'atomeam/Broke',
    url: 'https://github.com/atomeam/Broke',
    role: 'Empty source repository archived for completeness',
    target: 'archive/broke',
    status: 'empty',
  },
];

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'notion',
    displayName: 'Notion',
    purpose: 'Database/page read-write and command bus webhooks',
    inbound: 'webhook',
    outbound: true,
    requiredEnv: ['NOTION_TOKEN'],
    optionalEnv: [
      'NOTION_DATABASE_ID',
      'NOTION_AUTO_DB_ID',
      'NOTION_LOG_DB_ID',
      'NOTION_WEBHOOK_SECRET',
    ],
    scopeExamples: ['notion:db:read:<id>', 'notion:db:write:<id>'],
  },
  {
    id: 'slack',
    displayName: 'Slack',
    purpose: 'Channel notifications and slash command entry points',
    inbound: 'webhook',
    outbound: true,
    requiredEnv: ['SLACK_BOT_TOKEN'],
    optionalEnv: ['SLACK_SIGNING_SECRET'],
    scopeExamples: ['slack:channel:post:<id>', 'slack:dm:post:<userId>'],
  },
  {
    id: 'sentry',
    displayName: 'Sentry',
    purpose: 'Error capture and project/event context',
    inbound: 'optional-webhook',
    outbound: true,
    requiredEnv: ['SENTRY_DSN'],
    optionalEnv: [],
    scopeExamples: ['sentry:event:capture:<dsn>', 'sentry:project:read:<slug>'],
  },
  {
    id: 'stripe',
    displayName: 'Stripe',
    purpose: 'Customer and payment operations',
    inbound: 'webhook',
    outbound: true,
    requiredEnv: ['STRIPE_SECRET_KEY'],
    optionalEnv: ['STRIPE_WEBHOOK_SECRET'],
    scopeExamples: ['stripe:customers:read', 'stripe:charges:create'],
  },
  {
    id: 'hubspot',
    displayName: 'HubSpot',
    purpose: 'CRM contacts and deals',
    inbound: 'optional-webhook',
    outbound: true,
    requiredEnv: ['HUBSPOT_ACCESS_TOKEN'],
    optionalEnv: [],
    scopeExamples: ['hubspot:contacts:read', 'hubspot:contacts:write'],
  },
  {
    id: 'amplitude',
    displayName: 'Amplitude',
    purpose: 'Event capture, identify, and measurable Alpha outcomes',
    inbound: 'none',
    outbound: true,
    requiredEnv: ['AMPLITUDE_API_KEY'],
    optionalEnv: [],
    scopeExamples: ['amplitude:event:capture', 'amplitude:user:identify'],
  },
  {
    id: 'linear',
    displayName: 'Linear',
    purpose: 'Issue read and creation workflows',
    inbound: 'webhook',
    outbound: true,
    requiredEnv: ['LINEAR_API_KEY'],
    optionalEnv: [],
    scopeExamples: ['linear:issues:read:<teamId>', 'linear:issues:create:<teamId>'],
  },
  {
    id: 'gemini',
    displayName: 'Gemini',
    purpose: 'Server-side LLM inference for Alpha prompts',
    inbound: 'none',
    outbound: true,
    requiredEnv: ['GEMINI_API_KEY'],
    optionalEnv: ['GEMINI_MODEL'],
    scopeExamples: ['gemini:model:<name>:invoke'],
  },
  {
    id: 'ollama',
    displayName: 'Ollama',
    purpose: 'Local neural bridge inference endpoint',
    inbound: 'none',
    outbound: true,
    requiredEnv: ['NEURAL_BRIDGE_URL'],
    optionalEnv: [],
    localOnly: true,
    scopeExamples: ['ollama:model:<name>:invoke'],
  },
  {
    id: 'retroarch',
    displayName: 'RetroArch',
    purpose: 'UDP command queue through the PowerShell bridge',
    inbound: 'none',
    outbound: true,
    requiredEnv: ['RETROARCH_HOST', 'RETROARCH_PORT'],
    optionalEnv: ['ATOMARCADE_ALLOW_HIGH_RISK'],
    localOnly: true,
    scopeExamples: ['retroarch:udp:send:<cmd>'],
  },
];

export function resolveProviderRuntime(env: Record<string, string | undefined>): ProviderRuntime[] {
  return PROVIDERS.map((provider) => {
    const configuredEnv = provider.requiredEnv.filter((key) => Boolean(env[key]));
    const missingEnv = provider.requiredEnv.filter((key) => !env[key]);
    const status: ProviderStatus =
      missingEnv.length === 0
        ? provider.localOnly
          ? 'available-local'
          : 'configured'
        : configuredEnv.length > 0
          ? 'missing-secret'
          : 'not-configured';

    return { ...provider, status, configuredEnv, missingEnv };
  });
}

export function findProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}
