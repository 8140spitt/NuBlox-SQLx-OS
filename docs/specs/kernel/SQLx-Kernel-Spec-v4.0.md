Brilliant foundation, Stephen. I’ve tightened language, unified headings, expanded a few key tables, aligned terminology with AIR/Drivers/Telemetry, and kept everything as **one clean, copy-paste canvas**. Drop it straight into:

`docs/specs/kernel/SQLx-Kernel-Spec-v4.0.md`

---

````markdown
# NuBlox SQLx OS — Kernel Specification v4.0  
*Deterministic Control Plane for Connectivity, Scheduling, Policy, AIR/UDR, Caching, and Telemetry*  
**Version:** 4.0 **Status:** Stable **Owner:** NuBlox Labs — Core  

---

## 0  Glossary

| Term | Meaning |
|:--|:--|
| **Kernel** | SQLx OS core runtime coordinating connections, scheduling, policy, telemetry, and module lifecycles. |
| **AIR** | Abstract Intermediate Representation — dialect-neutral IR for SQL statements. |
| **UDR** | Universal Dialect Runtime — translation/lowering from AIR to dialect SQL and driver routing. |
| **AIF** | AI Fabric — modular agents (Optimizer, Schema, Security, Compliance, Topology, NL-to-SQL). |
| **TKB** | Telemetry Kernel Bus — internal event bus for traces, metrics, logs, and learning signals. |
| **PPC** | Predictive Plan Cache — anticipatory plan/result cache with semantic keys and safe invalidation. |
| **π (Policy Graph)** | Formal model for evaluating authorization, compliance, and obligations. |

---

## 1  Kernel Overview

```mermaid
flowchart TB
    subgraph Kernel["SQLx OS Kernel"]
      KF[Connection & Session Fabric]
      SCH[Transaction Scheduler]
      AIR[AIR Interface]
      UDR[UDR Bridge]
      POL[Policy Runtime (π)]
      OBS[Observability & TKB]
      PPC[Predictive Plan Cache]
      CFG[Config & Secrets]
    end

    KF --> SCH
    SCH --> AIR
    AIR --> UDR
    SCH --> PPC
    SCH --> POL
    SCH --> OBS
    POL --> OBS
    PPC --> OBS
````

**Responsibilities**

1. **Connectivity** — negotiate TLS/auth, multiplex sessions, manage pools.
2. **Scheduling** — classify and dispatch work (L/B/A/S classes), safe cancellation.
3. **Policy** — enforce π for DCL/TCL, governance, obligations, and residency.
4. **Telemetry** — emit traces/metrics/logs and learning signals to AIF.
5. **AIR/UDR** — normalize SQL to AIR, plan, lower, and route to drivers.
6. **Caching** — PPC with explainable admission, invalidation, and rollback.

---

## 2  Module Contracts

### 2.1  Connection & Session Fabric (KF)

**Goals:** secure, low-latency, adaptive pooling; sandboxed sessions; credential rotation.

**TypeScript Sketch**

```ts
export type ConnectOptions = {
  url: string;                     // e.g. mysql://user:pass@host:3306/db?ssl=1
  poolMin?: number;                // default 0
  poolMax?: number;                // default 20
  keepAliveMs?: number;            // default 45000
  tls?: "required"|"preferred"|"disabled";
  role?: string;                   // RBAC role binding
  tags?: Record<string,string>;    // residency=eu-west-2, env=prod
};

export interface Session {
  id: string;
  dialect: "mysql"|"postgres"|"sqlite"|"oracle"|"mssql";
  threadId?: number;               // where applicable
  createdAt: number;
  lastUsedAt: number;
  ctx: Record<string,unknown>;
}

export interface ConnectionFabric {
  connect(opts: ConnectOptions): Promise<Session>;
  acquire(dialect: string, key?: string): Promise<Session>;
  release(sessionId: string): Promise<void>;
  close(sessionId: string): Promise<void>;
  rotateCredentials(sessionId: string): Promise<void>;
  stats(): Promise<{
    pools: Array<{ dialect:string, size:number, idle:number, busy:number }>;
  }>;
}
```

**State Machine**

```mermaid
stateDiagram-v2
  [*] --> Disconnected
  Disconnected --> Handshaking: connect()
  Handshaking --> Authenticated: tls+auth ok
  Handshaking --> Disconnected: retry/backoff
  Authenticated --> Pooled: session cached
  Pooled --> InUse: acquire()
  InUse --> Pooled: release()
  InUse --> Closed: error/timeout/cancel
  Pooled --> Closed: rotate/evict/idle
  Closed --> [*]
```

**SLIs/SLOs**

* `p95_connection_latency`: `< 120ms` (WAN), `< 20ms` (LAN)
* `pool_saturation_time`: `< 5s` under 10× baseline QPS burst
* `auth_rotation_success`: `≥ 99.95%` monthly

---

### 2.2  Transaction Scheduler (SCH)

**Goals:** preemptive, class-aware, per-tenant fairness; bounded retries; deadline enforcement.

**Queue Classes**

* **L** (low-latency): point reads, OLTP
* **B** (bulk): batch writes, ETL
* **A** (analytics): scans, joins, ad-hoc BI
* **S** (system): DDL, migrations, policy sync

**Dispatch Policy (pseudo)**

```txt
loop:
  M := {latency, qps, locks, io, cpu}
  w(L,B,A,S) := PID(M, targets)
  j := next(w, deadlines)
  if deadline(j) < now: preempt(longRunner)
  emit span; route to AIR/UDR with cancel token
```

**Preemption/Cancellation**

* Cooperative cancellation via driver `KILL QUERY/STATEMENT` (where supported).
* Deadlock detection → exponential backoff retry (bounded), with span annotation.

---

### 2.3  AIR Interface

**Contract**

```ts
export interface AirEngine {
  parse(sql: string): AIRNode;                      // -> vendor AST → AIR
  normalize(ast: AIRNode): AIRNode;                 // canonicalize
  plan(ast: AIRNode, caps: DialectCaps): AirPlan;   // logical plan
  explain(plan: AirPlan): ExplainGraph;             // human-readable graph
}
```

**Guarantees**

* **Lossless** round-trip (`sql → AIR → dialectSQL`).
* **Stable IDs** for lineage, policy, and telemetry correlation.

---

### 2.4  UDR Bridge (Lowering & Routing)

**Contract**

```ts
export interface UdrBridge {
  lower(plan: AirPlan, target: DialectCaps): DialectSql;
  route(dsql: DialectSql, session: Session): Promise<DriverResult>;
  caps(session: Session): Promise<DialectCaps>;
}
```

**Safety**

* Capability-gated rewrites; safe emulation or fail-fast with explainable errors.
* Multi-host awareness for RO routing, failover, and kill-token propagation.

---

### 2.5  Policy Runtime (π)

**Purpose:** enforce authorization and compliance at execution time; attach obligations.

**Evaluation**

```ts
type PolicyDecision = { allow: boolean, obligations?: string[], reason: string };
function evaluate(ctx: ExecContext, air: AIRNode): PolicyDecision;
```

**Context Includes**

* actor (user/role/tenant), residency, sensitivity tags, purpose, origin, time window, risk score.

**Obligations (examples)**

* Mask columns; redact rows; force read-replica; block cross-region egress; require approval token; throttle concurrency.

---

### 2.6  Observability & Telemetry Kernel Bus (OBS/TKB)

**Emitted Events**

* `kernel.exec.start|ok|error`
* `driver.query.start|ok|error`
* `policy.decision`
* `cache.hit|miss|invalidate`
* `sched.preempt|retry`
* `ddl.migration.start|ok|rollback`

**Event Schema (JSON)**

```json
{
  "ts": 1739661234,
  "span_id": "2b7c...",
  "trace_id": "a1d4...",
  "evt": "driver.query.ok",
  "tenant": "acme",
  "actor": "svc:billing",
  "dialect": "mysql",
  "air_id": "air:Q-9f3a",
  "latency_ms": 12,
  "rows": 42,
  "plan_hash": "ph:ab12",
  "reward": -12.3
}
```

**OTel Mapping**

* Traces: `sqlx.kernel`, `sqlx.driver`, `sqlx.policy`
* Metrics: `sqlx_pool_busy`, `sqlx_sched_preemptions`, `sqlx_cache_hit_ratio`, `sqlx_query_latency_ms{class}`

---

### 2.7  Predictive Plan Cache (PPC)

**Keying**

```
k = hash(air_normalized, parameter_shapes, tenant, dialect_caps, data_stats_epoch)
```

**Policies**

* Admission only when p95 benefit > threshold vs. baseline.
* TTL bound by schema epoch; auto-invalidate on DDL or stats shift.
* Per-tenant isolation; cross-tenant learning only through anonymized deltas.

**Explainability**

* Store rationale: “Recurring Q:Q-9f3a, 78% reuse; p95 35ms → 9ms; admitted at t=...”.

---

## 3  Execution Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant APP as Client
    participant KF as Connection Fabric
    participant SCH as Scheduler
    participant POL as Policy (π)
    participant AIR as AIR Engine
    participant UDR as UDR Bridge
    participant DRV as Driver
    participant OBS as TKB/OTel

    APP->>KF: connect(url)
    KF-->>APP: session
    APP->>SCH: exec(sql, params, ctx)
    SCH->>POL: evaluate(ctx, AIR(sql))
    POL-->>SCH: allow/deny + obligations
    alt allow
        SCH->>AIR: parse/normalize/plan
        AIR-->>SCH: plan
        SCH->>UDR: lower(plan) + route(session)
        UDR->>DRV: exec(dialectSQL)
        DRV-->>UDR: results + stats
        UDR-->>SCH: driver result
        SCH-->>APP: rows/ok
        SCH->>OBS: emit exec.ok + metrics
    else deny
        SCH-->>APP: error(reasoned denial)
        SCH->>OBS: emit policy.deny
    end
```

---

## 4  Error & Retry Semantics

| Class                | Detection               | Kernel Action                                                                |
| :------------------- | :---------------------- | :--------------------------------------------------------------------------- |
| **Deadlock**         | error code / lock graph | Exponential backoff retries (N bounded); annotate spans; raise Copilot hint. |
| **Timeout**          | latency > SLA           | Cancel; emit guidance (index/partition); update PPC admission thresholds.    |
| **Plan Regression**  | cost drift vs. baseline | Roll back to last good plan; freeze PPC for query key; emit RCA.             |
| **Policy Violation** | π → deny                | Return reasoned denial; optional approval token workflow.                    |
| **Driver Fault**     | protocol/I/O error      | Circuit-breaker; drain pool; re-handshake; degrade gracefully.               |

---

## 5  Configuration & Secrets

**Hierarchy**: defaults → env → workspace config → tenant overrides.
**Secrets**: OS keychain/HSM; no plaintext at rest; rotation supported.

**Example (YAML)**

```yaml
sqlx:
  pools:
    mysql: { min: 0, max: 32, keepAliveMs: 45000 }
    pg:    { min: 0, max: 32, keepAliveMs: 45000 }
  sched:
    classes: { L: 0.5, B: 0.2, A: 0.2, S: 0.1 }
    preempt: true
  telemetry:
    otel: { endpoint: "http://otel:4317", sampling: 0.2 }
  policy:
    packs: ["gdpr", "hipaa"]
  cache:
    ppc: { enabled: true, ttlSec: 900, minBenefitMs: 10 }
```

Dynamic reload: pools, timeouts, policy packs, logging levels.

---

## 6  Security Posture

* **Transport**: TLS 1.3+; mTLS optional; downgrade refused by default.
* **Auth**: short-lived tokens; JIT role elevation with obligations.
* **Memory Safety**: sensitive buffers zeroed; avoid lingering copies.
* **Audit**: DDL/DCL/TCL events signed (immutable ledger).
* **Supply Chain**: SBOM, signature verification, reproducible builds.

---

## 7  Performance Targets (v4.0 GA)

| SLI                        | Target    | Notes                    |
| :------------------------- | :-------- | :----------------------- |
| p95 connect (LAN)          | < 20 ms   | warm pool                |
| p95 exec L-class           | < 15 ms   | small point read         |
| p95 exec B-class           | < 200 ms  | batch ≤ 1000 rows        |
| p95 exec A-class           | < 1500 ms | analytic scan ~10M rows  |
| PPC hit ratio              | > 0.35    | steady workload          |
| Scheduler preempt accuracy | > 0.9     | correct class preemption |

Bench methodology: `docs/specs/observability/SQLx-Observability-and-SLOs-v4.0.md`.

---

## 8  Compliance Hooks

* Session/tenant **residency tags** (e.g., `region=eu-west-2`).
* Column-level classifiers to enforce masking/blocks.
* Approval workflow for high-risk ops (cross-region export).
* Evidence export (JSON/CSV) for audits; retention per ATS classes.

---

## 9  Extensibility

* **Plugins**: driver adapters, policy resolvers, telemetry sinks.
* **Event Hooks**: `beforeExec`, `afterExec`, `onPolicyDecision`, `onPlanRegression`, `onMigration`.
* **Sandboxing**: untrusted plugins isolated (process boundary, capability list).

---

## 10  Test Matrix

* **Unit**: parser, scheduler, policy evaluator, PPC.
* **Integration**: driver handshake, TLS, cancellation, online DDL.
* **Soak**: 24–72 h mixed L/B/A/S workloads.
* **Fuzz**: SQL tokenizer, packet decode, AIR ↔ dialect round-trip.
* **Chaos**: network partitions, clock skew, failover during migration.

---

## 11  Open Questions (RFCs)

1. Guaranteed fairness across multi-tenant bursts under strict SLAs?
2. Plan regression guardrails — when to freeze PPC globally?
3. Live migration boundaries — safe unit (schema/table/tenant)?
4. Default policy packs per tier (OSS/Pro/Enterprise)?

---

## 12  Appendix — Minimal Kernel API (Public)

```ts
export interface SqlxKernel {
  connect(opts: ConnectOptions): Promise<Session>;
  exec(sql: string, params?: any[], ctx?: ExecContext): Promise<QueryResult>;
  prepare(sql: string): Promise<PreparedStmt>;
  cancel(token: string): Promise<void>;
  stats(scope?: "kernel"|"driver"|"policy"|"cache"): Promise<Record<string,unknown>>;
}

export type ExecContext = {
  tenant: string;
  actor: string;
  purpose?: "oltp"|"etl"|"bi"|"ddl";
  residency?: "eu"|"us"|"uk";
  risk?: "low"|"med"|"high";
  deadlineMs?: number;
};
```

---

## 13  Related Documents

* `docs/specs/air/SQLx-AIR-Spec-v4.0.md`
* `docs/specs/drivers/SQLx-Driver-WireProtocol-Spec-v4.0.md`
* `docs/specs/telemetry/SQLx-AI-Telemetry-Schema-v4.1.md`
* `docs/specs/observability/SQLx-Observability-and-SLOs-v4.0.md`
* `docs/specs/policy/SQLx-Policy-Graph-and-RBAC-v4.0.md`
* `docs/ai/SQLx-Copilot-Architecture-v1.0.md`

---

**Author:** NuBlox Engineering **Reviewed:** October 2025
**License:** NuBlox SQLx OS — Autonomous Database Framework

```