import { describe, it, expect } from 'vitest'
import { 
  MANIFEST, 
  ComponentManifest, 
  ALLOWED_TYPES, 
  getEntry, 
  isKnownType,
  type ComponentManifestEntry 
} from './index'

describe('ComponentManifest', () => {
  it('parses against its own schema without error', () => {
    const result = ComponentManifest.safeParse(MANIFEST)
    expect(result.success).toBe(true)
  })

  it('has no duplicate types', () => {
    const types = MANIFEST.map(e => e.type)
    const unique = new Set(types)
    expect(unique.size).toBe(types.length)
  })

  it('includes known types for Curator', () => {
    expect(isKnownType('stat')).toBe(true)
    expect(isKnownType('chart')).toBe(true)
    expect(isKnownType('list')).toBe(true)
    expect(isKnownType('status')).toBe(true)
    expect(isKnownType('gauge')).toBe(true)
  })

  it('rejects unknown types', () => {
    expect(isKnownType('unknown')).toBe(false)
  })

  it('getEntry returns entry for known type', () => {
    const entry = getEntry('stat')
    expect(entry).toBeDefined()
    expect(entry?.type).toBe('stat')
  })

  it('getEntry returns undefined for unknown type', () => {
    const entry = getEntry('invalid')
    expect(entry).toBeUndefined()
  })

  it('entry has correct propsSchema', () => {
    const stat = getEntry('stat') as ComponentManifestEntry
    expect(stat.propsSchema.label.required).toBe(true)
    expect(stat.propsSchema.value.required).toBe(true)
    expect(stat.propsSchema.trend.required).toBe(false)
  })
})