# @aether/components

Component manifest — single source of truth for available UI components.

## What

Zod schema + registry defining what components the generative UI can emit:

- `stat` — KPI display
- `chart` — line/bar/pie
- `list` — items list
- `status` — color indicator
- `gauge` — radial gauge

## Consumers

1. **Curator** — imports `ALLOWED_TYPES` for default-deny gate
2. **Gemini prompt** — receives component spec via `manifestPromptFragment()`
3. **Frontend** — verifies registry against manifest at boot

## Usage

### Curator

```ts
import { ALLOWED_TYPES, getEntry } from "@aether/components"

if (!ALLOWED_TYPES.has(type)) {
  // reject
}
```

### Backend prompt

```ts
import { manifestPromptFragment } from "./promptManifest"
const COMPONENT_MANIFEST = manifestPromptFragment()
// inject into Gemini prompt
```

### Add a component

Edit `src/manifest.ts` — all three consumers update automatically.