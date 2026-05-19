# Tests

This directory is reserved for cross-workspace e2e tests that span multiple packages.

## Policy

- Unit tests live co-located with their owner app/package in `tests/` subdirectory
- Tests are owned by the workspace that contains the code they test
- If a test file spans multiple packages and cannot be owned by one, place it here with a descriptive name

## Current State

All workspace tests have been co-located:
- `apps/backend/tests/` → Orchestrator, IntegrationManager, VictusBridge tests
- `packages/contracts/tests/` → Contract unit tests (built-in src/*.test.ts)
- `packages/curator/tests/` → Curator unit tests (built-in src/*.test.ts)