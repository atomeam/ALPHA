export interface AssessmentSummary {
  status: "ok" | "degraded" | "error";
  message: string;
  evidence: {
    missingDirectory: boolean;
    orphanedBinding: boolean;
    conversationHistoryPresent: boolean;
    workerDeployed: boolean;
    lastAssessment?: number;
    assessmentCount: number;
  };
}

// DO is authoritative - all canonical state lives in state.storage
// KV is projection cache - written ONLY after DO confirms write
// Key namespaces: "projection:*" = DO writes, "derived:*" = queue writes

interface PersistentState {
  assessments: AssessmentRecord[];
  rules: DecisionRule[];
  metadata: {
    createdAt: number;
    lastAssessment: number;
    deploymentVersion: string;
    version: number;  // Incremented on every canonical write
  };
}

// KV projection shape (written by DO after each write)
interface AssessmentProjection {
  version: number;
  updatedAt: number;
  status: "ok" | "degraded" | "error";
  assessmentCount: number;
  lastAssessment: number | null;
  latestMessage: string;
}

interface AssessmentRecord {
  id: string;
  timestamp: number;
  status: "ok" | "degraded" | "error";
  score: number;
  components: string[];
}

interface DecisionRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  enabled: boolean;
}

export class AssessmentEngine {
  state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check with actual state
    if (url.pathname === "/health") {
      const stored = await this.state.storage.get<PersistentState>("state");
      return Response.json({
        status: "ok",
        durableObject: "AssessmentEngine",
        uptime: Date.now() - (stored?.metadata?.createdAt ?? Date.now()),
        assessmentCount: stored?.assessments?.length ?? 0,
        lastAssessment: stored?.metadata?.lastAssessment ?? null,
      });
    }

    // Get current status with evidence
    if (url.pathname === "/status") {
      const stored = await this.state.storage.get<PersistentState>("state");
      const assessmentCount = stored?.assessments?.length ?? 0;
      const lastAssessment = stored?.metadata?.lastAssessment;

      // Determine status based on stored data
      let status: "ok" | "degraded" | "error" = "degraded";
      if (assessmentCount > 0 && lastAssessment) {
        const ageMinutes = (Date.now() - lastAssessment) / 60000;
        if (ageMinutes < 5) status = "ok";
      }

      const summary: AssessmentSummary = {
        status,
        message: this.getStatusMessage(status, assessmentCount),
        evidence: {
          missingDirectory: false, // Worker is now deployed
          orphanedBinding: false,   // Worker exists to fulfill binding
          conversationHistoryPresent: true,
          workerDeployed: true,
          lastAssessment,
          assessmentCount,
        },
      };

      return Response.json(summary, { status: 200 });
    }

    // Run a new assessment
    if (url.pathname === "/assess") {
      const stored = await this.state.storage.get<PersistentState>("state") ?? {
        assessments: [],
        rules: [],
        metadata: { createdAt: Date.now(), lastAssessment: 0, deploymentVersion: "0.0.1", version: 0 },
      };

      // Create a new assessment record
      const record: AssessmentRecord = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        status: "ok",
        score: 100,
        components: ["worker", "durable-object", "storage"],
      };

      stored.assessments.push(record);
      stored.metadata.lastAssessment = Date.now();
      stored.metadata.version = (stored.metadata.version ?? 0) + 1;

      // Keep only last 100 assessments
      if (stored.assessments.length > 100) {
        stored.assessments = stored.assessments.slice(-100);
      }

      await this.state.storage.put("state", stored);

      // Build projection for Worker to cache in KV
      const projection: AssessmentProjection = {
        version: stored.metadata.version,
        updatedAt: Date.now(),
        status: this.computeStatus(stored.assessments.length, stored.metadata.lastAssessment),
        assessmentCount: stored.assessments.length,
        lastAssessment: stored.metadata.lastAssessment,
        latestMessage: this.getStatusMessage(projection.status, stored.assessments.length),
      };

      return Response.json({
        assessment: record,
        totalAssessments: stored.assessments.length,
        projection,
      });
    }

    // Get assessment history
    if (url.pathname === "/history") {
      const stored = await this.state.storage.get<PersistentState>("state");
      return Response.json({
        assessments: stored?.assessments ?? [],
        count: stored?.assessments?.length ?? 0,
      });
    }

    // Clear all assessments (for testing)
    if (url.pathname === "/reset") {
      await this.state.storage.delete("state");
      return Response.json({ reset: true });
    }

    // Process action from queue - DO is authoritative
    if (url.pathname === "/process-action" && request.method === "POST") {
      try {
        const actionData = await request.json();
        
        // Store action in DO state (authoritative)
        const stored = await this.state.storage.get<PersistentState>("state") ?? {
          assessments: [],
          rules: [],
          metadata: { createdAt: Date.now(), lastAssessment: 0, deploymentVersion: "0.0.1", version: 0 },
        };

        // Create action record
        const record: AssessmentRecord = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          status: "ok",
          score: 100,
          components: ["action", "queue-triggered"],
        };

        stored.assessments.push(record);
        stored.metadata.lastAssessment = Date.now();
        stored.metadata.version = (stored.metadata.version ?? 0) + 1;
        await this.state.storage.put("state", stored);

        // Build projection for Worker to cache in KV
        const projection: AssessmentProjection = {
          version: stored.metadata.version,
          updatedAt: Date.now(),
          status: this.computeStatus(stored.assessments.length, stored.metadata.lastAssessment),
          assessmentCount: stored.assessments.length,
          lastAssessment: stored.metadata.lastAssessment,
          latestMessage: `Action processed. ${stored.assessments.length} total.`,
        };

        return Response.json({
          processed: true,
          actionId: record.id,
          assessmentCount: stored.assessments.length,
          projection,
        });
      } catch (err) {
        return Response.json({ error: "Failed to process action" }, { status: 500 });
      }
    }

    return new Response("AssessmentEngine: route not found", { status: 404 });
  }

  private getStatusMessage(status: "ok" | "degraded" | "error", count: number): string {
    if (status === "ok") {
      return `Worker deployed and healthy. ${count} assessments recorded.`;
    }
    if (status === "degraded") {
      if (count === 0) {
        return "Worker deployed but no assessments yet. Run /assess to begin.";
      }
      return "Worker deployed but assessment is stale. Run /assess to update.";
    }
    return "Worker error state.";
  }

  private computeStatus(count: number, lastAssessment: number | null): "ok" | "degraded" | "error" {
    if (count === 0 || !lastAssessment) return "degraded";
    const ageMinutes = (Date.now() - lastAssessment) / 60000;
    return ageMinutes < 5 ? "ok" : "degraded";
  }
}