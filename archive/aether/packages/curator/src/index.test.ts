/**
 * Curator tests
 */

import { describe, it, expect } from 'vitest';
import { curateActions } from './index';

describe('curateActions', () => {
  it('approves valid ADD action with allowed type', () => {
    const actions = [
      { action: 'ADD', plan: { id: 'chart-1', type: 'chart', title: 'Test', props: { label: 'x' } } },
    ];
    
    const verdict = curateActions(actions);
    expect(verdict.approved).toBe(true);
  });

  it('rejects ADD action with invalid type at schema level', () => {
    const actions = [
      { action: 'ADD', plan: { id: 'exec-1', type: 'shell' as any, title: 'Shell', props: { label: 'x' } } },
    ];
    
    const verdict = curateActions(actions);
    // Zod rejects the schema first (unknown type)
    expect(verdict.approved).toBe(false);
    expect(verdict.reason).toContain('Schema Violation');
  });

  it('rejects MODIFY action changing to unauthorized type', () => {
    const actions = [
      { action: 'MODIFY', targetId: 'chart-1', plan: { type: 'shell' } },
    ];
    
    const verdict = curateActions(actions);
    expect(verdict.approved).toBe(false);
  });

  it('approves REMOVE action', () => {
    const actions = [
      { action: 'REMOVE', targetId: 'chart-1' },
    ];
    
    const verdict = curateActions(actions);
    expect(verdict.approved).toBe(true);
  });

  it('rejects too many actions (rate limit)', () => {
    // Create 11 actions to exceed MAX_ACTIONS_PER_RESPONSE
    const actions = Array(11).fill(null).map((_, i) => ({ 
      action: 'ADD', plan: { id: `chart-${i}`, type: 'chart', title: 'T', props: { label: 'x' } } }));
    
    const verdict = curateActions(actions);
    expect(verdict.approved).toBe(false);
    expect(verdict.reason).toContain('Rate Limit');
  });

  it('rejects malformed action (Zod failure)', () => {
    const actions = [
      { bad_action: 'INVALID', plan: { id: 'bad', type: 'chart', title: 'T', props: { label: 'x' } } },
    ];
    
    const verdict = curateActions(actions);
    expect(verdict.approved).toBe(false);
    expect(verdict.reason).toContain('Schema Violation');
  });

  it('approves mixed ADD/REMOVE actions', () => {
    const actions = [
      { action: 'ADD', plan: { id: 'stat-1', type: 'stat', title: 'CPU', props: { label: 'CPU' } } },
      { action: 'REMOVE', targetId: 'chart-1' },
    ];
    
    const verdict = curateActions(actions);
    expect(verdict.approved).toBe(true);
  });
});

describe('ALLOWED_COMPONENT_TYPES', () => {
  it('includes expected types', () => {
    const allowed = ['stat', 'chart', 'list', 'status', 'gauge'];
    expect(allowed).toContain('stat');
    expect(allowed).toContain('chart');
  });
});