# Cognitive Security Framework v1.0 — Build Specification (Developer Hand‑Off)

**Subsystems:** `@nublox/sqlx-sec` (AuthN/Z, Token, Masking, RLS), `@nublox/sqlx-pii` (PII Diffusion & Classifiers), `@nublox/sqlx-audit` (Tamper Audit Graph integration), `@nublox/sqlx-kms` (Key Management)
**Owners:** Platform — Security & Trust
**Status:** Ready for Implementation
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Scope

Provide **zero‑trust, policy‑driven protection** across SQLx OS with:

* Ephemeral **identity & tokens** (service and user),
* Runtime **policy enforcement** (masking, deny, RLS) across Gateway/ORM/Core,
* **PII diffusion tracking** through HKG lineage and query plans,
* **Tamper‑evident auditing** and signed decision trails,
* Integrated **KMS** for key lifecycle, envelope encryption, and rotation.

**Out of scope:** Human identity provider UI, enterprise SSO configuration portals (Control Plane Console handles UX).

---

## 2. Security Objectives (Acceptance)

* **Zero‑Trust by Default:** every request authenticated, authorized, and audited; no implicit trust zones.
* **Least Privilege:** ABAC/RBAC reduce data surface; field‑ and row‑level controls enforced.
* **Provable Integrity:** audit chain verifiable (Merkle root) for all critical operations.
* **PII Safety:** track and prevent unintended PII propagation; masking enforced with policy; data egress logged.
* **Performance:** policy decision overhead ≤ **8 ms** p95 (warm cache); masking overhead ≤ **5%** p95.

---

## 3. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         Cognitive Security Framework                        │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. Identity & Token Service (OIDC/JWT, mTLS, ephemeral creds)               │
│ 2. Policy Enforcement Points (PEPs): Gateway, ORM, Core                     │
│ 3. Policy Decision Point (PDP): Control Plane Decision API                  │
│ 4. PII Diffusion Engine (classifiers + HKG lineage)                         │
│ 5. Tamper Audit Graph (append‑only, signed)                                 │
│ 6. KMS & Envelope Encryption (key rotation, tenant scoping)                 │
└────────────────────────────────────────────────────────────────────────────┘
```

**Signal Flow**

```
Request → PEP(Gateway) → PDP(Decision) → PEP Policy Apply (mask/filter/deny) → ORM/Core → DB
                                     ↘ Audit Append ↗               ↘ PII Diffusion Update ↗
```

---

## 4. Identity & Token Model

### 4.1 Token Types

* **End‑User JWT:** OIDC/OAuth2, 5–15 min TTL, audience `nublox-api`, signed by IdP.
* **Service Token:** short‑lived JWT (≤ 5 min) issued by Control Plane for inter‑service calls.
* **mTLS Certs:** node↔Control Plane auth (ACME‑like rotation; 24h TTL).

### 4.2 Token Claims (minimum)

```json
{
  "sub": "user|svc:123", "aud": "nublox-api", "iat": 1739478800, "exp": 1739479700,
  "roles": ["reader","analyst"],
  "tenant": "acme", "region": "eu-west-2", "labels": ["prod","mobile"]
}
```

### 4.3 Validation

* Gateway verifies signature, audience, expiry, and **DPoP** (optional) for replay protection.
* mTLS required for node control channels.

---

## 5. Policy Enforcement Points (PEPs)

### 5.1 Gateway PEP

* Pre‑routing: verify token, fetch decision from PDP, apply **field masking** and **row filters** in request composition (for reads) and in response filtering if needed.
* Deny early on disallowed actions; append audit event with rule id.

### 5.2 ORM PEP

* When building IR: inject **row‑level predicates**; project only permitted fields; apply masking transforms.

### 5.3 Core PEP

* Final guard before execution: verify PDP decision stamp; block disallowed DDL or dangerous operations (e.g., unrestricted full table export) and hash the operation into audit log.

---

## 6. Policy Decisions (PDP Integration)

* Use Control Plane **Decision API**.
* **Decision cache** per node (LFU+TTL).
* Attach **Decision Stamp** (signed summary: subject, resource, action, ruleId, exp) to request context; PEPs validate and enforce.

**Decision Stamp** (JWT‑like):

```json
{ "sub":"svc:api-gw", "res":"table:users", "act":"select", "ruleId":"eu-pii-mask", "exp":1739482200, "sig":"…" }
```

---

## 7. Field Masking, Row‑Level Security, and Deny

### 7.1 Masking Functions (built‑in)

* `mask_email`, `mask_phone`, `hash_sha256`, `redact`, `tokenize_ref` (deterministic surrogate keys via KMS).

### 7.2 RLS Injection

* Predicates injected at ORM compile stage and validated at Core. Example: `tenant = ${token.tenant} AND region = ${token.region}`.

### 7.3 Deny Semantics

* Deny overrides allow by default (configurable).
* Provide **remediation hint** (rule id, policy doc link) in error envelope.

---

## 8. PII Diffusion Tracking

### 8.1 Objectives

* Identify PII fields; track propagation through joins, projections, and API responses.

### 8.2 Classifiers

* Static heuristics (name patterns, column tags from HKG),
* Lightweight ML text classifier for sample values (optional, dev‑only),
* Manual overrides via HKG `attrs.containsPII=true`.

### 8.3 Diffusion Graph

* Add HKG edges `(Column:pii) -[flows_to]-> (Column|Endpoint)` when query plans or API resolvers include PII fields.
* Surface alerts when PII crosses **region** or **tenant** boundaries without masking.

### 8.4 Egress Control

* Gateways check diffusion graph and **block unmasked egress** to public endpoints or non‑EU regions, per policy.

---

## 9. Tamper Audit Graph Integration

* Append signed events: `auth.success`, `auth.failure`, `policy.decision`, `policy.violation`, `data.egress`, `ddl`, `export`.
* Chain events per `traceId` and **Merkle root** per epoch; expose verification API for auditors.

---

## 10. KMS & Encryption

### 10.1 Keys

* **Master Keys** per region in cloud KMS; **Data Keys** per tenant/entity via envelope encryption.
* Rotation policy: 90 days for data keys; 365 days for master keys; immediate revoke on compromise.

### 10.2 Usage

* Tokenization via `tokenize_ref(value, scope)` returns deterministic surrogate using HMAC‑KDF bound to scope.
* Secrets never written to logs; memory zeroization after use.

---

## 11. Error & Response Model

```json
{
  "error": {
    "code": "POLICY_DENIED|AUTH_FAILED|TOKEN_EXPIRED|INTERNAL",
    "message": "…",
    "ruleId": "eu-pii-mask",
    "traceId": "…"
  }
}
```

* Never include raw SQL or secret values; provide remediation link when possible.

---

## 12. Performance & Sizing Targets

* PDP decision p95 ≤ 8 ms (warm); PEP masking overhead ≤ 5% p95.
* Diffusion graph update ≤ 3 ms/event; audit append ≤ 2 ms/event.

---

## 13. Configuration

```yaml
security:
  decisionCache: { ttlMs: 30000, maxEntries: 200000 }
  masking: { default: redact, email: mask_email, phone: mask_phone }
  rls: { enforce: true }
  kms: { provider: aws-kms, region: eu-west-2, rotateDays: 90 }
  audit: { merkleEpochMs: 60000 }
```

---

## 14. Testing Strategy

### 14.1 Unit

* Token validation (sig/aud/exp/DPoP), masking functions, RLS injection, decision stamp verification.

### 14.2 Integration

* End‑to‑end: Gateway → PDP → ORM/Core; verify masks/filters/denials and audit trails.

### 14.3 Security

* Fuzz tokens/headers; replay attempts; mTLS downgrade attacks; policy bypass attempts.

### 14.4 Performance

* Load test decision & masking pipelines; ensure SLAs; assess diffusion graph costs.

---

## 15. Milestones & Work Breakdown

|  Phase | Scope                | Deliverables                     | Owner    | Exit Criteria     |
| -----: | -------------------- | -------------------------------- | -------- | ----------------- |
| **P1** | Scaffold & Contracts | token/PEP/PDP interfaces         | Sec      | build passes      |
| **P2** | Gateway PEP          | token verify + decision apply    | Edge     | policy tests pass |
| **P3** | ORM/Core PEP         | IR injection + final guard       | Platform | E2E passes        |
| **P4** | PII Diffusion        | classifiers + HKG edges + alerts | Sec      | alerts visible    |
| **P5** | Audit Graph          | signed append API + verification | Trust    | verifiable roots  |
| **P6** | KMS                  | key CRUD, rotation, tokenize_ref | Sec      | rotation demo     |
| **P7** | Hardening            | perf, fuzzing, docs              | All      | GA readiness      |

---

## 16. Reference Pseudocode

```ts
export async function enforce(ctx: RequestCtx, res: Resource) {
  const token = await verifyToken(ctx.headers);
  const stamp = await decideAndStamp(token, res); // PDP call + decision cache

  if (!stamp.allow) {
    audit.append({ type: 'policy.violation', tokenSub: token.sub, res: res.id, ruleId: stamp.ruleId });
    throw policyDenied(stamp.ruleId);
  }

  const masked = applyMasks(ctx.projection, stamp.masks);
  const rls = injectRowFilters(ctx.query, stamp.rowFilters);

  updateDiffusionGraph(masked, rls, token); // PII flows

  return { token, masked, rls };
}
```

---

## 17. Risks & Mitigations

* **Risk:** Decision latency under load.
  **Mitigation:** per‑node decision cache; push invalidations; circuit breakers with deny‑by‑default fallback.
* **Risk:** False positives in PII detection.
  **Mitigation:** human overrides in HKG; precision‑first classifiers; staged enforcement.
* **Risk:** Audit log growth.
  **Mitigation:** epoch compaction, cold storage export, proofs retained.

---

## 18. Future Hooks (v1.1+)

* Differential privacy utilities; query‑based noise injection for analytics.
* Hardware‑backed enclaves for token services.
* Continuous policy learning from incident narratives (Policy AI Learner).

---

> *Trust is earned continuously — verified, enforced, and provable.*
