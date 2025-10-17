Perfect — this one connects all the prior layers (AIR → Kernel → Driver).
Below is a **fully-ready, world-class single-canvas** version of:

`docs/specs/udr/SQLx-UDR-Spec-v4.0.md`

---

````markdown
# SQLx Universal Dialect Runtime (UDR) Specification v4.0  
*Cross-Dialect Lowering, Routing, and Capability Negotiation for the SQLx Operating System*  
**Version:** 4.0 **Status:** Stable **Owner:** NuBlox Labs — Runtime & Driver Fabric Team  

---

## Executive Summary  
The **Universal Dialect Runtime (UDR)** is the translation and routing layer that bridges **AIR** (dialect-neutral representation) with physical **driver protocols**.  
It provides deterministic SQL compilation, capability negotiation, multi-target routing, and telemetry hooks.  
UDR enables SQLx to execute queries across any engine without external client libraries while preserving policy compliance, observability, and AI-driven optimizations.

---

## 1  Purpose and Scope  
- **Compile** normalized AIR graphs into dialect-specific SQL strings or binary protocols.  
- **Negotiate** capabilities between Kernel and driver (functions, data types, limits).  
- **Route** requests to the correct engine or replica set based on policy and topology.  
- **Emit** telemetry for performance learning and adaptive planning.  
- **Expose** a stable API to Kernel, Policy, and AI Fabric for consistent runtime control.

UDR acts as the **execution bridge** between logical intent and physical transport.

---

## 2  Architecture Overview  

```mermaid
flowchart LR
    AIR[AIR Graph] --> UDR
    UDR -->|Lower| DIALECT[Dialect Translator]
    UDR -->|Route| DRIVER[Driver Fabric]
    UDR --> OBS[Telemetry & Policy Hooks]
    OBS --> AI[AI Fabric]
    POL[Policy Engine] --> UDR
````

**Core Components**

| Component                 | Role                                                            |
| :------------------------ | :-------------------------------------------------------------- |
| **Lowering Engine**       | Converts AIRPlan → DialectSQL with capability-aware rewrites.   |
| **Capability Negotiator** | Determines supported features (types, JSON, window funcs).      |
| **Router**                | Directs query to the appropriate driver/session.                |
| **Plan Registry**         | Caches compiled dialect plans with hashes and version metadata. |
| **Telemetry Hooks**       | Emit driver-agnostic metrics, traces, and learning artifacts.   |

---

## 3  Dialect Capability Model

Each connected session advertises its **DialectCaps** at handshake.

| Capability         | Type   | Description                   | Example       |
| :----------------- | :----- | :---------------------------- | :------------ |
| `sql.version`      | string | Engine version                | `"9.2.0"`     |
| `json`             | bool   | Native JSON type support      | true          |
| `windowFunctions`  | bool   | Supports `OVER` clause        | true          |
| `ddlTransactional` | bool   | DDL rollback support          | false (MySQL) |
| `maxParams`        | int    | Max bind parameters           | 65535         |
| `identityInsert`   | bool   | Auto-increment insert control | true          |
| `vectorOps`        | bool   | Vector extension support      | false         |

**Negotiation Flow**

1. Driver emits `caps` after handshake.
2. UDR merges with schema-level overrides (e.g., disabled features).
3. Kernel caches `caps` keyed by dialect + version + tenant.

---

## 4  Lowering Engine

### 4.1  Responsibilities

* Transform AIR nodes into dialect-specific SQL.
* Substitute feature variants based on capabilities.
* Apply parameter binding and literal quoting safely.
* Produce stable `DialectSql` hashes for PPC and observability.

### 4.2  TypeScript Interface

```ts
export interface LoweringEngine {
  lower(plan: AirPlan, caps: DialectCaps): DialectSql;
  quoteIdent(id: string, dialect: string): string;
  literal(value: unknown, dialect: string): string;
  rewrite(node: AIRNode, caps: DialectCaps): AIRNode;
}

export interface DialectSql {
  sql: string;
  params?: unknown[];
  planHash: string;
  dialect: string;
}
```

### 4.3  Example Lowering

| AIR Expression             | MySQL Output               | PostgreSQL Output |   |    |
| :------------------------- | :------------------------- | :---------------- | - | -- |
| `LIMIT count=10`           | `LIMIT 10`                 | `LIMIT 10`        |   |    |
| `JSON_EXTRACT(col, '$.x')` | `JSON_EXTRACT(col, '$.x')` | `col->>'x'`       |   |    |
| `CONCAT(a,b)`              | `CONCAT(a,b)`              | `a                |   | b` |
| `RAND()`                   | `RAND()`                   | `RANDOM()`        |   |    |

---

## 5  Router

### 5.1  Routing Model

```ts
export interface Router {
  route(sql: DialectSql, session: Session, opts?: RouteOptions): Promise<DriverResult>;
}

export type RouteOptions = {
  class?: "L"|"B"|"A"|"S";
  readOnly?: boolean;
  region?: string;
  tenant?: string;
  policy?: PolicyDecision;
};
```

### 5.2  Routing Strategy

| Strategy      | Description                                                                         |
| :------------ | :---------------------------------------------------------------------------------- |
| **Primary**   | Default target; handles writes.                                                     |
| **Replica**   | Low-latency read-only queries; chosen via `policy.obligation=route("readReplica")`. |
| **Failover**  | Automatic redirection on health check failure.                                      |
| **Sharded**   | Deterministic key-based routing across multiple instances.                          |
| **Federated** | Multi-tenant workspace spanning engines; uses capability discovery.                 |

### 5.3  Telemetry Context

Each route emits:

* `trace_id`, `session_id`, `dialect`, `region`, `class`, `latency_ms`, `result_rows`, and AI reward.
  Metrics aggregated via the Telemetry Kernel Bus (TKB).

---

## 6  Plan Registry

A persistent, deduplicated store of compiled dialect plans.

| Field           | Type      | Description                        |
| :-------------- | :-------- | :--------------------------------- |
| `plan_hash`     | string    | SHA-256 of canonical SQL           |
| `air_id`        | string    | Source AIR plan identifier         |
| `dialect`       | string    | Target dialect                     |
| `created_at`    | timestamp | Registration time                  |
| `benefit_score` | float     | Observed PPC reuse or latency gain |
| `ai_reward`     | float     | RL feedback from AIF               |

**Policy**

* Stored under `/var/sqlx/registry/{tenant}/{dialect}/plans.db`.
* Old entries pruned by LRU + reward decay.
* Used by PPC to pre-admit known good plans.

---

## 7  Error Handling and Retry Semantics

| Error Class                | Action                                                          |
| :------------------------- | :-------------------------------------------------------------- |
| **Syntax Error**           | Report to Copilot for dialect diff training; mark plan invalid. |
| **Capability Mismatch**    | Retry with emulation rule; record `caps.unsupported`.           |
| **Timeout / I/O**          | Reroute to alternate replica; increment backoff.                |
| **Integrity / Constraint** | Forward to Kernel with explicit `constraintViolation`.          |
| **Plan Regression**        | Freeze plan; emit `udr.plan.regression`.                        |

All exceptions captured as structured telemetry events and surfaced in Observability.

---

## 8  AI Integration

UDR provides fine-grained data for Copilot’s reinforcement engine.

| Signal              | Description                                 |
| :------------------ | :------------------------------------------ |
| `reward`            | latency-based reward per plan               |
| `capability_update` | new or missing feature discovered           |
| `plan_regression`   | drift vs. baseline cost                     |
| `federated_route`   | cross-dialect routing success               |
| `embedding_diff`    | semantic delta between AIR and dialect plan |

Copilot uses these signals to evolve translation heuristics and propose new optimization rules.

---

## 9  Telemetry and Observability

**Events**

* `udr.lower.start|ok|error`
* `udr.route.start|ok|error`
* `udr.plan.cache.hit|miss`
* `udr.plan.regression`

**Metrics**

| Metric                         | Description                                    |
| :----------------------------- | :--------------------------------------------- |
| `sqlx_udr_latency_ms{phase}`   | Lowering, routing, or driver execution latency |
| `sqlx_udr_errors_total{class}` | Error counts by class                          |
| `sqlx_udr_cache_hit_ratio`     | Plan cache efficiency                          |
| `sqlx_udr_reward_mean`         | Average RL reward per plan                     |

---

## 10  Security and Compliance

* **SQL Sanitization**: parameter binding enforced; no raw string interpolation.
* **Plan Signatures**: each compiled plan signed with hash for immutability.
* **mTLS** enforced between UDR and driver; credentials isolated per tenant.
* **Audit Trails**: all routes recorded with `policy_id` and `tenant`.
* **Fail-Closed**: if routing ambiguity or capability mismatch → deny and log.

---

## 11  Performance Targets

| Metric                      | Target   | Notes                 |
| :-------------------------- | :------- | :-------------------- |
| Lowering latency            | < 1 ms   | AIRPlan ≤ 500 nodes   |
| Routing latency             | < 2 ms   | single hop            |
| Cache hit ratio             | ≥ 0.7    | warm workloads        |
| Capability negotiation time | < 50 ms  | handshake             |
| AI feedback lag             | < 200 ms | round-trip to Copilot |

---

## 12  Configuration

**Example YAML**

```yaml
udr:
  cache:
    enabled: true
    ttlSec: 900
  routing:
    default: "primary"
    readReplica: "auto"
    failover: true
  telemetry:
    sampling: 0.3
  security:
    enforceTLS: true
    signPlans: true
```

---

## 13  Open Questions (RFCs)

1. Should UDR support **hybrid execution** (split queries across dialects)?
2. Can Copilot learn **cross-dialect semantic embeddings** for direct AIR→binary plan conversion?
3. Should we expose **plan hash introspection** to the SQLx Studio?
4. How to federate **capability updates** across distributed tenants?
5. Should PPC and UDR share a unified registry schema?

---

## 14  Related Documents

* `docs/specs/air/SQLx-AIR-Spec-v4.0.md`
* `docs/specs/kernel/SQLx-Kernel-Spec-v4.0.md`
* `docs/specs/drivers/SQLx-Driver-WireProtocol-Spec-v4.0.md`
* `docs/specs/policy/SQLx-Policy-Graph-and-RBAC-v4.0.md`
* `docs/specs/telemetry/SQLx-AI-Telemetry-Schema-v4.1.md`
* `docs/specs/observability/SQLx-Observability-and-SLOs-v4.0.md`

---

**Author:** NuBlox Engineering **Reviewed:** October 2025
**License:** NuBlox SQLx OS — Autonomous Database Framework

```