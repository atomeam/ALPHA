import { useState, useEffect } from 'react';

interface ExecutionStatus {
  status: string;
  currentStep: number;
  totalSteps: number;
  steps: any[];
  objective: string;
  startedAt: string;
  completedAt: string;
  error: string;
}

function App() {
  const [objective, setObjective] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [execStatus, setExecStatus] = useState<ExecutionStatus | null>(null);

  // Polling for execution status
  useEffect(() => {
    if (!loading) return;
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/execute/status');
        const data = await res.json();
        setExecStatus(data);
        if (data.status === 'completed' || data.status === 'error') {
          setLoading(false);
        }
      } catch (e) {
        // Ignore polling errors
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [loading]);

  const execute = async () => {
    if (!objective.trim()) return;
    setLoading(true);
    setResult(null);
    setExecStatus(null);
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      if (!text) {
        throw new Error('Empty response');
      }
      const data = JSON.parse(text);
      setResult(data);
    } catch (e: any) {
      setResult({ error: e.message });
    }
    setLoading(false);
  };

  return (
    <div className="app">
      <header>
        <h1>⚡ Alpha - HomeBase</h1>
      </header>
      
      <section className="control-panel">
        <input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Enter objective..."
          onKeyDown={(e) => e.key === 'Enter' && execute()}
        />
        <button onClick={execute} disabled={loading}>
          {loading ? '◌ Launching...' : '▶ Launch Objective'}
        </button>
      </section>

      {(loading || execStatus) && (
        <section className="status-panel">
          <h3>Execution Log</h3>
          <div className="status-header">
            <span>Status: {execStatus?.status || 'idle'}</span>
            <span>Step: {execStatus?.currentStep || 0} / {execStatus?.totalSteps || 0}</span>
          </div>
          <div className="steps-log">
            {execStatus?.steps?.map((step: any, i: number) => (
              <div key={i} className={`step ${step.status || 'pending'}`}>
                <span className="step-num">[{i + 1}]</span>
                <span className="step-name">{step.name || step.action || 'pending'}</span>
                <span className="step-status">{step.status || ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {result && (
        <section className="result-panel">
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

export default App;