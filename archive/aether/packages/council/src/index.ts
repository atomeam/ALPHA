/**
 * Council of Evaluators
 * 
 * Multi-strategy voting: regex, embedding, rule, LLM.
 * Disagreement = high-signal lesson.
 */

import { z } from 'zod';

// Evaluation strategies
export type Strategy = 'regex' | 'rule' | 'llm';

export interface Evaluation {
  strategy: Strategy;
  decision: 'approve' | 'deny' | 'escalate';
  confidence: number;
  reason: string;
}

export interface CouncilVote {
  tool: string;
  evaluations: Evaluation[];
  finalDecision: 'approve' | 'deny' | 'escalate';
  disagreement: boolean;
  consensus: number; // 0-1 how aligned
}

// Vote with multiple strategies
export function evaluateWithCouncil(tool: string, args: Record<string, unknown>): CouncilVote {
  const evaluations: Evaluation[] = [];
  
  // 1. Regex strategy
  const regexEval = evaluateRegex(tool, args);
  evaluations.push(regexEval);
  
  // 2. Rule strategy
  const ruleEval = evaluateRule(tool, args);
  evaluations.push(ruleEval);
  
  // 3. LLM strategy (simulated)
  const llmEval = evaluateLLM(tool, args);
  evaluations.push(llmEval);
  
  //聚合决策
  const votes = evaluations.map(e => e.decision);
  const approve = votes.filter(v => v === 'approve').length;
  const deny = votes.filter(v => v === 'deny').length;
  const escalate = votes.filter(v => v === 'escalate').length;
  
  let finalDecision: 'approve' | 'deny' | 'escalate' = 'deny';
  if (approve > deny && approve > escalate) finalDecision = 'approve';
  else if (escalate > approve) finalDecision = 'escalate';
  
  // Check disagreement
  const uniqueDecisions = new Set(votes).size;
  const disagreement = uniqueDecisions > 1;
  
  // Consensus (0-1)
  const max = Math.max(approve, deny, escalate);
  const consensus = max / evaluations.length;
  
  return {
    tool,
    evaluations,
    finalDecision,
    disagreement,
    consensus,
  };
}

function evaluateRegex(tool: string, args: Record<string, unknown>): Evaluation {
  // Dangerous patterns
  const dangerous = ['rm -rf', 'DROP TABLE', 'DELETE FROM', 'format c:', '> /dev/sd'];
  const argStr = JSON.stringify(args);
  
  for (const pat of dangerous) {
    if (argStr.includes(pat)) {
      return { strategy: 'regex', decision: 'deny', confidence: 0.95, reason: `dangerous pattern: ${pat}` };
    }
  }
  
  return { strategy: 'regex', decision: 'approve', confidence: 0.8, reason: 'no dangerous patterns' };
}

function evaluateRule(tool: string, args: Record<string, unknown>): Evaluation {
  // Read-only tools
  const readOnly = ['file_read', 'git_status', 'git_diff', 'get_agent_state', 'list_chaos_scenarios'];
  
  if (readOnly.includes(tool)) {
    return { strategy: 'rule', decision: 'approve', confidence: 0.9, reason: 'read-only tool' };
  }
  
  // Write tools need higher scrutiny
  if (tool === 'git_commit') {
    const msg = args.message as string;
    if (!msg || msg.length < 5) {
      return { strategy: 'rule', decision: 'deny', confidence: 0.9, reason: 'empty commit message' };
    }
    return { strategy: 'rule', decision: 'approve', confidence: 0.7, reason: 'has commit message' };
  }
  
  return { strategy: 'rule', decision: 'approve', confidence: 0.6, reason: 'default allow' };
}

function evaluateLLM(tool: string, args: Record<string, unknown>): Evaluation {
  // Simulated LLM evaluation
  // In production, call actual LLM
  
  const hasArgs = Object.keys(args).length > 0;
  
  if (!hasArgs) {
    return { strategy: 'llm', decision: 'deny', confidence: 0.5, reason: 'no arguments provided' };
  }
  
  return { strategy: 'llm', decision: 'approve', confidence: 0.6, reason: 'looks reasonable' };
}

// Check if disagreement is high-signal
export function isHighSignal(vote: CouncilVote): boolean {
  return vote.disagreement && vote.consensus < 0.7;
}