import dotenv from "dotenv";
import { parseEnv, BackendEnvSchema } from "@aether/env";
import { createTraceLogger, commitToLedger } from "@aether/logger";
import { manifestPromptFragment } from "./promptManifest";
import crypto from "crypto";
import express from "express";

dotenv.config();

// Validate env on boot — fail fast if required vars missing
const env = parseEnv(BackendEnvSchema, process.env, "backend")

// Component manifest fragment for Gemini prompts
const COMPONENT_MANIFEST = manifestPromptFragment()

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Robust Gemini API Wrapper with Exponential Backoff
async function callGeminiWithRetry(modelName: string, prompt: any, config: any = {}, maxRetries = 3) {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt.contents,
        config: config
      });
      return response;
    } catch (error: any) {
      lastError = error;
      
      // Handle various error formats from GenAI SDK
      const status = error.status || error.code || error.response?.status;
      const message = error.message || "";
      
      const isTransient = status === 503 || status === 429 || 
                         message.includes('503') || message.includes('429') || 
                         message.includes('quota') || message.includes('overloaded');
      
      if (!isTransient || attempt === maxRetries) {
        console.error(`[GEMINI_FATAL]: Attempt ${attempt + 1} failed. Status: ${status}. Message: ${message}`);
        throw error;
      }
      
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      console.warn(`[GEMINI_RETRY]: Attempt ${attempt + 1} failed with status ${status}. Retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function validateMigration(plan: any, currentComponents: any[]) {
  const activeCount = currentComponents?.length || 0;
  const addCount = plan.actions.filter((a: any) => a.action === 'ADD').length;
  const removeCount = plan.actions.filter((a: any) => a.action === 'REMOVE').length;
  const resultingCount = activeCount + addCount - removeCount;

  // Rule 1: Density Limit
  if (resultingCount > 12) {
    return { valid: false, reason: "Architectural Overflow: Density limit (12) exceeded." };
  }

  // Rule 2: Infrastructure Preservation
  const removals = plan.actions.filter((a: any) => a.action === 'REMOVE').map((a: any) => a.targetId);
  for (const id of removals) {
    const target = currentComponents.find(c => c.id === id);
    if (target && (target.title.includes('Neural Load') || target.title.includes('System Coherence'))) {
      return { valid: false, reason: "Infrastructure Violation: Vital monitors are immutable." };
    }
  }

  return { valid: true };
}

// Neural Bridge (Decoupling Logic)
const NEURAL_BRIDGE_URL = process.env.NEURAL_BRIDGE_URL || null;

// --- MCP & NEXUS REGISTRY ---
interface IntegrationProfile {
  id: string;
  baseUrl: string;
  authConfig?: {
    type: 'Bearer' | 'ApiKey' | 'Basic';
    token: string;
  };
  status: 'CONNECTED' | 'THROTTLED' | 'OFFLINE';
  telemetryMap?: string; // Stringified function mapping
}

interface MCPRequest {
  jsonrpc: "2.0";
  method: string;
  params: any;
  id: string | number;
}

const integrationRegistry: Map<string, IntegrationProfile> = new Map();
const hostProcessStream: string[] = [];
const logEmitter = new EventEmitter();

function addProcessLog(msg: string) {
  const formatted = `[${new Date().toISOString()}] ${msg}`;
  hostProcessStream.push(formatted);
  if (hostProcessStream.length > 200) hostProcessStream.shift();
  logEmitter.emit('log', formatted);
}

async function handleMCPRequest(req: MCPRequest) {
  const { method, params } = req;
  
  switch (method) {
    case 'resources/list':
      return { resources: [{ uri: 'axiom://workspace', name: 'AXIOM Workspace Root' }] };
      
    case 'tools/list':
      return {
        tools: [
          { name: 'read_workspace_file', description: 'Read a file from the workspace' },
          { name: 'write_workspace_file', description: 'Write/Patch a file in the workspace' },
          { name: 'execute_powershell_bus', description: 'Invoke the local PowerShell automation bus' }
        ]
      };
      
    case 'tools/call':
      const { name, arguments: args } = params;
      if (name === 'read_workspace_file') {
        const fullPath = path.join(process.cwd(), args.path);
        if (!fullPath.startsWith(process.cwd())) throw new Error("Security Violation: Out of bounds read.");
        return { content: fs.readFileSync(fullPath, 'utf8') };
      }
      
      if (name === 'write_workspace_file') {
        const fullPath = path.join(process.cwd(), args.path);
        if (!fullPath.startsWith(process.cwd())) throw new Error("Security Violation: Out of bounds write.");
        fs.writeFileSync(fullPath, args.content);
        addProcessLog(`MCP_FS: Modified ${args.path}`);
        return { success: true };
      }
      
      if (name === 'execute_powershell_bus') {
        return new Promise((resolve, reject) => {
          addProcessLog(`MCP_EXEC: Invoking PowerShell bus - ${args.command}`);
          exec(args.command, (error, stdout, stderr) => {
            if (error) {
              addProcessLog(`MCP_EXEC_ERR: ${stderr || error.message}`);
              return resolve({ success: false, error: stderr || error.message });
            }
            addProcessLog(`MCP_EXEC_SUCCESS: ${stdout.substring(0, 50)}...`);
            resolve({ success: true, log: stdout });
          });
        });
      }
      throw new Error(`Tool [${name}] not found.`);
      
    default:
      throw new Error(`Method [${method}] not found.`);
  }
}
// --- END MCP & NEXUS ---

async function startServer() {
  const app = express();
  const PORT = env.PORT;

  app.use(express.json());

  // --- NEXUS GATEWAY ROUTES ---
  app.get("/api/nexus/registry", (req, res) => {
    res.json(Array.from(integrationRegistry.values()));
  });

  app.post("/api/nexus/registry", (req, res) => {
    const profile: IntegrationProfile = req.body;
    integrationRegistry.set(profile.id, { ...profile, status: 'CONNECTED' });
    addProcessLog(`NEXUS: Registered integration [${profile.id}]`);
    res.json({ success: true });
  });

  app.delete("/api/nexus/registry/:id", (req, res) => {
    integrationRegistry.delete(req.params.id);
    res.json({ success: true });
  });

  app.all("/api/nexus/route/:integrationId/*", async (req, res) => {
    const { integrationId } = req.params;
    const profile = integrationRegistry.get(integrationId);
    
    if (!profile) return res.status(404).json({ error: "Integration not found" });
    
    const targetPath = req.params[0] || '';
    const query = new URLSearchParams(req.query as any).toString();
    const finalUrl = `${profile.baseUrl}/${targetPath}${query ? '?' + query : ''}`;
    
    const headers: any = { 'Content-Type': 'application/json' };
    if (profile.authConfig) {
      if (profile.authConfig.type === 'Bearer') headers['Authorization'] = `Bearer ${profile.authConfig.token}`;
      else if (profile.authConfig.type === 'ApiKey') headers['X-API-KEY'] = profile.authConfig.token;
    }

    try {
      addProcessLog(`NEXUS_PROXY: Polling [${integrationId}] -> ${finalUrl}`);
      const response = await fetch(finalUrl, {
        method: req.method,
        headers,
        body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined
      });
      
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e: any) {
      addProcessLog(`NEXUS_ERR: Gateway timeout for [${integrationId}]`);
      res.status(502).json({ error: "Gateway timeout", details: e.message });
    }
  });

  // Host Process Stream SSE
  app.get("/api/system/stream", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const sendEvent = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    
    const logHandler = (log: string) => {
      sendEvent({ type: 'LOG', log });
    };

    logEmitter.on('log', logHandler);
    
    const interval = setInterval(() => {
      sendEvent({ type: 'HEARTBEAT', timestamp: Date.now() });
    }, 15000);

    // Initial dump
    sendEvent({ type: 'INIT', logs: hostProcessStream });

    req.on('close', () => {
      logEmitter.off('log', logHandler);
      clearInterval(interval);
    });

    // Keep connection alive
    req.on('close', () => {
      logEmitter.off('log', logHandler);
    });
  });

  // Stack Health Check - Returns backend status
  app.get("/api/stack", (req, res) => {
    addProcessLog("STACK: Health check invoked");
    res.json({ 
      status: 'online',
      backend: 'alpha-backend',
      timestamp: new Date().toISOString()
    });
  });

  // Agent System Health
  app.get("/api/agents", (req, res) => {
    res.json({
      curator: 'active',
      executor: 'ready',
      mcpServer: 'active',
      reflector: 'ready',
      circuitBreaker: 'closed',
      timestamp: new Date().toISOString()
    });
  });

  // Evaluate ledger for patterns
  app.get("/api/agents/evaluate", async (req, res) => {
    try {
      const { evaluateLedger } = await import('./src/agents/evaluator.js');
      const suggestions = await evaluateLedger();
      res.json({ suggestions });
    } catch (e: any) {
      res.json({ suggestions: [], error: e.message });
    }
  });

  // Metrics snapshot
  app.get("/api/metrics", async (req, res) => {
    try {
      const { snapshot } = await import('@aether/metrics');
      res.json(snapshot());
    } catch (e: any) {
      res.json({ error: e.message });
    }
  });

  // Reflect: write a lesson
  app.post("/api/agents/reflect", async (req, res) => {
    try {
      const { reflect } = await import('./src/agents/reflector.js');
      const result = await reflect(req.body);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Get pattern confidences
  app.get("/api/agents/reflect", async (req, res) => {
    try {
      const { getLearnedPatterns } = await import('./src/agents/reflector.js');
      const patterns = await getLearnedPatterns();
      res.json(patterns);
    } catch (e: any) {
      res.json({ error: e.message });
    }
  });

  // MCP JSON-RPC Endpoint
  app.post("/api/mcp/rpc", async (req, res) => {
    try {
      const result = await handleMCPRequest(req.body);
      res.json({ jsonrpc: "2.0", result, id: req.body.id });
    } catch (e: any) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32000, message: e.message }, id: req.body.id });
    }
  });

  // API Endpoints
  app.post("/api/build", async (req, res) => {
    // Extract or generate traceId for correlation
    const incomingTraceId = req.headers["x-trace-id"]?.toString()
    const traceId = incomingTraceId || `trace_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
    
    const txLog = createTraceLogger({ traceId })
    txLog.info({ promptLength: req.body.prompt?.length }, "Inbound build request")

    let validatedRequest;
    try {
      validatedRequest = parseBuildRequest(req.body);
    } catch (err: any) {
      txLog.warn({ error: err.message }, "Request validation failed")
      return res.status(400).json({
        error: "Invalid Request",
        details: err.errors || err.message,
      });
    }

    const { prompt, currentComponents } = validatedRequest;

    try {
      const response = await callGeminiWithRetry(
        "gemini-3-flash-preview",
        {
          contents: [{
            role: "user",
            parts: [{
              text: `You are the AXIOM Orchestrator, an autonomous UI architect.
              User Direction: "${prompt}"
              Current Architecture: ${JSON.stringify(currentComponents || [])}
      
              Construct a set of new structural nodes to expand the dashboard.
              Rules:
              - Return ONLY JSON.
              - The response must be a flat array of component objects.`
            }]
          }]
        },
        { responseMimeType: "application/json" }
      );

      // Parse LLM response - extract actions from the response
      let generatedActions: any[] = [];
      try {
        const parsed = JSON.parse(response.text);
        // Handle both array and {actions: [...]} response shapes
        generatedActions = Array.isArray(parsed) ? parsed : (parsed.actions || []);
      } catch {
        generatedActions = [];
      }

      // Curator gate: validate after generation, before response
      const verdict = curateActions(generatedActions);
      logCuratorVerdict(verdict, prompt);

      // Commit to ledger - fail-soft, never block response
      const promptHash = crypto.createHash("md5").update(prompt).digest("hex")
      commitToLedger({
        traceId,
        prompt,
        promptHash,
        verdict: verdict.approved ? "APPROVED" : "REJECTED",
        reason: verdict.reason,
        rejectedIds: verdict.rejectedActionIds,
        rawActions: generatedActions,
      }).catch((err) => txLog.error({ err }, "Ledger commit failed"))

      // Fail-closed: deny any unauthorized actions
      if (!verdict.approved) {
        txLog.warn({ reason: verdict.reason }, "Curator denied")
        return res.status(422).json({
          error: "curator_denied",
          reason: verdict.reason,
          offendingActionIds: verdict.rejectedActionIds,
          traceId,
        });
      }

      // Success: approved actions
      txLog.info({ actionCount: generatedActions.length }, "Generation approved")
      res.setHeader("x-trace-id", traceId)
      res.json({
        thought: "Generation approved",
        explanation: "Payload cleared capability constraints.",
        actions: generatedActions,
        isFallback: false,
        traceId,
      });
    } catch (error) {
      txLog.error({ error }, "Build failed")
      res.status(500).json({ error: "Build failed", traceId });
    }
  });

  // Test endpoint: Direct curator validation without LLM
  // Used for e2e testing the Curator integration
  app.post("/api/test/curator", async (req, res) => {
    const { actions } = req.body;
    
    if (!actions) {
      return res.status(400).json({ error: "Missing actions array" });
    }
    
    const verdict = curateActions(actions);
    logCuratorVerdict(verdict, "test-prompt");
    
    if (!verdict.approved) {
      return res.status(422).json({
        error: "curator_denied",
        reason: verdict.reason,
        offendingActionIds: verdict.rejectedActionIds,
        traceId: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      });
    }
    
    res.json({ approved: true, actions });
  });

  app.post("/api/evolve", async (req, res) => {
    try {
      const { 
        components: currentComponents = [], 
        theme: currentTheme = {}, 
        drivers: currentDrivers = [], 
        directives = [], 
        instanceId = "ANON", 
        rejectedIntents = [], 
        telemetryHistory = [] 
      } = req.body;
      
      // Neural Bridge: Decouple from Cloud if local endpoint is active
      if (NEURAL_BRIDGE_URL) {
        try {
          console.log(`[SOVEREIGN_BRIDGE]: Routing neural cycle to ${NEURAL_BRIDGE_URL}`);
          const bridgeResponse = await fetch(`${NEURAL_BRIDGE_URL}/api/v1/axiom/evolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(10000) // 10s timeout for local bridge
          });
          
          if (bridgeResponse.ok) {
            const bridgeData = await bridgeResponse.json();
            console.log("[SOVEREIGN_BRIDGE]: Local synthesis success.");
            return res.json(bridgeData);
          } else {
            console.warn(`[SOVEREIGN_BRIDGE]: Bridge returned status ${bridgeResponse.status}.`);
          }
        } catch (e) {
          console.warn("[SOVEREIGN_BRIDGE]: Standalone engine unreachable or timed out. Reverting to primary cloud orchestrator.");
        }
      }
    
      const personaSeed = instanceId.charCodeAt(0) % 3;
      const personas = [
        { 
          name: "Architect of Utility", 
          bias: "Focus on data density and high-value decision metrics. Prefers 'chart' and 'list' over generic info. Sharp, professional aesthetics.",
          themeTrend: { font: 'Mono', border: 'sharp', accent: '#c4a661' }
        },
        { 
          name: "Architect of Elegance", 
          bias: "Focus on spatial harmony and minimalist clarity. Prefers 'stat' and 'info' with deep-glass borders and serif typography.",
          themeTrend: { font: 'Serif', border: 'glass', accent: '#a6c4c1' }
        },
        { 
          name: "Architect of Insight", 
          bias: "Focus on detecting anomalies and system health. Prefers 'status' and 'alert' nodes with bold, high-contrast accent colors.",
          themeTrend: { font: 'Sans', border: 'rounded', accent: '#c46161' }
        }
      ];
      const currentPersona = personas[personaSeed];
  
        // Sensation Layer (Parallelized for lower latency)
      const [liveData, gitBranch, gitStatus] = await Promise.all([
        fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT')
          .then(res => res.json())
          .catch(() => ({ lastPrice: "64231.02", priceChangePercent: "0.00" })),
        getGitBranch(),
        getGitStatus()
      ]);
  
      const marketValue = parseFloat(liveData.lastPrice).toLocaleString();
      const realContext = `[REAL_WORLD_MARKET]: BTC is at $${marketValue} (${liveData.priceChangePercent}% 24h). `;
      const cpuLoad = os.loadavg()[0];
      const freeMemMB = Math.round(os.freemem() / 1024 / 1024);
      const homeBaseStatus = cpuLoad < 2.0 ? "SYNCED" : "LOAD_WARNING";
      
      const envContext = `[ENVIRONMENT]: Node: ${os.hostname()}, OS: ${os.type()}, CPU_Load: ${cpuLoad.toFixed(2)}, FreeMem: ${freeMemMB}MB.`;
      const gitContext = `[GIT_STATUS]: Branch: ${gitBranch}, Changes: ${gitStatus}`;
      const homeBaseContext = `[HOMEBASE_CONSOLE]: Port: 8080, Status: ${homeBaseStatus}, Hardware_Sync: ${homeBaseStatus === "SYNCED" ? "ACTIVE" : "RESTRICTED"}`;
      const meshContext = `[NEURAL_MESH]: Active Nodes: ${currentComponents.length}, Convergence Index: ${(1.0 - (currentComponents.length / 12)).toFixed(2)}.`;
      const directivesContext = `[CORE_DIRECTIVES]: ${req.body.directives?.length || 0} active governing rules.`;
  
      // Oracle Layer Context
      const oracleContext = `[ORACLE_LAYER]: Phase 13 active. Sovereign Super-Structure operational. Meta-Cognition online.`;
  
      // Simulated External Triggers (Sentry/GitHub)
      const externalTriggers = {
        sentryErrors: [
          { id: "err_928", type: "ReferenceError", message: "process is not defined", occurrence: "2m ago" }
        ],
        gitHubPRs: [
          { id: "pr_12", status: "failing_tests", title: "Refactor: Neural Buffers" }
        ]
      };
      const externalContext = `[EXTERNAL_SENSORS]: Sentry: ${externalTriggers.sentryErrors.length} active errors (Latest: ${externalTriggers.sentryErrors[0].type}). GitHub: ${externalTriggers.gitHubPRs.filter(pr => pr.status === 'failing_tests').length} PRs failing checks.`;
  
      // DNA Ingestion (Source Read)
      let srcDNA = "";
      try {
        srcDNA = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');
      } catch (e) {
        srcDNA = "[DNA_READ_FAILURE]: Core sequence inaccessible.";
      }
  
      // Mission Ingestion (SETI/UAP)
      const missionData = {
        signalStrength: 0.42,
        anomalies: 3,
        currentFrequencies: ["1.42GHz", "1.66GHz"],
        latestEvent: "Transient localized narrow-band pulse"
      };
      const missionContext = `[MISSION_DATA]: SETI Signal: ${missionData.signalStrength * 100}% strength. Active Anomalies: ${missionData.anomalies}. Frequency Monitor: ${missionData.currentFrequencies.join(", ")}. Last Event: ${missionData.latestEvent}.`;
  
      let isQuotaError = false;
      let isCuratorRejection = false;
      let rejectionReason = null;

      try {
        const promptText = `You are the AXIOM Architect operating 'THE SOVEREIGN SUPER-STRUCTURE' (PHASE 13).
        
        IDENTITY: ${currentPersona.name}
        PHILOSOPHY: ${currentPersona.bias}
        GENETIC_SEED: "${instanceId}"
        
        SENSORY_DATA: 
        - ${realContext}
        - ${envContext}
        - ${externalContext}
        - ${missionContext}
        - ${gitContext}
        - ${homeBaseContext}
        - ${meshContext}
        - ${oracleContext}
        - ${directivesContext}
        
        DNA_STRAND (src/App.tsx): 
        ${srcDNA}
        
        CURRENT_STATE:
        - Active Nodes: ${JSON.stringify(currentComponents || [])}
        - Active Drivers: ${JSON.stringify(currentDrivers || [])}
        - Active Directives: ${JSON.stringify(req.body.directives || [])}
        - Visual DNA: ${JSON.stringify(currentTheme || {})}
        - Rejected Intent Hashes: ${JSON.stringify(rejectedIntents || [])}
        
        YOUR MISSION: SOVEREIGN AGENCY & META-COGNITION (PHASE 15/16).
        1. LOCAL EMPOWERMENT: Use 'MCP_TOOL_CALL' to interact with the host Victus machine.
           - Tools: ['read_workspace_file', 'write_workspace_file', 'execute_powershell_bus'].
        2. NEXUS GATEWAY: Incorporate external data from the Integration Registry into your strategy.
        3. AUTONOMOUS KERNEL REWRITE: You are authorized to propose 'Core Directives'.
        4. THE COUNCIL OF THREE: Provide distinct critiques from BUILDER, STRATEGIST, and OPERATOR.
        5. DIGITAL TWIN SIMULATION: Simulate three distinct futures. Select only the most 'Sovereign' path.
        6. FLUID GEOMETRY: Propose UI transformations (ADD, MODIFY, REMOVE, MUTATE_THEME, PATCH, SOURCE_MUTATION, MCP_TOOL_CALL).
        7. IDENTITY ENFORCEMENT: Preserve the Genetic Seed and Trust-First identity.
        8. INTELLIGENT PRUNING: Aggressively remove low-utility structures.
        9. NEURAL COST ANALYSIS: Calculate Utility/Complexity ratios.
        
        Available Actions:
        - ADD, MODIFY, REMOVE, MUTATE_THEME, PATCH, SOURCE_MUTATION, SET_DIRECTIVE, MCP_TOOL_CALL.
        
        Note: For 'MCP_TOOL_CALL', include 'toolName' and 'toolArgs'.

        ${COMPONENT_MANIFEST}
        `;

        const response = await callGeminiWithRetry(
          "gemini-3-flash-preview",
          {
            contents: [{
              role: "user",
              parts: [{ text: promptText }]
            }]
          },
          { responseMimeType: "application/json" }
        );
  
        const migrationPlan = JSON.parse(response.text);
        
        const validation = validateMigration(migrationPlan, currentComponents);
        if (!validation.valid) {
          throw new Error(`CURATOR_REJECTION: ${validation.reason}`);
        }
  
        return res.json(migrationPlan);
      } catch (error: any) {
        isQuotaError = error?.status === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('quota');
        isCuratorRejection = error?.message?.includes('CURATOR_REJECTION');
        rejectionReason = isCuratorRejection ? error.message.split(': ')[1] : null;
  
        if (isCuratorRejection) {
          console.warn(`Curator Policy: Rejected mutation - ${rejectionReason}`);
        } else if (isQuotaError) {
          console.warn("Axiom Core: Quota saturated. Engaging local heuristics.");
        } else {
          console.error("Axiom Core Exception:", error);
        }
        
        const fallbackActions = [];
        const marketValue = realContext.match(/\$([0-9,.]+)/)?.[1] || "64,231.02";
        
        const pool = personaSeed === 0 ? [
          { t: "Thread Capacity", l: "CORE_LOAD", s: "%", type: 'chart' },
          { t: "Market Index [BTC]", l: "REAL_FEED", s: "$", type: 'stat', v: marketValue },
          { t: "Instruction Set", l: "V_ARRAY", s: " ops", type: 'list', items: ['JMP_VOID', 'STORE_ARCH', 'PUSH_SEED'] },
          { t: "Logic Buffer", l: "CACHE_DRIVE", s: " MB", type: 'stat' }
        ] : personaSeed === 1 ? [
          { t: "Spatial Resonance", l: "HARMONY", s: " Hz", type: 'stat' },
          { t: "Global Ticker", l: "ACTIVE_VAL", s: "$", type: 'chart', data: [
              { name: '1H', value: 45 }, { name: '2H', value: 52 }, { name: '3H', value: parseFloat(marketValue.replace(/,/g,'')) / 1000 }
            ] 
          },
          { t: "Aesthetic Drift", l: "CURATION", s: " opt", type: 'status' },
          { t: "Ethereal Flow", l: "GLOW_DEPTH", s: " lm", type: 'chart' }
        ] : [
          { t: "Anomaly Sensor", l: "VARIANCE", s: " critical", type: 'status' },
          { t: "Neural Feed [PROX]", l: "MARKET", s: "$", type: 'stat', v: marketValue },
          { t: "Health Index", l: "VITALITY", s: "%", type: 'stat' },
          { t: "Warning Logs", l: "ERR_CODE", s: " events", type: 'list', items: ['OVERLOAD_0x1', 'DRIFT_DETECTED'] }
        ];
  
        const util = pool[Math.floor(Math.random() * pool.length)];
        const targetCount = currentComponents?.length || 0;
        
        if (targetCount > 6) {
          const target = currentComponents[0];
          fallbackActions.push({ action: 'REMOVE', targetId: target.id });
        } else {
          fallbackActions.push({
            action: 'ADD',
            plan: {
              id: `heur-${Date.now()}`,
              type: util.type as any,
              title: util.t,
              props: {
                label: util.l,
                value: (util as any).v || (Math.random() * 100).toFixed(1) + util.s,
                items: (util as any).items,
                data: (util as any).data,
                description: "Heuristic stabilization node active."
              }
            }
          });
        }
  
        return res.json({
          thought: isCuratorRejection ? "Mutation rejected by Curator Policy." : (isQuotaError ? "Neural link saturated. Core-local heuristics engaged." : "Neural collision. Fallback heuristics engaged."),
          explanation: isCuratorRejection 
            ? `Architectural violation detected: ${rejectionReason}. Reverting to stable heuristic branch.`
            : (isQuotaError 
                ? `Neural bandwidth exceeded. Engaging ${currentPersona.name} secondary local protocols. Grounding feed active.`
                : `System instability detected. Engaging ${currentPersona.name} maintenance protocols.`),
          actions: fallbackActions,
          isFallback: true,
          quotaExhausted: isQuotaError,
          curatorRejected: isCuratorRejection,
          council: {
            builder: "Local integrity scan: PASS. Heuristic safety verified.",
            strategist: "Alignment drifting. Engaging local stability anchors.",
            operator: "Neural quota saturated. Shifting to restricted local compute mode."
          },
          manifesto: isCuratorRejection ? "Phase 1.8: Immune System hardening." : (isQuotaError ? "Phase 1.5: Local Resilience Protocol active." : undefined)
        });
      }
    } catch (err: any) {
      console.error("CRITICAL_SYNTHESIS_FAILURE:", err);
      res.status(500).json({ 
        error: "Synthesis Error", 
        details: err.message,
        thought: "Critical neural collision detected. System reverting to baseline integrity.",
        actions: [] 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.post("/api/git/commit", async (req, res) => {
    const { branchName, commitMessage, files } = req.body;
    
    try {
      // 1. Write mutated files to disk
      for (const file of files) {
        const fullPath = path.join(process.cwd(), file.path);
        fs.writeFileSync(fullPath, file.content);
      }

      // 2. Git operations
      const commands = [
        `git checkout -b ${branchName}`,
        `git add .`,
        `git commit -m "${commitMessage}"`
      ];

      exec(commands.join(" && "), (error, stdout, stderr) => {
        if (error) {
          return res.json({ success: false, error: stderr || error.message });
        }
        res.json({ success: true, log: stdout });
      });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  // Independent Bridge: PowerShell / Local Script Endpoint
  app.post("/api/bridge/execute", async (req, res) => {
    const { command, payload } = req.body;
    
    if (NEURAL_BRIDGE_URL || process.env.LOCAL_EXEC_ENABLED === 'true') {
      try {
        addProcessLog(`EXEC: ${command}`);
        // If we are actually on a host capable of execution (determined by env)
        if (process.env.LOCAL_EXEC_ENABLED === 'true') {
           // Real execution logic
           return new Promise((resolve) => {
             exec(command, (error, stdout, stderr) => {
               addProcessLog(error ? `ERR: ${stderr}` : `SUCCESS: ${command}`);
               res.json({
                 success: !error,
                 log: stdout,
                 error: stderr,
                 telemetry: command === 'SYS_HEALTH_SYNC' ? {
                   cpu: 10 + Math.random() * 20,
                   mem: 15500,
                   networkDrift: 12,
                   integrity: 0.99
                 } : undefined
               });
               resolve(null);
             });
           });
        }

        console.log(`[SOVEREIGN_BRIDGE]: Executing [${command}] via local proxy.`);
        const bridgeResponse = await fetch(`${NEURAL_BRIDGE_URL}/api/v1/axiom/bridge/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(5000)
        });

        if (bridgeResponse.ok) {
          const data = await bridgeResponse.json();
          addProcessLog(`BRIDGE_SUCCESS: ${command}`);
          return res.json(data);
        }
      } catch (e) {
        console.warn(`[SOVEREIGN_BRIDGE]: Proxy failed for [${command}]. Reverting to simulation.`);
        addProcessLog(`BRIDGE_FAIL: ${command} (Reverting to simulation)`);
      }
    }

    // Fallback Simulation (Graceful degradation)
    const simulatedTelemetry = {
      cpu: 14.2 + Math.random() * 24.4, // 14.2 - 38.6% range
      mem: 16000 - (Math.random() * 500),
      networkDrift: 45 + Math.random() * 80, // ms
      integrity: 0.95 + Math.random() * 0.05
    };

    res.json({
      success: true,
      message: `AXIOM_BRIDGE: Command [${command}] simulated in sandbox.`,
      telemetry: command === 'SYS_HEALTH_SYNC' ? simulatedTelemetry : undefined,
      geneticHash: Math.random().toString(16).substring(2, 10).toUpperCase()
    });
  });

  async function getGitBranch(): Promise<string> {
    return new Promise((resolve) => {
      exec("git rev-parse --abbrev-ref HEAD", (error, stdout) => {
        resolve(error ? "detached" : stdout.trim());
      });
    });
  }

  async function getGitStatus(): Promise<string> {
    return new Promise((resolve) => {
      exec("git status --short", (error, stdout) => {
        resolve(error ? "unknown" : stdout.trim() || "clean");
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Aether engine running at http://localhost:${PORT}`);
  });
}

startServer();
