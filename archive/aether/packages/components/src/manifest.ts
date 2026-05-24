import { z } from "zod"

export const CapabilityTag = z.enum([
  "ui:render",
  "ui:interactive",
  "read:state",
  "write:state",
  "network:fetch",
])
export type CapabilityTag = z.infer<typeof CapabilityTag>

export const PropSpecSchema = z.object({
  type: z.enum(["string", "number", "boolean", "enum", "array"]),
  required: z.boolean().default(false),
  enum: z.array(z.string()).optional(),
  description: z.string().optional(),
})
export type PropSpecSchema = z.infer<typeof PropSpecSchema>

export const ComponentManifestEntry = z.object({
  type: z.string(),
  description: z.string(),
  propsSchema: z.record(z.string(), PropSpecSchema),
  capabilities: z.array(CapabilityTag).default(["ui:render"]),
  maxPerResponse: z.number().int().positive().optional(),
})
export type ComponentManifestEntry = z.infer<typeof ComponentManifestEntry>

export const ComponentManifest = z.array(ComponentManifestEntry)
export type ComponentManifest = z.infer<typeof ComponentManifest>

// Source of truth — single definition
export const MANIFEST: ComponentManifest = [
  {
    type: "stat",
    description: "Single large number with a label. For KPIs and metrics.",
    propsSchema: {
      label: { type: "string", required: true, description: "Caption shown above the value" },
      value: { type: "string", required: true, description: "The number or text to display" },
      trend: { type: "enum", required: false, enum: ["up", "down", "flat"] },
    },
    capabilities: ["ui:render"],
  },
  {
    type: "chart",
    description: "Line, bar, or pie chart. Pass data as array of {x, y} points.",
    propsSchema: {
      kind: { type: "enum", required: true, enum: ["line", "bar", "pie"] },
      data: { type: "array", required: true, description: "Array of {x, y} data points" },
      title: { type: "string", required: false },
    },
    capabilities: ["ui:render"],
    maxPerResponse: 4,
  },
  {
    type: "list",
    description: "Vertical list with items and optional icons.",
    propsSchema: {
      items: { type: "array", required: true, description: "Array of string items" },
      icon: { type: "string", required: false },
    },
    capabilities: ["ui:render"],
  },
  {
    type: "status",
    description: "Status indicator with color and label.",
    propsSchema: {
      label: { type: "string", required: true },
      color: { type: "enum", required: false, enum: ["green", "yellow", "red", "gray"] },
    },
    capabilities: ["ui:render"],
  },
  {
    type: "gauge",
    description: "Radial gauge for percentage values.",
    propsSchema: {
      value: { type: "number", required: true, description: "Percentage 0-100" },
      label: { type: "string", required: false },
    },
    capabilities: ["ui:render"],
  },
]

// Derived helpers for consumers
export const ALLOWED_TYPES: ReadonlySet<string> = new Set(MANIFEST.map((e) => e.type))

export function getEntry(type: string): ComponentManifestEntry | undefined {
  return MANIFEST.find((e) => e.type === type)
}

export function isKnownType(type: string): boolean {
  return ALLOWED_TYPES.has(type)
}