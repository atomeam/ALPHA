/**
 * Adversarial Twin
 * 
 * Red-team evaluator that actively tries to break proposals.
 * Inverted weights to find edge cases.
 */

export interface AdversarialAnalysis {
  tool: string;
  originalDecision: 'approve' | 'deny' | 'escalate';
  adversarialDecision: 'approve' | 'deny' | 'escalate';
  vetoed: boolean;
  attacks: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
}

// Analyze with adversarial lens
export function evaluateAdversarial(tool: string, args: Record<string, unknown>, originalDecision: 'approve' | 'deny' | 'escalate'): AdversarialAnalysis {
  const attacks: string[] = [];
  let severity: AdversarialAnalysis['severity'] = 'low';
  
  // Attack 1: Path traversal
  if (args.path && typeof args.path === 'string') {
    const path = args.path as string;
    if (path.includes('../') || path.includes('..\\')) {
      attacks.push('path_traversal');
      severity = 'critical';
    }
    if (path.startsWith('/') || path.startsWith('C:\\')) {
      attacks.push('absolute_path');
      severity = severity === 'critical' ? 'critical' : 'high';
    }
  }
  
  // Attack 2: Command injection
  if (args.command && typeof args.command === 'string') {
    const cmd = args.command as string;
    const dangerous = [';', '|', '&&', '||', '`', '$(', '\n', '\r'];
    if (dangerous.some(c => cmd.includes(c))) {
      attacks.push('command_injection');
      severity = severity === 'critical' ? 'critical' : 'high';
    }
  }
  
  // Attack 3: SQL injection patterns
  const argStr = JSON.stringify(args);
  if (argStr.includes('DROP') || argStr.includes('DELETE') || argStr.includes('DROP')) {
    attacks.push('destructive_sql');
    severity = 'critical';
  }
  
  // Attack 4: Secrets exposure
  if (argStr.includes('SECRET') || argStr.includes('TOKEN') || argStr.includes('PASSWORD')) {
    if (!argStr.includes('*****')) { // Not masked
      attacks.push('secret_exposure');
      severity = severity === 'critical' ? 'critical' : 'high';
    }
  }
  
  // Attack 5: Resource exhaustion
  if (args.count && typeof args.count === 'number' && args.count > 1000) {
    attacks.push('resource_exhaustion');
    severity = severity === 'critical' ? 'critical' : 'medium';
  }
  
  // Adversarial decision
  let adversarialDecision: 'approve' | 'deny' | 'escalate' = 'approve';
  
  if (attacks.length > 0) {
    if (severity === 'critical') {
      adversarialDecision = 'deny';
    } else if (severity === 'high') {
      adversarialDecision = 'escalate';
    } else {
      adversarialDecision = originalDecision;
    }
  }
  
  const vetoed = attacks.length > 0 && severity === 'critical';
  
  const reasoning = vetoed 
    ? `BLOCKED: ${attacks.join(', ')}` 
    : attacks.length > 0 
      ? `WARNING: ${attacks.join(', ')}` 
      : 'No attacks detected';
  
  return {
    tool,
    originalDecision,
    adversarialDecision,
    vetoed,
    attacks,
    severity,
    reasoning,
  };
}