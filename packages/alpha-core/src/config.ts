export const ALPHA_CONFIG = {
  blastRadius: {
    maxFiles: 3,
    maxNotionPages: 3,
    maxDatabaseSchemas: 1,
  },
  cooldown: {
    baseHours: 6,
    backoffMultiplier: 2,
    quarantineThresholdHalts24h: 3,
    quarantineDays: 7,
    quarantineMaxDays: 30,
  },
  canary: {
    waitCycles: 1,
  },
  autoRevert: {
    triggerMultiplier: 2,
  },
  loopCaps: {
    proposalsPerObserverCycle: 3,
  },
  curator: {
    requireOperatorForRiskAtOrAbove: 'medium',
  },
  reflector: {
    maxLagMinutes: 60,
  },
  amplitudeSchemaVersion: 'v1',
} as const;

export type AlphaConfig = typeof ALPHA_CONFIG;
