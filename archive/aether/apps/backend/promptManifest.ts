import { MANIFEST, type ComponentManifestEntry } from "@aether/components"

/**
 * Generate system prompt fragment describing available components.
 * Inject this into your Gemini system prompt.
 */
export function manifestPromptFragment(): string {
  return MANIFEST.map((entry) => {
    const props = Object.entries(entry.propsSchema)
      .map(([name, spec]) => {
        const req = spec.required ? "required" : "optional"
        const enumPart = spec.enum ? ` (one of: ${spec.enum.join(", ")})` : ""
        const desc = spec.description ? ` - ${spec.description}` : ""
        return `  - ${name}: ${spec.type} (${req})${enumPart}${desc}`
      })
      .join("\n")
    return `### ${entry.type}\n${entry.description}\nProps:\n${props}`
  }).join("\n\n")
}