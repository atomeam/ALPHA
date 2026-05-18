# 1. OBJECTIVE

Create a new central orchestrator service (`src/core/orchestrator.ts`) that ties together the IntegrationManager and VictusBridge into a single, cohesive task execution workflow. The orchestrator should accept an objective, maintain an internal plan array of steps to execute, and provide an execution loop that conditionally calls `IntegrationManager` or `VictusBridge` based on step type (external API vs local system operation).

# 2. CONTEXT SUMMARY

- **Existing Components:**
  - `IntegrationManager` (`src/core/integration_manager.ts`): Routes requests to external APIs and MCP servers
  - `VictusBridge` (`src/core/victus_bridge.ts`): Connects to local Victus runtime at `http://localhost:8080`
- **Goal:** Create a central orchestrator that sequences multi-step tasks across both external APIs and local operations
- **Testing Pattern:** Vitest with mocks (as seen in `tests/integration_manager.test.ts`)

# 3. APPROACH OVERVIEW

Create an `Orchestrator` class that:
1. Accepts an objective/mission description
2. Maintains an internal plan array containing steps to execute
3. Provides an execution loop that routes each step to the appropriate service:
   - Steps with `type: 'api'` → IntegrationManager
   - Steps with `type: 'local'` → VictusBridge
4. Returns structured results for each step and a final summary
5. Follows the same logger/initialization patterns established in the codebase

# 4. IMPLEMENTATION STEPS

## Step 1: Create `src/core/orchestrator.ts`

**Goal:** Implement the Orchestrator class with all required functionality

**Method:** Create a new TypeScript module containing:

- **Types:**
  - `OrchestratorStep` - A single step in a plan with type, action, params
  - `OrchestratorPlan` - An array of steps with metadata
  - `OrchestratorConfig` - Configuration for the orchestrator
  - `OrchestratorResult` - Result of executing a step or full plan
  - `StepType` - 'api' | 'local' | 'conditional'

- **Orchestrator Class:**
  - Constructor accepting config, IntegrationManager, and VictusBridge
  - `setObjective(objective: string)` method to set the mission
  - `addStep(step: OrchestratorStep)` method to add steps to the plan
  - `setPlan(steps: OrchestratorStep[])` method to set all steps at once
  - `executePlan()` method - runs all steps sequentially, returns results
  - `executeStep(step: OrchestratorStep)` - executes a single step via appropriate service
  - `clearPlan()` method - clears the internal plan array
  - Similar logging patterns to IntegrationManager

**Reference:** `src/core/integration_manager.ts` for style reference

## Step 2: Export from `src/core/index.ts`

**Goal:** Make Orchestrator accessible from the core module exports

**Method:** Add export for Orchestrator and its types to `src/core/index.ts`

## Step 3: Create `tests/orchestrator.test.ts`

**Goal:** Verify orchestrator can sequence multi-step tasks correctly

**Method:** Create unit tests with mocks covering:
- Orchestrator construction with dependencies
- Setting objective and building plan
- Executing 'api' type steps via IntegrationManager (mocked)
- Executing 'local' type steps via VictusBridge (mocked)
- Sequential step execution and result accumulation
- Error handling and step failure handling
- Clearing plan and resetting state

# 5. TESTING AND VALIDATION

**Success Criteria:**
- Orchestrator accepts an objective and maintains internal plan array
- `executePlan()` correctly sequences multi-step tasks
- 'api' type steps route to IntegrationManager
- 'local' type steps route to VictusBridge
- Results are properly accumulated and returned
- Unit tests with mocks pass
- Exports are properly typed
