/**
 * Integration Manager - stub for @aether/bridge
 * The actual integration logic lives in apps/backend
 */
export class IntegrationManager {
  constructor(_configPath?: string) {}
  
  async connect() {
    return { connected: true, timestamp: Date.now() };
  }
}
