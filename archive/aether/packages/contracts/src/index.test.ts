/**
 * Contract validation tests for @aether/contracts
 */

import { describe, it, expect } from 'vitest';
import { 
  BuildRequestSchema, 
  ComponentSchema,
  BuildResponseSchema,
  ComponentActionSchema,
  parseBuildRequest,
  safeParseBuildRequest,
} from './index';

describe('BuildRequestSchema', () => {
  it('parses a valid request', () => {
    const valid = {
      prompt: 'Add a new chart component',
      currentComponents: [],
    };
    
    const result = BuildRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt).toBe('Add a new chart component');
    }
  });

  it('rejects empty prompt', () => {
    const invalid = {
      prompt: '',
      currentComponents: [],
    };
    
    const result = BuildRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects prompt over 5000 chars', () => {
    const invalid = {
      prompt: 'a'.repeat(5001),
      currentComponents: [],
    };
    
    const result = BuildRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('applies default for missing currentComponents', () => {
    const partial = {
      prompt: 'Test prompt',
    };
    
    const result = BuildRequestSchema.safeParse(partial);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentComponents).toEqual([]);
    }
  });
});

describe('ComponentSchema', () => {
  it('validates a valid component', () => {
    const component = {
      id: 'chart-1',
      type: 'chart' as const,
      title: 'Market Trend',
      props: {
        label: 'Price',
        value: '$100',
      },
    };
    
    const result = ComponentSchema.safeParse(component);
    expect(result.success).toBe(true);
  });

  it('rejects invalid component type', () => {
    const invalid = {
      id: 'bad-1',
      type: 'invalid-type',
      title: 'Bad',
      props: { label: 'Test' },
    };
    
    const result = ComponentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('parseBuildRequest', () => {
  it('throws on invalid data', () => {
    expect(() => parseBuildRequest({ prompt: '' })).toThrow();
  });

  it('returns parsed data on success', () => {
    const input = { prompt: 'Hello' };
    const result = parseBuildRequest(input);
    expect(result.prompt).toBe('Hello');
  });

  it('provides safeParse alternative', () => {
    const input = { prompt: 'Test' };
    const result = safeParseBuildRequest(input);
    expect(result.success).toBe(true);
  });
});