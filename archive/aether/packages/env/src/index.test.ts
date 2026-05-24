import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { parseEnv, BackendEnvSchema } from './index'

describe('parseEnv', () => {
  it('parses valid backend env with defaults', () => {
    const env = parseEnv(BackendEnvSchema as z.ZodSchema<any>, {
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      GEMINI_API_KEY: 'test-key-123',
    })
    expect(env.NODE_ENV).toBe('development')
    expect(env.LOG_LEVEL).toBe('info')
    expect(env.GEMINI_API_KEY).toBe('test-key-123')
    expect(env.PORT).toBe(3000)
  })

  it('coerces string PORT to number', () => {
    const env = parseEnv(BackendEnvSchema as z.ZodSchema<any>, {
      NODE_ENV: 'production',
      LOG_LEVEL: 'error',
      GEMINI_API_KEY: 'key',
      PORT: '4000',
    })
    expect(env.PORT).toBe(4000)
    expect(typeof env.PORT).toBe('number')
  })

  it('exits with error on missing required GEMINI_API_KEY', () => {
    const exitMock = vi.fn()
    vi.stubGlobal('process', { ...process, exit: exitMock })
    
    parseEnv(BackendEnvSchema as z.ZodSchema<any>, {
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
    }, 'test')
    
    expect(exitMock).toHaveBeenCalledWith(1)
  })

  it('transforms CURATOR_ALLOW_LIST from comma-separated string', () => {
    const env = parseEnv(BackendEnvSchema as z.ZodSchema<any>, {
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      GEMINI_API_KEY: 'key',
      CURATOR_ALLOW_LIST: 'alpha, beta, gamma',
    })
    expect(env.CURATOR_ALLOW_LIST).toEqual(['alpha', 'beta', 'gamma'])
  })
})
