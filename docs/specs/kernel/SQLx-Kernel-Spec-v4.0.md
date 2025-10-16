---
title: "NuBlox SQLx OS — Kernel Specification v4.0 (Draft)"
status: Draft
version: 4.0.0-draft.1
owners:
  - Stephen Spittal (@8140spitt)
  - NuBlox Labs Core
reviewers:
  - SQLx Driver Team
  - AI Fabric Team
  - Security & Compliance
created: 2025-10-16
updated: 2025-10-16
---

> **Purpose** — This document is the authoritative engineering specification for the **SQLx OS Kernel**. It defines modules, interfaces, lifecycles, state machines, and SLIs/SLOs for the control plane that orchestrates drivers, AIR translation, AI telemetry, policy enforcement, observability, and scheduling.

---

# 0. Glossary

| Term | Meaning |
|:--|:--|
| **Kernel** | Core runtime of SQLx OS coordinating connections, scheduling, policy, telemetry, and module lifecycles. |
| **AIR** | Abstract Intermediate Representation — dialect-neutral AST/IR for SQL statements. |
| **UDR** | Universal Dialect Runtime — runtime dialect translation/compilation layer. |
| **AIF** | AI Fabric — set of modular agents (Optimizer, Schema, Security, Compliance, Topology, Language). |
| **TKB** | Telemetry Kernel Bus — internal event bus for traces, metrics, and AI reward loops. |
| **PPC** | Predictive Plan Cache — anticipatory plan/result cache with semantic keys. |
| **π** | Policy Graph — formal model for evaluating authorization, compliance, and obligations. |

---

# 1. Kernel Overview

```mermaid
flowchart TB
    subgraph Kernel["SQLx OS Kernel"]
      KF[Connection / Session Fabric]
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
```

**Responsibilities**
1. **Connectivity** — negotiate auth/TLS, multiplex sessions, manage pools.  
2. **Scheduling** — classify and dispatch work (latency/throughput classes).  
3. **Policy** — enforce π(state→action) for DCL/TCL and governance.  
4. **Telemetry** — emit traces/metrics/logs and reward signals to AIF.  
5. **AIR/UDR** — normalize SQL to AIR and route to drivers via UDR.  
6. **Caching** — maintain PPC with safe invalidation and rollback heuristics.

---

# 2. Module Contracts

## 2.1 Connection & Session Fabric (KF)

**Goals:** secure, low-latency, adaptive pooling; session sandboxing and credential rotation.

**Interface (TypeScript Sketch)**
```ts
export type ConnectOptions = {
  url: string;              // mysql://user:pass@host:3306/db?ssl=1
  poolMin?: number;         // default 0
  poolMax?: number;         // default 20
  keepAliveMs?: number;     // default 45000
  tls?: "required"|"preferred"|"disabled";
  role?: string;            // RBAC role binding
  tags?: Record<string,string>; // residency=eu-west-2, env=prod
};

export interface Session {
  id: string;
  dialect: "mysql"|"postgres"|"sqlite"|"oracle"|"mssql";
  threadId?: number;        // where applicable
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
    pools: Array<{dialect:string, size:number, idle:number, busy:number}>;
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
- `p95_connection_latency < 120ms` (WAN), `< 20ms` (LAN)  
- `pool_saturation_time < 5s` under burst @ 10x QPS baseline  
- `auth_rotation_success >= 99.95%` monthly

---

## 2.2 Transaction Scheduler (SCH)

**Goals:** preemptive, class-aware, safe cancellation; per-tenant fairness.

**Queue Classes**
- **L** (low-latency): point reads, OLTP  
- **B** (bulk): batch writes, ETL  
- **A** (analytics): scans, joins, ad-hoc BI  
- **S** (system): DDL, migrations, policy sync

**Dispatch Policy (pseudo)**
```txt
while true:
  pull metrics M = {latency, qps, locks, io, cpu}
  rebalance weights w(L,B,A,S) using PID control
  select next job j from head(w-queues)
  if deadline(j) < now: preempt long-running job k
  emit to AIR/UDR; attach cancellation token; trace span
```

**Preemption/Cancellation**
- Cooperative cancellation via driver KILL QUERY/STATEMENT where supported.  
- Deadlock detection → automatic retry with backoff (bounded).

---

## 2.3 AIR Interface (to Kernel)

**Contract**
```ts
export interface AirEngine {
  parse(sql: string): AIRNode;              // -> dialect-neutral AST
  normalize(ast: AIRNode): AIRNode;         // canonicalize
  plan(ast: AIRNode, caps: DialectCaps): AirPlan; // logical plan
  explain(plan: AirPlan): ExplainGraph;
}
```

**Guarantees**
- **Lossless**: round-trip `sql -> AIR -> dialectSQL` preserves semantics.  
- **Stable IDs**: nodes carry persistent IDs for lineage and observability.  

---

## 2.4 UDR Bridge (to Drivers)

**Contract**
```ts
export interface UdrBridge {
  lower(plan: AirPlan, target: DialectCaps): DialectSql;
  route(dsql: DialectSql, session: Session): Promise<DriverResult>;
  caps(session: Session): Promise<DialectCaps>;
}
```

**Safety**
- Capability-gated rewrites (no unsupported constructs).  
- Fallback to emulation where safe; otherwise fail-fast with explainable error.

---

## 2.5 Policy Runtime (π)

**Purpose:** enforce authorization + compliance at execution time.

**Evaluation**
```ts
type PolicyDecision = {allow: boolean, obligations?: string[], reason: string};
function evaluate(ctx: ExecContext, air: AIRNode): PolicyDecision;
```

**Context Includes**
- actor (user/role/tenant), data residency, sensitivity tags, purpose, request origin, time window, risk score.

**Obligations Examples**
- Mask columns; redact rows; force read-replica; block cross-region egress; require approval token.

---

## 2.6 Observability & Telemetry Kernel Bus (OBS/TKB)

**Emitted Events**
- `kernel.exec.start|ok|error`
- `driver.query.start|ok|error`
- `policy.decision`
- `cache.hit|miss|invalidate`
- `sched.preempt|retry`
- `ddl.migration.start|ok|rollback`

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
- Traces: `sqlx.kernel`, `sqlx.driver`, `sqlx.policy`  
- Metrics: `sqlx_pool_busy`, `sqlx_sched_preemptions`, `sqlx_cache_hit_ratio`

---

## 2.7 Predictive Plan Cache (PPC)

**Keying**
- `k = hash(air_normalized, parameter_shapes, tenant, dialect_caps, data_stats_epoch)`

**Policies**
- Admission only if p95 benefit observed > threshold.  
- TTL bound by schema epoch; auto-invalidate on DDL.

**Explainability**
- Store rationale: “cached due to recurring Q:Q-9f3a, 78% reuse, 35ms→9ms”.

---

# 3. Execution Lifecycle

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
        DRV-->>UDR: results + plan + stats
        UDR-->>SCH: driver result
        SCH-->>APP: rows/ok
        SCH->>OBS: emit exec.ok + metrics
    else deny
        SCH-->>APP: error(reasoned denial)
        SCH->>OBS: emit policy.deny
    end
```

---

# 4. Error & Retry Semantics

| Class | Detection | Kernel Action |
|:--|:--|:--|
| **Deadlock** | error code / lock graph | Exponential backoff retries (max N), promote to higher priority if safe |
| **Timeout** | latency > SLA | Cancel, emit event, suggest index/partition to AIF |
| **Plan Regression** | cost drift vs baseline | Roll back to last good plan; throttle PPC admission |
| **Policy Violation** | π → deny | Explain with reason, optional approval flow |
| **Driver Fault** | protocol error | Circuit-breaker trip, drain pool, rehandshake |

---

# 5. Configuration & Secrets

- Hierarchy: **defaults → env → workspace config → tenant overrides**.  
- **Secrets** via OS keychain/HSM; no plaintext at rest.  
- Dynamic reload for: pools, timeouts, policy packs, logging levels.

**Example (YAML)**
```yaml
sqlx:
  pools:
    mysql: {min: 0, max: 32, keepAliveMs: 45000}
    pg:    {min: 0, max: 32, keepAliveMs: 45000}
  sched:
    classes: {L: 0.5, B: 0.2, A: 0.2, S: 0.1}
    preempt: true
  telemetry:
    otel: {endpoint: "http://otel:4317", sampling: 0.2}
  policy:
    packs: ["gdpr", "hipaa"]
  cache:
    ppc: {enabled: true, ttlSec: 900, minBenefitMs: 10}
```

---

# 6. Security Posture

- **Transport**: TLS 1.3+; mTLS optional; downgrade refused by default.  
- **Auth**: tokens short-lived; JIT role elevation with obligations.  
- **Memory Safety**: sensitive buffers zeroed; avoid lingering copies.  
- **Audit**: every DDL/DCL/TCL event signed (ledger).  
- **Supply Chain**: SBOM, signature verification, reproducible builds.

---

# 7. Performance Targets (v4.0 GA)

| SLI | Target | Notes |
|:--|:--|:--|
| p95 connect (LAN) | < 20ms | warm pool |
| p95 exec L-class | < 15ms | small point read |
| p95 exec B-class | < 200ms | batch <= 1000 rows |
| p95 exec A-class | < 1500ms | analytic scan 10M rows |
| PPC hit ratio | > 0.35 | steady workload |
| Scheduler preempt accuracy | > 0.9 | correct class preemption |

Bench methodology defined in **/docs/observability/Benchmark-Methodology.md**.

---

# 8. Compliance Hooks

- **Residency tags** per session/tenant (e.g., `region=eu-west-2`).  
- **Column-level classifiers** to enforce masking/blocks.  
- **Approval workflow** for high-risk ops (data export, cross-region).  
- **Evidence export** (JSON/CSV) for audits.

---

# 9. Extensibility

- **Plugins**: driver adapters, policy resolvers, telemetry sinks.  
- **Event Hooks**: `beforeExec`, `afterExec`, `onPolicyDecision`, `onPlanRegression`, `onMigration`.  
- **Sandboxing**: untrusted plugins isolated via process boundary and capability lists.

---

# 10. Test Matrix

- **Unit**: parser, scheduler, policy evaluator, cache.  
- **Integration**: driver handshake, TLS, cancellation, DDL online.  
- **Soak**: 24–72h mixed workloads (L/B/A/S).  
- **Fuzz**: SQL tokenizer, packet decode, AIR ↔ dialect round-trip.  
- **Chaos**: network partitions, clock skew, failover during migration.

---

# 11. Open Questions (Track via RFCs)

1. Guaranteed fairness across multi-tenant bursts under strict SLAs?  
2. Plan regression guardrails — when to freeze PPC globally?  
3. Live migration boundaries — what’s the safe unit (schema/table/tenant)?  
4. Default policy packs per deployment tier (OSS/Pro/Enterprise)?

---

# 12. Appendix — Minimal Kernel API (Public)

```ts
export interface SqlxKernel {
  connect(opts: ConnectOptions): Promise<Session>;
  exec(sql: string, params?: any[], ctx?: ExecContext): Promise<QueryResult>;
  prepare(sql: string): Promise<PreparedStmt>;
  cancel(token: string): Promise<void>;
  stats(scope?: "kernel"|"driver"|"policy"|"cache"): Promise<Record<string,unknown>>;
}
```

**ExecContext (subset)**
```ts
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
