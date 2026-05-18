import { useEffect, useMemo, useState } from 'react';

type ProviderStatus = 'configured' | 'available-local' | 'missing-secret' | 'not-configured';

interface SourceRepo {
  id: string;
  name: string;
  url: string;
  role: string;
  target: string;
  status: 'connected' | 'empty' | 'current';
}

interface ProviderRuntime {
  id: string;
  displayName: string;
  purpose: string;
  inbound: 'webhook' | 'optional-webhook' | 'none';
  requiredEnv: string[];
  optionalEnv: string[];
  status: ProviderStatus;
  configuredEnv: string[];
  missingEnv: string[];
  scopeExamples: string[];
}

interface StackSnapshot {
  generatedAt: string;
  sourceRepos: SourceRepo[];
  providers: ProviderRuntime[];
  ports: {
    backend: number;
    frontend: number;
    bridge: number;
    retroarchUdp: number;
  };
}

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  git_sha: string;
  gemini: { configured: boolean; model: string };
  bridge: { configured: boolean; port: number };
}

const apiBase = import.meta.env.VITE_BACKEND_URL || '';

function statusLabel(status: ProviderStatus): string {
  if (status === 'available-local') return 'local-ready';
  if (status === 'missing-secret') return 'partial';
  return status;
}

function App() {
  const [stack, setStack] = useState<StackSnapshot | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [stackResponse, healthResponse] = await Promise.all([
          fetch(`${apiBase}/api/stack`),
          fetch(`${apiBase}/api/health`),
        ]);
        if (!stackResponse.ok) throw new Error(`stack ${stackResponse.status}`);
        if (!healthResponse.ok) throw new Error(`health ${healthResponse.status}`);
        const nextStack = (await stackResponse.json()) as StackSnapshot;
        const nextHealth = (await healthResponse.json()) as HealthResponse;
        if (!cancelled) {
          setStack(nextStack);
          setHealth(nextHealth);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      }
    }

    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const configuredProviders = useMemo(
    () => stack?.providers.filter((provider) => provider.status === 'configured').length ?? 0,
    [stack],
  );

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">AtoMind ALPHA</p>
          <h1>Connected stack cockpit</h1>
          <p className="lede">
            ALPHA now exposes one backend surface for source repos, provider readiness, MCP, trust
            checks, Gemini prompts, and local bridge status.
          </p>
        </div>
        <div className="status-card">
          <span className={health?.status === 'ok' ? 'dot dot-ok' : 'dot dot-warn'} />
          <strong>{health?.service ?? 'alpha-backend'}</strong>
          <span>v{health?.version ?? '0.1.0'}</span>
          <span>{health?.git_sha ?? 'offline'}</span>
        </div>
      </section>

      {error ? <div className="notice">Backend not reachable: {error}</div> : null}

      <section className="metrics">
        <article>
          <span>{stack?.sourceRepos.length ?? '—'}</span>
          <p>repos mapped</p>
        </article>
        <article>
          <span>
            {configuredProviders}/{stack?.providers.length ?? '—'}
          </span>
          <p>providers configured</p>
        </article>
        <article>
          <span>{health?.gemini.configured ? 'ready' : 'needs key'}</span>
          <p>Gemini · {health?.gemini.model ?? 'gemini-2.5-flash'}</p>
        </article>
        <article>
          <span>:{stack?.ports.bridge ?? 8090}</span>
          <p>bridge port</p>
        </article>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="panel-head">
            <h2>Source repos</h2>
            <span>
              {stack?.generatedAt ? new Date(stack.generatedAt).toLocaleTimeString() : 'loading'}
            </span>
          </div>
          <div className="list">
            {stack?.sourceRepos.map((repo) => (
              <a className="row" href={repo.url} key={repo.id} rel="noreferrer" target="_blank">
                <div>
                  <strong>{repo.name}</strong>
                  <p>{repo.role}</p>
                  <small>{repo.target}</small>
                </div>
                <span className={`pill ${repo.status}`}>{repo.status}</span>
              </a>
            )) ?? <p className="empty">Loading repo map…</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Provider readiness</h2>
            <span>secrets stay server-side</span>
          </div>
          <div className="list">
            {stack?.providers.map((provider) => (
              <div className="row" key={provider.id}>
                <div>
                  <strong>{provider.displayName}</strong>
                  <p>{provider.purpose}</p>
                  <small>
                    needs {provider.requiredEnv.join(', ') || 'none'} · inbound {provider.inbound}
                  </small>
                </div>
                <span className={`pill ${provider.status}`}>{statusLabel(provider.status)}</span>
              </div>
            )) ?? <p className="empty">Loading provider matrix…</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
