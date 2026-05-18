# Integrations

Each `integrations/<provider>/` package is a request-scoped adapter. None of them initiate periodic activity. None of them are imported directly by `apps/frontend`; only `apps/backend` (and, for the PowerShell side, `apps/bridge`) calls them, and only after `packages/permissions` has verified a Grant.

## Provider matrix

| Provider  | Purpose                               | Inbound (webhook)               | Outbound (Grant-gated)           |
| --------- | ------------------------------------- | ------------------------------- | -------------------------------- |
| Notion    | DB/page read+write, command bus       | yes (Phase 6 — replaces poller) | yes                              |
| Slack     | channel notifications, slash commands | yes                             | yes                              |
| Sentry    | error capture, project read           | optional                        | yes                              |
| Stripe    | customer + charge ops                 | yes                             | yes                              |
| HubSpot   | CRM contacts, deals                   | optional                        | yes                              |
| Amplitude | event capture, user identify          | n/a                             | yes                              |
| Linear    | issue read+create                     | yes                             | yes                              |
| Gemini    | LLM inference (`@google/genai`)       | n/a                             | yes                              |
| Ollama    | local LLM inference (Neural Bridge)   | n/a                             | yes                              |
| RetroArch | UDP control on `:55355`               | n/a                             | yes (via apps/bridge on `:8090`) |

## Add a new provider

1. Create `integrations/<provider>/package.json` with a typed client (HTTP, SDK, or UDP).
2. Register its scope constants in `packages/permissions/src/scope.ts`.
3. Add a route handler under `apps/backend/src/routes/integrations.ts` that calls `permissions.verify()` before invoking the client.
4. (Optional) Add a webhook verifier under `integrations/<provider>/verifyWebhook.ts` and a route under `apps/backend/src/routes/webhooks.ts`.
5. Document scopes in this file.

Full content lands during Phases 5–6.
