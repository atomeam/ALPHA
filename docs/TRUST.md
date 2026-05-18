# Alpha Trust Architecture

> Status: **Phase 0 skeleton** — this document defines the canonical trust
> model that the rest of the codebase will be built around. Implementation
> lives in `packages/permissions` and the runtime kernel in
> `packages/alpha-core`; both are intentionally empty at Phase 0.

Alpha is a **trust-first** ecosystem. Every cross-boundary action — between
apps, packages, integrations, and external users — passes through a single
explicit-request trust kernel. No code path may bypass it, and no grant is
ever implied.

This document is the source of truth for:

1. The **Explicit-Request Trust Kernel** (how decisions are made).
2. The **Grant Models** (what an authorization actually looks like).
3. The **routing contract** (how the kernel and grants compose at runtime).

---

## 1. Principles

The kernel obeys five non-negotiable principles:

1. **Deny by default.** Absence of a grant is a denial. There is no
   "ambient" trust — not for the backend, not for the frontend, not for
   internal packages.
2. **Explicit request, explicit subject, explicit scope.** Every call into
   the kernel names *who* is asking, *what* they want to do, and *which*
   resource they want to do it on. The kernel never infers any of these.
3. **One kernel, one decision point.** There is exactly one trust kernel
   per process. Integrations, apps, and packages do not roll their own
   authorization layer; they delegate to the kernel.
4. **Decisions are auditable.** Every allow/deny is logged with the full
   request, the matched grant (if any), and a stable decision id. Audit
   logs are append-only.
5. **Grants are data, not code.** Grants are declarative records that can
   be reviewed, diffed, versioned, and revoked without redeploying.

---

## 2. The Explicit-Request Trust Kernel

The kernel exposes a single primary API:

```ts
trust.check(request: TrustRequest): TrustDecision
```

### 2.1 `TrustRequest`

A `TrustRequest` is a fully self-describing question. The kernel must be
able to answer it using only the request and the active grants registry —
never global state, never the caller's identity inferred from a stack
trace, never environment variables.

```ts
interface TrustRequest {
  /** Stable subject id (e.g. "user:42", "app:backend", "integration:linear"). */
  subject: SubjectId;

  /** Verb describing the intended action (e.g. "read", "write", "invoke"). */
  action: Action;

  /** Resource being acted on, in URN form (e.g. "urn:alpha:notion:db/roadmap"). */
  resource: ResourceUrn;

  /** Free-form, signed context the caller wants the kernel to consider. */
  context?: Record<string, unknown>;

  /** Correlation id for tracing across the kernel and the audit log. */
  requestId: string;
}
```

### 2.2 `TrustDecision`

```ts
type TrustDecision =
  | { outcome: "allow"; grantId: GrantId; decisionId: string; expiresAt?: string }
  | { outcome: "deny"; reason: DenyReason; decisionId: string };
```

The kernel never returns `undefined`, never throws "not sure". Every call
resolves to allow or deny. Callers must handle both branches at the call
site — there is no "default allow" shortcut.

### 2.3 Decision pipeline

For each `TrustRequest`, the kernel runs the same five-stage pipeline:

1. **Validate** the request shape. Malformed requests are denied with
   `reason: "malformed_request"`.
2. **Resolve subject** against the grants registry. Unknown subjects are
   denied with `reason: "unknown_subject"`.
3. **Match grants** whose `(subject, action, resource)` triple covers the
   request. The first non-expired, non-revoked match wins.
4. **Evaluate conditions** declared on the matched grant (see §3.4). Any
   failed condition demotes the decision to deny.
5. **Emit audit record** for every outcome (allow or deny) before returning.

Stages 1–4 are pure functions of the request and the registry snapshot.
Stage 5 is the only stage with side effects.

---

## 3. Grant Models

A **grant** is a signed, declarative record that says: "subject *S* may
perform action *A* on resource *R*, possibly subject to conditions *C*,
until time *T*." Alpha supports four grant variants. Every grant in the
registry conforms to exactly one.

### 3.1 `DirectGrant` — point-to-point authorization

The simplest model. One subject, one action, one resource.

```ts
interface DirectGrant {
  kind: "direct";
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

Use when a single caller needs a single capability (e.g. "the backend may
write to `urn:alpha:notion:db/roadmap`").

### 3.2 `ScopeGrant` — bounded delegation

Lets a subject act on a *family* of resources matching a URN prefix, with
an explicit action set. Wildcards are allowed only on the resource axis,
never on subject or action.

```ts
interface ScopeGrant {
  kind: "scope";
  id: GrantId;
  subject: SubjectId;
  actions: Action[];          // closed set, no "*"
  resourcePrefix: ResourceUrn; // e.g. "urn:alpha:notion:db/"
  conditions?: Condition[];
  issuedAt: string;
  expiresAt?: string;
  issuer: SubjectId;
  signature: string;
}
```

### 3.3 `DelegationGrant` — capability handoff

Allows subject *A* to act *on behalf of* subject *B* for a narrow scope.
Used when an integration needs to perform a workflow for a specific user
without inheriting that user's full authority.

```ts
interface DelegationGrant {
  kind: "delegation";
  id: GrantId;
  delegate: SubjectId;        // who is acting
  onBehalfOf: SubjectId;      // whose authority is being used
  actions: Action[];
  resourcePrefix: ResourceUrn;
  conditions?: Condition[];   // must include at least one time bound
  issuedAt: string;
  expiresAt: string;          // required, not optional
  issuer: SubjectId;
  signature: string;
}
```

The kernel evaluates a delegation grant by re-running `trust.check` for
`onBehalfOf` against the same resource/action — i.e. delegation can never
*expand* authority, only narrow it.

### 3.4 `EphemeralGrant` — request-scoped, short-lived

Issued by the kernel itself, in response to a successful `trust.check`, to
carry an allow decision across a process or service boundary. Ephemeral
grants are bearer tokens with explicit `expiresAt`, never longer than the
configured `TRUST_EPHEMERAL_TTL` (default: 60 seconds).

```ts
interface EphemeralGrant {
  kind: "ephemeral";
  id: GrantId;
  subject: SubjectId;
  action: Action;
  resource: ResourceUrn;
  rootDecisionId: string;     // the decision that produced this grant
  issuedAt: string;
  expiresAt: string;          // required, bounded by TRUST_EPHEMERAL_TTL
  issuer: "kernel";
  signature: string;
}
```

Ephemeral grants are the *only* grants the kernel itself may mint.

### 3.5 Conditions

`Condition` is a closed enum of typed predicates evaluated during
pipeline stage 4. The Phase 0 set is intentionally small:

| Condition         | Meaning                                                    |
| ----------------- | ---------------------------------------------------------- |
| `time_window`     | Allow only between two timestamps.                         |
| `rate_limit`      | Allow no more than *N* matching decisions per window.      |
| `context_equals`  | Allow only if `request.context[k]` equals a fixed value.   |
| `context_one_of`  | Allow only if `request.context[k]` is in a fixed set.      |
| `requires_mfa`    | Allow only if `context.mfa === true`.                      |

New conditions require a docs change here *before* implementation.

---

## 4. Routing contract

The trust-first routing layer (see `README.md`) sits in front of every
integration. The contract is:

1. A caller (app, package, or external request handler) constructs a
   `TrustRequest`.
2. The router calls `trust.check(request)`.
3. On `allow`, the router issues a short-lived `EphemeralGrant` and
   forwards the call to the target integration. The integration **must**
   verify the ephemeral grant against the kernel's signing key before
   acting.
4. On `deny`, the router returns a structured error containing the
   `decisionId` (never the matched grant, never the registry state). The
   caller may surface the `decisionId` to the user for support purposes.

Integrations never read the grants registry directly. They never call
external services without an ephemeral grant. The kernel is the only
component that holds the signing key.

---

## 5. Open questions (tracked outside Phase 0)

These are intentionally **not** resolved at Phase 0. They are listed here
so future phases know what is and isn't decided:

- Persistent storage backend for the grants registry (filesystem JSON is
  the Phase 0 stand-in; the production target is undecided).
- Cross-process kernel federation (multiple Alpha instances, shared
  registry).
- UI for grant authoring and review.
- Revocation propagation latency targets.

Until those phases land, the rules above are the entire trust contract.
