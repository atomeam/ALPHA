# Trust architecture

The hard rule: **no passive background monitoring or scraping.** Every outbound integration call is explicitly user-permissioned and request-scoped.

## Periodic behavior allow-list

Only three patterns may produce repeating activity in Alpha:

1. **Frontend → own backend `/api/health` ping** (no external data, no provider call). Used for cockpit UX only.
2. **Webhook receivers** reacting to provider-initiated events. The provider initiated; we did not. Any _outbound_ call triggered by a webhook still goes through the Grant pipeline below.
3. **User-clicked actions**: "Refresh", "Run Cycle", "Sync Now", "Queue Command". All synchronous, all logged with `origin=cockpit, trigger=user_explicit_*`.

Anything else — `setInterval`, `cron`, PowerShell `while`, Notion poller, telemetry timer — is a trust violation by construction. The pre-merge code has exactly one such violation (`atomarcade-bridge/homebase.ps1` `Tick-NotionPoller`); it is being replaced with the webhook receiver in Phase 6.

## Grant model

Lives in `packages/permissions` (Phase 4).

```ts
interface Grant {
  id: string;
  user_id: string;
  integration_id: string; // 'notion' | 'slack' | 'sentry' | …
  scope: string; // 'notion:db:read:<dbId>' | 'slack:channel:post:<chId>' | …
  issued_at: string; // ISO
  expires_at: string | null; // ISO; null = until revoked
  fingerprint: string; // hash of user + scope + provider creds reference
  audit_id: string; // links to logger event
}
```

## Outbound call pipeline

```
Frontend ──POST /api/integrations/<provider>/<action>──▶ Backend
                                                          │
                                                          ▼
                                            permissions.verify(grant, scope)
                                                          │
                                            ┌─────────────┴─────────────┐
                                            ▼                           ▼
                                       scope valid                  scope missing
                                            │                           │
                                            ▼                           ▼
                                  alpha-core.curator         logger.event('grant-denied')
                                            │                           │
                                            ▼                           ▼
                              integrations/<provider>.<action>     400 no_grant
                                            │
                                            ▼
                                  logger.event('integration-call', …)
```

Default-deny. Missing or expired Grant ⇒ 4xx, never silent. Every Grant check writes a logger event.

## Scopes (initial draft)

| Provider       | Example scopes                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Notion         | `notion:db:read:<id>`, `notion:db:write:<id>`, `notion:page:read:<id>`, `notion:page:write:<id>` |
| Slack          | `slack:channel:read:<id>`, `slack:channel:post:<id>`, `slack:dm:post:<userId>`                   |
| Sentry         | `sentry:project:read:<slug>`, `sentry:event:capture:<dsn>`                                       |
| Stripe         | `stripe:customers:read`, `stripe:charges:create`, `stripe:webhook:receive`                       |
| HubSpot        | `hubspot:contacts:read`, `hubspot:contacts:write`, `hubspot:deals:read`                          |
| Amplitude      | `amplitude:event:capture`, `amplitude:user:identify`                                             |
| Linear         | `linear:issues:read:<teamId>`, `linear:issues:create:<teamId>`                                   |
| Gemini         | `gemini:model:<name>:invoke`                                                                     |
| Ollama (local) | `ollama:model:<name>:invoke`                                                                     |
| RetroArch      | `retroarch:udp:send:<cmd>`                                                                       |

These move to `packages/permissions/src/scope.ts` constants once approved.

## Storage

Grants persist locally under `~/.alpha/grants.db` (sqlite or JSON store). They are **never synced to cloud** without a Grant whose own scope is `alpha:grants:sync`.
