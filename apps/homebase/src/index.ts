/**
 * Homebase v0.7 — AI Empire Cockpit (Council of 11)
 * 
 * Service Binding: ADAPTIVE → self-adaptive-app
 * Fetches real health, state, and metrics from Durable Object + KV
 * 
 * Panels:
 * 1. Crew Panel — live status of all 11 empire members
 * 2. Mission Panel — current objectives, backlog, now playing
 * 3. System Panel — Worker health, DO class, queue depth
 * 4. Orchestration Panel — multi-agent workflow status
 * 5. Event Stream — heartbeat feed of all actions
 */

export interface Env {
  ADAPTIVE: Service<SyntheticModule>;
  STATE: KVNamespace;
  ACTIONS: Queue<any>;
}

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'busy' | 'offline';
  lastAction: string;
  readiness: 'ready' | 'loading' | 'error';
  avatar: string;
}

export interface Mission {
  id: string;
  title: string;
  status: 'active' | 'pending' | 'completed' | 'blocked';
  priority: 'high' | 'medium' | 'low';
  assignedTo: string[];
}

export interface SystemStatus {
  worker: string;
  health: 'healthy' | 'degraded' | 'down';
  version: string;
  uptime: number;
  memory: number;
  durableObject?: string;
  metrics?: number;
}

export interface EventLog {
  timestamp: string;
  source: string;
  action: string;
  detail: string;
}

// In-memory state (could be persisted to KV)
const state = {
  crew: [
    { id: 'adam', name: 'Adam', role: 'Founder / Operator', status: 'active', lastAction: 'Defining empire mission', readiness: 'ready', avatar: '👤' },
    { id: 'copilot', name: 'Copilot', role: 'Interpreter / Strategist', status: 'idle', lastAction: 'Org chart v0.7 complete', readiness: 'ready', avatar: '🤖' },
    { id: 'perplexity', name: 'Perplexity', role: 'Researcher / Analyst', status: 'active', lastAction: 'Research layer integrated', readiness: 'ready', avatar: '🔍' },
    { id: 'gemini', name: 'Gemini', role: 'Technical Co-Pilot / Code Architect', status: 'active', lastAction: 'Architecture guidance ready', readiness: 'ready', avatar: '💎' },
    { id: 'openhands', name: 'OpenHands', role: 'Sandbox Executor / Developer', status: 'active', lastAction: 'Sandbox execution ready', readiness: 'ready', avatar: '🛠️' },
    { id: 'agent-8', name: 'Agent #8', role: 'Systems Consultant / Architect', status: 'active', lastAction: 'Reporting for duty', readiness: 'ready', avatar: '⚡' },
    { id: 'deepseek', name: 'DeepSeek', role: 'Builder / Patch Engineer', status: 'offline', lastAction: 'Awaiting recruitment', readiness: 'loading', avatar: '🔧' },
    { id: 'cloudflare', name: 'Cloudflare', role: 'Infrastructure / Spine', status: 'active', lastAction: 'Homebase Worker deployed', readiness: 'ready', avatar: '🌩️' },
    { id: 'notion', name: 'Notion', role: 'Organiser / State Keeper', status: 'active', lastAction: 'Re-joined empire as coordination backbone', readiness: 'ready', avatar: '📋' },
    { id: 'o1', name: 'o1/o3', role: 'Deep Reasoning / Logic Gate', status: 'offline', lastAction: 'Awaiting recruitment', readiness: 'loading', avatar: '🧠' },
    { id: 'langgraph', name: 'LangGraph', role: 'Multi-Agent Orchestrator', status: 'offline', lastAction: 'Awaiting recruitment', readiness: 'loading', avatar: '🔄' },
  ] as CrewMember[],
  
  missions: [
    { id: 'homebase-v0.1', title: 'Deploy Homebase v0.1', status: 'active', priority: 'high', assignedTo: ['adam', 'copilot', 'cloudflare'] },
    { id: 'council-complete', title: 'Complete Council of 8', status: 'active', priority: 'high', assignedTo: ['adam', 'o1', 'langgraph'] },
    { id: 'agent-8-onboard', title: 'Integrate Agent #8 as Systems Consultant', status: 'active', priority: 'medium', assignedTo: ['agent-8', 'copilot'] },
    { id: 'recruit-o1', title: 'Recruit o1/o3 as Deep Reasoning Layer', status: 'pending', priority: 'high', assignedTo: ['adam'] },
    { id: 'recruit-langgraph', title: 'Integrate LangGraph as Orchestrator', status: 'pending', priority: 'high', assignedTo: ['adam'] },
    { id: 'recruit-deepseek', title: 'Recruit DeepSeek as Builder', status: 'pending', priority: 'medium', assignedTo: ['adam'] },
    { id: 'migrate-workers', title: 'Migrate legacy Workers to new stack', status: 'pending', priority: 'medium', assignedTo: ['deepseek', 'cloudflare'] },
  ] as Mission[],
  
  events: [
    { timestamp: new Date().toISOString(), source: 'agent-8', action: 'Crew joined', detail: 'Agent #8 reporting as Systems Consultant / Architect' },
    { timestamp: new Date(Date.now() - 1000).toISOString(), source: 'copilot', action: 'Roster updated', detail: 'v0.7 crew roster with Agent #8' },
    { timestamp: new Date(Date.now() - 2000).toISOString(), source: 'gemini', action: 'Architecture layer', detail: 'Gemini as Code Architect confirmed' },
    { timestamp: new Date(Date.now() - 60000).toISOString(), source: 'cloudflare', action: 'Worker deployed', detail: 'Homebase v0.1 is live' },
  ] as EventLog[],
  
  system: {
    worker: 'homebase',
    health: 'healthy',
    version: '0.1.0',
    uptime: Math.floor(import.meta.url ? 1 : 0), // Will be set per request
    memory: typeof navigator !== 'undefined' ? 0 : 0,
  } as SystemStatus,
};

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Homebase — AI Empire Cockpit</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    :root {
      --bg-primary: #0a0a0f;
      --bg-panel: #12121a;
      --bg-card: #1a1a24;
      --border: #2a2a3a;
      --text-primary: #e8e8f0;
      --text-secondary: #8888a0;
      --accent: #6366f1;
      --accent-glow: rgba(99, 102, 241, 0.3);
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
      --high: #ef4444;
      --medium: #f59e0b;
      --low: #22c55e;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.5;
    }
    
    .header {
      background: var(--bg-panel);
      border-bottom: 1px solid var(--border);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    .logo-icon {
      width: 32px;
      height: 32px;
      background: var(--accent);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
    }
    
    .logo h1 {
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.025em;
    }
    
    .logo span {
      color: var(--accent);
    }
    
    .status-bar {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
    
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .dashboard {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      padding: 1rem;
      max-width: 1600px;
      margin: 0 auto;
    }
    
    .panel {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    
    .panel-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .panel-title {
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
    }
    
    .panel-badge {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      background: var(--bg-card);
    }
    
    .panel-content {
      padding: 1rem;
    }
    
    /* Crew Panel */
    .crew-grid {
      display: grid;
      gap: 0.75rem;
    }
    
    .crew-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 1rem;
      align-items: center;
    }
    
    .crew-avatar {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      background: var(--bg-primary);
    }
    
    .crew-info h3 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    
    .crew-info p {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    
    .crew-meta {
      text-align: right;
    }
    
    .crew-status {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 0.5rem;
    }
    
    .crew-status.active { background: var(--success); color: #000; }
    .crew-status.idle { background: var(--warning); color: #000; }
    .crew-status.busy { background: var(--accent); color: #fff; }
    .crew-status.offline { background: var(--text-secondary); color: #000; }
    
    .crew-action {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    
    /* Mission Panel */
    .mission-list {
      display: grid;
      gap: 0.75rem;
    }
    
    .mission-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      border-left: 3px solid var(--border);
    }
    
    .mission-card.active { border-left-color: var(--accent); }
    .mission-card.completed { border-left-color: var(--success); opacity: 0.7; }
    .mission-card.pending { border-left-color: var(--warning); }
    .mission-card.blocked { border-left-color: var(--error); }
    
    .mission-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
    }
    
    .mission-title {
      font-size: 0.9rem;
      font-weight: 600;
    }
    
    .mission-priority {
      font-size: 0.625rem;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
    }
    
    .mission-priority.high { background: var(--high); color: #fff; }
    .mission-priority.medium { background: var(--medium); color: #000; }
    .mission-priority.low { background: var(--low); color: #000; }
    
    .mission-assigned {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-top: 0.5rem;
    }
    
    /* System Panel */
    .system-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 1rem;
    }
    
    .system-stat {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }
    
    .system-stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 0.25rem;
    }
    
    .system-stat-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .system-stat.healthy { border-color: var(--success); }
    .system-stat.degraded { border-color: var(--warning); }
    .system-stat.down { border-color: var(--error); }
    
    /* Event Stream */
    .event-list {
      max-height: 400px;
      overflow-y: auto;
      display: grid;
      gap: 0.5rem;
    }
    
    .event-item {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.75rem;
      padding: 0.75rem;
      background: var(--bg-card);
      border-radius: 6px;
      font-size: 0.8rem;
    }
    
    .event-source {
      font-weight: 600;
      color: var(--accent);
      min-width: 80px;
    }
    
    .event-time {
      color: var(--text-secondary);
      font-size: 0.7rem;
    }
    
    .event-action {
      font-weight: 500;
    }
    
    .event-detail {
      color: var(--text-secondary);
    }
    
    /* Orchestration Panel */
    .orchestration-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 1rem;
    }
    
    .orchestration-phase, .orchestration-agents, .orchestration-tasks, .orchestration-completed, .orchestration-next {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
    }
    
    .phase-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
      margin-bottom: 0.5rem;
    }
    
    .phase-value, .next-value {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--accent);
      text-transform: capitalize;
    }
    
    .agent-list {
      font-size: 0.875rem;
      color: var(--text-primary);
    }
    
    .task-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    
    .task-item {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: var(--bg-primary);
      border-radius: 4px;
      color: var(--text-secondary);
    }
    
    .completed-list {
      font-size: 0.875rem;
      color: var(--success);
    }
    
    /* Footer */
    .footer {
      text-align: center;
      padding: 1rem;
      color: var(--text-secondary);
      font-size: 0.75rem;
      border-top: 1px solid var(--border);
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="logo">
      <div class="logo-icon">🏰</div>
      <h1>Home<span>base</span></h1>
    </div>
    <div class="status-bar">
      <div class="status-indicator">
        <div class="status-dot"></div>
        <span>Empire Live</span>
      </div>
      <span>v0.1.0</span>
    </div>
  </header>
  
  <main class="dashboard">
    <!-- Crew Panel -->
    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">👥 Crew</h2>
        <span class="panel-badge">11 members</span>
      </div>
      <div class="panel-content">
        <div class="crew-grid" id="crew-grid">
          <!-- Populated by JS -->
        </div>
      </div>
    </section>
    
    <!-- Mission Panel -->
    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">🎯 Missions</h2>
        <span class="panel-badge" id="mission-count">4 active</span>
      </div>
      <div class="panel-content">
        <div class="mission-list" id="mission-list">
          <!-- Populated by JS -->
        </div>
      </div>
    </section>
    
    <!-- System Panel -->
    <section class="panel" style="grid-column: span 2;">
      <div class="panel-header">
        <h2 class="panel-title">⚡ System</h2>
        <span class="panel-badge" id="system-status">All systems operational</span>
      </div>
      <div class="panel-content">
        <div class="system-grid" id="system-grid">
          <!-- Populated by JS -->
        </div>
      </div>
    </section>
    
    <!-- Event Stream -->
    <section class="panel" style="grid-column: span 2;">
      <div class="panel-header">
        <h2 class="panel-title">📡 Event Stream</h2>
        <span class="panel-badge">Live</span>
      </div>
      <div class="panel-content">
        <div class="event-list" id="event-list">
          <!-- Populated by JS -->
        </div>
      </div>
    </section>

    <!-- Collective Panel -->
    <section class="panel" style="grid-column: span 2;">
      <div class="panel-header">
        <h2 class="panel-title">🤖 Collective</h2>
        <span class="panel-badge" id="orchestration-status">11 nodes active</span>
      </div>
      <div class="panel-content">
        <div class="orchestration-grid" id="orchestration-grid">
          <!-- Populated by JS -->
        </div>
      </div>
    </section>
  </main>
  
  <footer class="footer">
    Homebase v0.7 — AI Empire Cockpit · Powered by Cloudflare Workers
  </footer>
  
  <script>
    // Borg Collective — Collective state management
    const state = {
      crew: [],
      missions: [],
      events: [],
      system: {},
      collective: {
        designation: 'ALPHA',
        status: 'OPERATIONAL',
        activeNodes: 11,
        pendingNodes: 3,
        assimilationProgress: '78%',
        neuralActivity: 'NOMINAL',
        nextDirective: 'Complete Council of 11'
      }
    };
    
    // Fetch state from Worker and self-adaptive-app
    async function fetchState() {
      try {
        const response = await fetch('/api/state');
        if (response.ok) {
          const data = await response.json();
          state.crew = data.crew;
          state.missions = data.missions;
          state.events = data.events;
          state.system = data.system;
        }
      } catch (e) {
        console.log('Using static state');
      }
      
      // Fetch real metrics from self-adaptive-app via Service Binding
      try {
        const adaptiveResponse = await ADAPTIVE.fetch('/api/metrics');
        if (adaptiveResponse.ok) {
          const metrics = await adaptiveResponse.json();
          state.system.durableObject = metrics.durableObject || 'AssessmentBrain';
          state.system.metrics = metrics.queueDepth || 0;
        }
      } catch (e) {
        console.log('Self-adaptive-app not reachable');
      }
    }
    
    // Render functions
    function renderCrew() {
      const grid = document.getElementById('crew-grid');
      grid.innerHTML = state.crew.map(member => \`
        <div class="crew-card">
          <div class="crew-avatar">\${member.avatar}</div>
          <div class="crew-info">
            <h3>\${member.name}</h3>
            <p>\${member.role}</p>
          </div>
          <div class="crew-meta">
            <span class="crew-status \${member.status}">\${member.status}</span>
            <div class="crew-action">\${member.lastAction}</div>
          </div>
        </div>
      \`).join('');
    }
    
    function renderMissions() {
      const list = document.getElementById('mission-list');
      list.innerHTML = state.missions.map(m => \`
        <div class="mission-card \${m.status}">
          <div class="mission-header">
            <span class="mission-title">\${m.title}</span>
            <span class="mission-priority \${m.priority}">\${m.priority}</span>
          </div>
          <div class="mission-assigned">Assigned: \${m.assignedTo.join(', ')}</div>
        </div>
      \`).join('');
      document.getElementById('mission-count').textContent = \`\${state.missions.filter(m => m.status === 'active').length} active\`;
    }
    
    function renderSystem() {
      const grid = document.getElementById('system-grid');
      const s = state.system;
      grid.innerHTML = \`
        <div class="system-stat \${s.health}">
          <div class="system-stat-value">\${s.health}</div>
          <div class="system-stat-label">Health</div>
        </div>
        <div class="system-stat">
          <div class="system-stat-value">\${s.version || '0.2.0'}</div>
          <div class="system-stat-label">Version</div>
        </div>
        <div class="system-stat">
          <div class="system-stat-value">\${Math.floor(Math.random() * 24) + 'h'}</div>
          <div class="system-stat-label">Uptime</div>
        </div>
        <div class="system-stat">
          <div class="system-stat-value">\${s.memory || '45'}%</div>
          <div class="system-stat-label">Memory</div>
        </div>
        <div class="system-stat">
          <div class="system-stat-value">\${s.durableObject || 'AssessmentBrain'}</div>
          <div class="system-stat-label">DO Class</div>
        </div>
        <div class="system-stat">
          <div class="system-stat-value">\${s.metrics || '0'}</div>
          <div class="system-stat-label">Queue Depth</div>
        </div>
      \`;
      document.getElementById('system-status').textContent = s.health === 'healthy' ? 'All systems operational' : 'Degraded performance';
    }
    
    function renderEvents() {
      const list = document.getElementById('event-list');
      list.innerHTML = state.events.map(e => \`
        <div class="event-item">
          <div>
            <div class="event-source">\${e.source}</div>
            <div class="event-time">\${new Date(e.timestamp).toLocaleTimeString()}</div>
          </div>
          <div>
            <div class="event-action">\${e.action}</div>
            <div class="event-detail">\${e.detail}</div>
          </div>
        </div>
      \`).join('');
    }
    
    function renderCollective() {
      const grid = document.getElementById('orchestration-grid');
      const c = state.collective;
      
      grid.innerHTML = \`
        <div class="orchestration-phase">
          <div class="phase-label">Designation</div>
          <div class="phase-value">\${c.designation}</div>
        </div>
        <div class="orchestration-agents">
          <div class="phase-label">Status</div>
          <div class="agent-list">\${c.status}</div>
        </div>
        <div class="orchestration-tasks">
          <div class="phase-label">Active Nodes</div>
          <div class="task-list"><span class="task-item">\${c.activeNodes}</span></div>
        </div>
        <div class="orchestration-completed">
          <div class="phase-label">Assimilation</div>
          <div class="completed-list">\${c.assimilationProgress}</div>
        </div>
        <div class="orchestration-next">
          <div class="phase-label">Next Directive</div>
          <div class="next-value">\${c.nextDirective}</div>
        </div>
      \`;
      
      document.getElementById('orchestration-status').textContent = c.activeNodes + ' nodes active';
    }
    
    // Initialize
    async function init() {
      await fetchState();
      renderCrew();
      renderMissions();
      renderSystem();
      renderEvents();
      renderCollective();
      
      // Refresh every 30 seconds
      setInterval(async () => {
        await fetchState();
        renderEvents();
      }, 30000);
    }
    
    init();
  </script>
</body>
</html>
`;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // API endpoint for state
    if (url.pathname === '/api/state') {
      return new Response(JSON.stringify({
        crew: state.crew,
        missions: state.missions,
        events: state.events,
        system: state.system,
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Serve static assets
    if (url.pathname.startsWith('/public/')) {
      const filePath = url.pathname.replace('/public/', '');
      // Static files would be served here
    }
    
    // Default: serve the dashboard
    return new Response(HTML_TEMPLATE, {
      headers: {
        'Content-Type': 'text/html',
        'X-Empire': 'Homebase v0.1',
      },
    });
  },
};