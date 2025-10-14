# Control Plane & Policy AI v2.0 — Build Specification (Developer Hand‑Off)

**Subsystems:** `@nublox/sqlx-control` (Core CP APIs, Registry, Policy Engine, Fleet Controller), `@nublox/sqlx-policy` (Policy DSL & Evaluator), `@nublox/sqlx-audit` (Tamper Audit Graph)
**Owners:** Platform — Control & Governance
**Status:** Ready for Implementation
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Scope

Provide the **central governance brain** for SQLx OS: a federated Control Plane that

* registers **dialect fingerprints** and **node capabilities**,
* distributes **policies** (RBAC/ABAC, masking, RLS, residency),
* coordinates **deployments** (APIs/ORM bundles),
* ingests **telemetry** and generates **causal insights**,
* persists an immutable **Tamper Audit Graph**,
* and exposes a stable API for **Policy AI** decisions at runtime.

**Out of scope:** Developer UI (Console), billing, vendor‑specific infrastructure orchestrators.

---

## 2. Success Criteria (Acceptance)

* **Reliability:** 99.95% monthly availability for decision API; decisions ≤ **8 ms** p95 from warm cache.
* **Consistency:** Policies propagate globally with **< 3 s** p95 end‑to‑end (publish → all gateways/cores observe).
* **Security:** All artifacts (policies, bundles) **signed** (Ed25519); all decisions **audited**.
* **Coverage:** Enforce masking, RLS, deny, and residency across API/ORM/Core.
* **Scalability:** 10k req/s policy decisions aggregated across fleet with horizontal scale.

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          SQLx Control Plane v2.0                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. Registry Service (fingerprints, nodes, bundles)                           │
│ 2. Policy Service (Policy DSL, evaluator, decision cache)                    │
│ 3. Fleet Controller (deploy, rollout, canary, revoke)                        │
│ 4. Telemetry Ingest (OTel collector, narrative builder hooks)                │
│ 5. Tamper Audit Graph (append‑only, signed)                                  │
│ 6. Sync Bus (gRPC/HTTP2 push; CRDT state for policy/version vectors)         │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Dataflows**

```
Node.register → Registry
Policy.publish → Sync Bus → Gateway/Core/ORM decision caches
Deploy.publish → Fleet Controller → Gateways → Health → Switch
Telemetry.emit → Ingest → Narratives → Insights → Policy AI learning
Audit.write → Tamper Graph (immutable, signed)
```

---

## 4. External APIs (Stable Contracts)

### 4.1 REST/gRPC Endpoints (Control Plane)

```
POST   /v2/registry/fingerprint        # from FLR: register dialect profile
GET    /v2/registry/nodes/:id          # node capabilities & status
POST   /v2/policy/publish              # publish policy bundle (signed)
GET    /v2/policy/:profile             # fetch policy bundle (signed)
POST   /v2/deploy/publish              # publish API/ORM bundle
POST   /v2/deploy/rollout              # start canary/blue‑green
POST   /v2/decision/batch              # (low‑latency) ABAC decisions
POST   /v2/audit/append                # append signed audit event
POST   /v2/sync/subscribe (stream)     # push updates (policies, bundles)
```

### 4.2 Decision API (Request/Response)

```ts
export interface DecisionRequest {
  subject: { id: string; roles?: string[]; attrs?: Record<string,unknown> };
  action: 'select'|'insert'|'update'|'delete'|'ddl'|'api_call';
  resource: { type: 'table'|'column'|'endpoint'; id: string; attrs?: Record<string,unknown> };
  context?: { region?: string; tenant?: string; time?: number; ip?: string; labels?: string[] };
}

export interface DecisionEffect {
  allow: boolean;
  masks?: Array<{ column: string; fn: 'mask_email'|'mask_phone'|'hash'|'redact' }>;
  rowFilters?: Array<{ entity: string; predicate: string }>; // e.g., tenant='acme' AND region='EU'
  obligations?: string[]; // e.g., 'log', 'notify'
  ruleId: string; // rule that triggered
}
```

### 4.3 Artifact Signatures

* Policies and deployment bundles are signed (Ed25519).
* Node verifies signatures before activation; rejects on mismatch.

---

## 5. Policy Language (DSL)

### 5.1 Model

* **Subjects**: roles/attributes; **Resources**: tables/columns/endpoints; **Actions**: select/insert/update/delete/ddl/api_call; **Conditions**: boolean expressions over context (region, tenant, time, ip, labels).
* **Effects**: `allow|deny`, `mask`, `filter` (RLS), `obligations`.

### 5.2 Policy Bundle Schema

```json
{
  "version": "2.0",
  "id": "enterprise-default",
  "rules": [
    {
      "id": "eu-data-boundary",
      "target": { "resource": "column:users.email" },
      "when": "context.region != 'EU'",
      "effect": { "mask": [{"column": "users.email", "fn": "mask_email"}] }
    },
    {
      "id": "tenant-row-filter",
      "target": { "resource": "table:orders" },
      "when": "subject.attrs.tenant != null",
      "effect": { "filter": [ { "entity":"orders", "predicate":"tenant = ${subject.attrs.tenant}" } ] }
    },
    {
      "id": "pii-deny-nonprod",
      "target": { "resource": "table:users" },
      "when": "context.env != 'prod' && resource.attrs.containsPII == true",
      "effect": { "allow": false }
    }
  ]
}
```

### 5.3 Evaluator

* Implemented as **Constraint Logic Programming (CLP)** engine:

  * Compile `when` expressions to predicate functions.
  * Resolve conflicts by **priority** (explicit), then **specificity** (column > table > endpoint), then **deny‑overrides**.
* Output is **DecisionEffect** used by API/ORM/Core.

### 5.4 Decision Cache

* Per‑node **LFU+TTL** cache keyed by `(subject, action, resource, contextHash)`.
* Push‑invalidated on policy publish via Sync Bus.

---

## 6. Registry Service

### 6.1 Fingerprints & Nodes

* Store **DialectProfile** from FLR, node metadata (region, versions, capabilities, lastSeen).
* Maintain **health state** (OK, WARN, DEGRADED, DOWN) based on heartbeat & error budgets.

### 6.2 Bundles

* Track deployment bundles (API/ORM) with version vectors, signatures, region mapping, and rollout status.

---

## 7. Fleet Controller (Deployments)

### 7.1 Rollout Strategies

* **Blue/Green:** deploy new bundle alongside old; switch on healthy.
* **Canary:** route 1%, 5%, 25%, 50%, 100% with error‑budget gates.
* **Rollback:** automatic on SLO breach (latency/error rate/policy denials spike).

### 7.2 Health & Gates

* Use Observability metrics: p50/p95/p99, error %, cache hit %, policy denial rate.
* Publish **rollout events** to Tamper Audit Graph.

---

## 8. Sync Bus (Distribution)

* **Transport:** gRPC streams over HTTP/2; fallback to SSE/HTTP long‑poll.
* **State:** CRDT (LWW‑register) for policy versions; vector clocks to dedupe out‑of‑order updates.
* **Fanout:** regional relays for low latency.

---

## 9. Tamper Audit Graph

* Append‑only, content‑addressed logs; each event signed and hash‑chained.
* Event types: `policy.publish`, `policy.decision`, `deploy.publish`, `deploy.switch`, `node.register`, `anomaly.detected`.
* Verifiable proof: Merkle root per epoch; exportable for compliance.

---

## 10. Integrations & Enforcement Points

| Component       | Enforcement                                                        |
| --------------- | ------------------------------------------------------------------ |
| **API Gateway** | Verify token → Decision API → apply masks/filters/deny → audit.    |
| **Helix ORM**   | Pre‑IR compile: inject row filters; projection masking.            |
| **Helix Core**  | Final guard before execution; deny unsafe DDL; redact result sets. |
| **Observe**     | Generate narratives for policy‑related anomalies.                  |

---

## 11. Security Model

* **Identity:** Service accounts + end‑user tokens; OIDC/JWT with short TTL.
* **mTLS** for node↔Control communication; certificate rotation via ACME‑like flow.
* **Secrets:** stored in KMS; never persisted in plaintext; config uses secret refs.

---

## 12. Performance & Sizing

* Decision API target: **p50 2 ms**, **p95 8 ms**, **p99 15 ms** (warm cache).
* Cold path (no cache): ≤ 40 ms p95 under 10 rules/rsc average; scale horizontally.
* Sync fanout: < 1 s within region; < 3 s global p95.

---

## 13. Configuration

```yaml
control:
  region: eu-west-2
  sync:
    transport: grpc
    retryBackoffMs: 50
  decisionCache:
    ttlMs: 30000
    maxEntries: 500000
policy:
  defaultProfile: enterprise-default
  denyOverrides: true
registry:
  heartbeatMs: 5000
  downAfterMs: 20000
audit:
  merkleEpochMs: 60000
```

---

## 14. Telemetry & Observability

* **Traces:** `cp.policy.decision`, `cp.sync.push`, `cp.deploy.switch`.
* **Metrics:** decision latency histograms, cache hit %, sync lag, rollout SLOs.
* **Logs:** structured with `traceId`; redaction policies enforced.

---

## 15. Testing Strategy

### 15.1 Unit

* Policy evaluator (precedence, masks, filters), signature verification, CRDT merges.

### 15.2 Integration

* End‑to‑end policy publish → push → gateway enforcement.
* Deploy canary with error‑budget gates and automatic rollback.

### 15.3 Performance

* Load test Decision API to 10k rps; measure latencies and hit rates.
* Sync propagation with 1k nodes across 3 regions.

### 15.4 Security

* Fuzz policy inputs; signature tamper tests; mTLS handshake failures.

---

## 16. Milestones & Work Breakdown

|  Phase | Scope                | Deliverables                    | Owner    | Exit Criteria         |
| -----: | -------------------- | ------------------------------- | -------- | --------------------- |
| **P1** | Scaffold & Contracts | gRPC/REST proto + TS interfaces | Platform | build passes          |
| **P2** | Registry             | node/fingerprint/bundle CRUD    | Platform | nodes visible         |
| **P3** | Policy Engine        | DSL + evaluator + cache         | Policy   | unit tests pass       |
| **P4** | Sync Bus             | push distribution + CRDT        | Platform | sub‑second regional   |
| **P5** | Fleet Controller     | publish/canary/rollback         | Platform | staging rollout works |
| **P6** | Audit Graph          | signed append‑only log          | Trust    | verifiable roots      |
| **P7** | Integration          | API/ORM/Core enforcement        | All      | E2E demo              |
| **P8** | Hardening            | perf/security/docs              | All      | GA readiness          |

---

## 17. Reference Pseudocode

```ts
export async function decide(req: DecisionRequest): Promise<DecisionEffect> {
  const key = cacheKey(req);
  const cached = decisionCache.get(key);
  if (cached) return cached;

  const rules = policyStore.get(req.resource.id); // table/column/endpoint scope
  const effect = evaluate(rules, req); // CLP evaluator
  decisionCache.set(key, effect, ttlMs);

  audit.append({ type: 'policy.decision', req, effect });
  return effect;
}
```

---

## 18. Risks & Mitigations

* **Risk:** Policy storms (rapid updates) thrash caches.
  **Mitigation:** coalesce updates; exponential backoff; version pinning per request.
* **Risk:** Distributed inconsistency during network partitions.
  **Mitigation:** CRDT LWW + explicit version fences; deny‑overrides until convergence.
* **Risk:** Decision latency spikes under load.
  **Mitigation:** reservoir sampling + admission control; shard caches per keyspace.

---

## 19. Future Hooks (v2.1+)

* **Policy AI Learner:** auto‑derive deny/mask suggestions from incident narratives.
* **Natural Policy Authoring:** NL → DSL compiler with formal verification.
* **Attribute Broker:** external enrichments (device posture, risk score) via OPA‑style data sources.

---

> *Governance that thinks: fast decisions, verifiable trust, global coherence.*
