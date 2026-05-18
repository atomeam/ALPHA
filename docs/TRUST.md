# Alpha Trust Architecture

> Status: **Phase 0 skeleton** — this document defines the canonical trust model that the rest of the codebase will be built around. Implementation lives in `packages/permissions` and the runtime kernel in `packages/alpha-core`; both are intentionally empty at Phase 0.

Alpha is a **trust-first** ecosystem. Every cross-boundary action — between apps, packages, integrations, and external users — passes through a single explicit-request trust kernel. No code path may bypass it, and no grant is ever implied.

This document is the source of truth for:

1. The **Explicit-Request Trust Kernel**: how decisions are made.
2. The **Grant Models**: what an authorization actually looks like.
3. The **routing contract**: how the kernel and grants compose at runtime.
4. The **periodic behavior allow-list**: which repeating behaviors are allowed.

---

## 1. Principles

The kernel obeys five non-negotiable principles:

1. **Deny by default.** Absence of a grant is a denial. There is no ambient trust — not for the backend, not for the frontend, not for internal packages.
2. **Explicit request, explicit subject, explicit scope.** Every call into the kernel names who is asking, what they want to do, and which resource they want to act on. The kernel never infers any of these.
3. **One kernel, one decision point.** There is exactly one trust kernel per process. Integrations, apps, and packages do not roll their own authorization layer; they delegate to the kernel.
4. **Decisions are auditable.** Every allow/deny is logged with the full request, the matched grant if one exists, and a stable decision id. Audit logs are append-only.
5. **Grants are data, not code.** Grants are declarative records that can be reviewed, diffed, versioned, and revoked without redeploying.

---

## 2. Periodic behavior allow-list

No passive background monitoring, scraping, schedulers, or provider polling are allowed in Alpha.

Only three patterns may produce repeating or repeatable activity:

1. **Frontend → own backend `/api/health` ping**: no external data and no provider call. Used for cockpit UX only.
2. **Webhook receivers** reacting to provider-initiated events. Any outbound call triggered by a webhook still goes through the trust kernel.
3. **User-clicked actions** such as "Refresh," "Run Cycle," "Sync Now," or "Queue Command." These are synchronous, explicit, and logged with a user-triggered origin.

Anything else — `setInterval`, `cron`, PowerShell `while`, Notion poller, telemetry timer — is a trust violation by construction. The pre-merge bridge has one known violation (`atomarcade-bridge/homebase.ps1` `Tick-NotionPoller`); it is replaced during Phase 6 with a webhook receiver and explicit "Sync Now" path.

---

## 3. The Explicit-Request Trust Kernel

The kernel exposes a single primary API:

```ts
trust.check(request: TrustRequest): TrustDecision;
```

### 3.1 `TrustRequest`

A `TrustRequest` is a fully self-describing question. The kernel must be able to answer it using only the request and the active grants registry — never global state, never the caller's identity inferred from a stack trace, never environment variables.

```ts
interface TrustRequest {
  /** Stable subject id, e.g. "user:42", "app:backend", "integration:linear". */
  subject: SubjectId;

  /** Verb describing the intended action, e.g. "read", "write", "invoke". */
  action: Action;

  /** Resource being acted on, in URN form, e.g. "urn:alpha:notion:db/roadmap". */
  resource: ResourceUrn;

  /** Free-form, signed context the caller wants the kernel to consider. */
  context?: Record<string, unknown>;

  /** Correlation id for tracing across the kernel and audit log. */
  requestId: string;
}
```

### 3.2 `TrustDecision`

```ts
type TrustDecision =
  | { outcome: 'allow'; grantId: GrantId; decisionId: string; expiresAt?: string }
  | { outcome: 'deny'; reason: DenyReason; decisionId: string };
```

The kernel never returns `undefined` and never throws "not sure." Every call resolves to allow or deny. Callers must handle both branches at the call site — there is no default-allow shortcut.

### 3.3 Decision pipeline

For each `TrustRequest`, the kernel runs the same five-stage pipeline:

1. **Validate** the request shape. Malformed requests are denied with `reason: "malformed_request"`.
2. **Resolve subject** against the grants registry. Unknown subjects are denied with `reason: "unknown_subject"`.
3. **Match grants** whose `(subject, action, resource)` triple covers the request. The first non-expired, non-revoked match wins.
4. **Evaluate conditions** declared on the matched grant. Any failed condition demotes the decision to deny.
5. **Emit audit record** for every outcome, allow or deny, before returning.

Stages 1–4 are pure functions of the request and registry snapshot. Stage 5 is the only stage with side effects.

### 3.4 Deny reasons

Default-deny returns deterministic reasons and always emits an audit record.

| Condition                  | HTTP | `reason`             |
| -------------------------- | ---- | -------------------- |
| Malformed request          | 400  | `malformed_request`  |
| Unknown subject            | 401  | `unknown_subject`    |
| No matching grant exists   | 401  | `missing_grant`      |
| Matching grant is expired  | 401  | `expired_grant`      |
| Matching grant was revoked | 403  | `revoked_grant`      |
| Condition failed           | 403  | `condition_failed`   |
| Ephemeral grant invalid    | 403  | `invalid_ephemeral`  |
| Kernel unavailable         | 503  | `kernel_unavailable` |

---

## 4. Grant Models

A **grant** is a signed, declarative record that says: "subject S may perform action A on resource R, possibly subject to conditions C, until time T." Alpha supports four grant variants. Every grant in the registry conforms to exactly one.

### 4.1 `DirectGrant` — point-to-point authorization

The simplest model. One subject, one action, one resource.

```ts
interface DirectGrant {
  kind: 'direct';
  id: GrantId;
  subject: SubjectId;
  action: Action;
  resource: ResourceUrn;
  conditions?: Condition[];
  issuedAt: string;
  expiresAt?: string;
  issuer: SubjectId;
  signature: string;
}
```

Use when a single caller needs a single capability, such as "the backend may write to `urn:alpha:notion:db/roadmap`."

### 4.2 `ScopeGrant` — bounded delegation

Lets a subject act on a family of resources matching a URN prefix, with an explicit action set. Wildcards are allowed only on the resource axis, never on subject or action.

```ts
interface ScopeGrant {
  kind: 'scope';
  id: GrantId;
  subject: SubjectId;
  actions: Action[];
  resourcePrefix: ResourceUrn;
  conditions?: Condition[];
  issuedAt: string;
  expiresAt?: string;
  issuer: SubjectId;
  signature: string;
}
```

### 4.3 `DelegationGrant` — capability handoff

Allows subject A to act on behalf of subject B for a narrow scope. Used when an integration needs to perform a workflow for a specific user without inheriting that user's full authority.

```ts
interface DelegationGrant {
  kind: 'delegation';
  id: GrantId;
  delegate: SubjectId;
  onBehalfOf: SubjectId;
  actions: Action[];
  resourcePrefix: ResourceUrn;
  conditions?: Condition[];
  issuedAt: string;
  expiresAt: string;
  issuer: SubjectId;
  signature: string;
}
```

The kernel evaluates a delegation grant by re-running `trust.check` for `onBehalfOf` against the same resource/action. Delegation can never expand authority, only narrow it.

### 4.4 `EphemeralGrant` — request-scoped, short-lived

Issued by the kernel itself in response to a successful `trust.check`, to carry an allow decision across a process or service boundary. Ephemeral grants are bearer tokens with explicit `expiresAt`, never longer than the configured `TRUST_EPHEMERAL_TTL` default of 60 seconds.

```ts
interface EphemeralGrant {
  kind: 'ephemeral';
  id: GrantId;
  subject: SubjectId;
  action: Action;
  resource: ResourceUrn;
  rootDecisionId: string;
  issuedAt: string;
  expiresAt: string;
  issuer: 'kernel';
  signature: string;
}
```

Ephemeral grants are the only grants the kernel itself may mint.

### 4.5 Conditions

`Condition` is a closed enum of typed predicates evaluated during pipeline stage 4. The Phase 0 set is intentionally small:

| Condition        | Meaning                                                  |
| ---------------- | -------------------------------------------------------- |
| `time_window`    | Allow only between two timestamps.                       |
| `rate_limit`     | Allow no more than N matching decisions per window.      |
| `context_equals` | Allow only if `request.context[k]` equals a fixed value. |
| `context_one_of` | Allow only if `request.context[k]` is in a fixed set.    |
| `requires_mfa`   | Allow only if `request.context.mfa === true`.            |

New conditions require a docs change here before implementation.

---

## 5. Routing contract

The trust-first routing layer sits in front of every integration. The contract is:

1. A caller constructs a `TrustRequest`.
2. The router calls `trust.check(request)`.
3. On `allow`, the router issues a short-lived `EphemeralGrant` and forwards the call to the target integration.
4. The integration verifies the ephemeral grant against the kernel's signing key before acting.
5. On `deny`, the router returns a structured error containing the `decisionId`, never the matched grant or registry state.
6. The caller may surface the `decisionId` to the user for support purposes.

Integrations never read the grants registry directly. They never call external services without an ephemeral grant. The kernel is the only component that holds the signing key.

```text
Frontend ──POST /api/integrations/<provider>/<action>──▶ Backend
                                                          │
                                                          ▼
                                              trust.check(TrustRequest)
                                                          │
                                  ┌───────────────────────┴───────────────────────┐
                                  ▼                                               ▼
                              allow                                          deny
                                  │                                               │
                                  ▼                                               ▼
                       issue EphemeralGrant                       logger.event("trust-denied")
                                  │                                               │
                                  ▼                                               ▼
                       integrations/<provider>.<action>                  deny response
                                  │
                                  ▼
                       logger.event("integration-call")
```

---

## 6. Provider scope draft

These move to `packages/permissions/src/scope.ts` constants once implementation begins.

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

---

## 7. Grant registry storage

Grants persist locally during early phases. Filesystem JSON is the Phase 0 stand-in; the production target is intentionally undecided.

Any local grant store must be owner-read/write only, for example mode `0600`, and deployment checklists must document host controls. Grants are never synced to cloud without a separate grant whose own scope is `alpha:grants:sync`.

---

## 8. Open questions tracked outside Phase 0

These are intentionally not resolved at Phase 0. They are listed so future phases know what is and is not decided:

- Persistent storage backend for the grants registry.
- Cross-process kernel federation for multiple Alpha instances.
- UI for grant authoring and review.
- Revocation propagation latency targets.
- Signing-key storage and rotation policy.
- Operator identity/MFA provider.

Until those phases land, the rules above are the entire trust contract.
