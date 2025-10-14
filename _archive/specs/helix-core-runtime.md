# Helix Core Runtime v2.0 — Build Specification (Developer Hand‑Off)

**Subsystem:** `@nublox/sqlx-core`
**Owner:** Core Platform Team
**Status:** Ready for Implementation
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Non‑Goals

**Purpose.** Deliver a self‑learning, dialect‑agnostic execution engine that:

* Converts SQL/NL intent → IR → simulated plans → optimal execution.
* Learns protocol/dialect features at runtime (via FLR 2.1) and reinforces plan selection.
* Provides stable contracts for ORM, API Emitter, Control Plane, and Observe.

**Non‑Goals.**

* No UI/Console work (belongs to Control Plane Console).
* No long‑term model training jobs (handled by Helix Reasoner/NeuroPlan++).
* No vendor‑specific admin (backup/restore/etc.).

---

## 2. Success Criteria (Acceptance)

* **Correctness:**

  * Round‑trip parity: IR → SQL → DB → rows equals reference SQL for PG16 + MySQL 9 on provided fixtures.
  * Transactional semantics: SERIALIZABLE + REPEATABLE READ pass TPC‑C style invariants.
* **Performance:**

  * p95 query latency ≤ baseline Prisma by **≥3×** on read‑heavy suite; ≤ baseline by **≤1.2×** on mixed R/W.
  * Simulation overhead ≤ **2 ms** median; ≤ **10 ms** p95 for non‑analytical queries.
* **Resilience:**

  * Exponential backoff + circuit breaker reduce cascading failures (no more than 1 retry per query on average under 1% fault rate).
* **Observability:**

  * 100% of queries emit `TelemetryEvent` with correlation IDs and cost model.
* **Portability:**

  * Supports PG + MySQL first‑class; graceful degradation for unsupported features via capability flags.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Helix Core Runtime                    │
├─────────────────────────────────────────────────────────┤
│ 1. ConnectionManager  ◀─ FLR 2.1 (dialect profile)     │
│ 2. IR Builder & Normalizer                              │
│ 3. SimulationEngine (cost, locks, I/O)                  │
│ 4. DialectSynthesizer (IR → SQL)                        │
│ 5. ExecutionManager (pool, tx, retry, cb)              │
│ 6. ReinforcementTrainer (weights per plan class)        │
│ 7. TelemetryEmitter (OTel → Observe)                    │
└─────────────────────────────────────────────────────────┘
```

**Dataflow**

```
intent(SQL|NL) → parse → IR.normalize → simulate → selectPlan → synthesizeSQL → execute → emitTelemetry → reinforce
```

---

## 4. External Contracts (Stable APIs)

### 4.1 TypeScript Public Interfaces

```ts
export interface DialectProfile {
  id: string;
  name: 'postgres' | 'mysql' | string;
  version: string;
  features: Record<string, boolean>; // e.g., jsonb, lateral, cte, sargableLike
  limits?: { maxParams?: number; maxPacket?: number };
  learnedAt: number;
}

export type IRType = 'ddl' | 'dml' | 'dql' | 'tcl';

export interface IRNode {
  id: string;           // stable hash
  type: IRType;
  entity?: string;      // table/view
  fields?: string[];
  where?: Record<string, unknown>;
  join?: Array<{ on: string; target: string; type: 'inner'|'left'|'right'|'full' }>;
  orderBy?: string[];
  limit?: number; offset?: number;
  params?: unknown[];
  meta?: Record<string, unknown>; // embeddings, confidence, source
}

export interface SimulationResult {
  planId: string;           // stable id for golden tests
  estimatedCostMs: number;  // wallclock cost model
  lockRisk: number;         // 0..1
  ioBytes: number;
  confidence: number;       // 0..1
}

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
  durationMs: number;
  planId: string;
  diagnostics?: Record<string, unknown>;
}

export interface ExecuteOptions {
  tx?: 'autocommit' | 'begin' | 'join';
  isolation?: 'read_committed' | 'repeatable_read' | 'serializable';
  timeoutMs?: number;
}

export interface CoreClient {
  learnDialect(url: string): Promise<DialectProfile>; // delegates to FLR
  buildIR(input: string | IRNode): Promise<IRNode>;
  simulate(ir: IRNode, profile?: DialectProfile): Promise<SimulationResult[]>;
  execute<T = unknown>(ir: IRNode, opts?: ExecuteOptions): Promise<QueryResult<T>>;
}
```

### 4.2 Telemetry Contract

```ts
export type TelemetryType = 'query'|'ddl'|'error'|'policy'|'cache';
export interface TelemetryEvent {
  id: string; ts: number; type: TelemetryType; planId?: string;
  attrs: Record<string, unknown>; // cost, locks, retries, sqlHash, irId
  traceId: string; spanId: string; // W3C
}
```

### 4.3 Error Model

```ts
export class SqlxError extends Error {
  code:
    | 'E_CONN' | 'E_TIMEOUT' | 'E_SYNTAX' | 'E_CAPABILITY' | 'E_RETRY' | 'E_TX'
    | 'E_INTERNAL';
  details?: unknown;
  constructor(code: SqlxError['code'], message: string, details?: unknown) { super(message); this.code = code; this.details = details; }
}
```

---

## 5. Detailed Design

### 5.1 ConnectionManager

* **Responsibilities:** TLS/auth negotiation, pool lifecycle, health checks, circuit breaker (half‑open), prepared statements cache.
* **Inputs:** connection URL, `DialectProfile` (optional pre‑learned).
* **Outputs:** pooled `Connection` with capability flags.
* **Constraints:** Max concurrent connections (default 10). Idle timeout 30s. Prepared cache 512 entries.

### 5.2 IR Builder & Normalizer

* **Parser Sources:** SQL → AST (nearley or custom), NL is pre‑translated by higher layer.
* **Normalization Rules:** canonical field ordering, join normalization, param hoisting, deterministic hashing for `IRNode.id`.
* **Golden Testing:** fixtures in `/tests/golden/ir/*.json`.

### 5.3 SimulationEngine

* **Goal:** produce a ranked set of candidate plans with cost/lock/IO estimates.
* **Methods:**

  * Cardinality estimates via heuristics + optional DB EXPLAIN sampling when allowed.
  * Monte Carlo exploration of join orders for ≤6 relations, greedy beyond.
  * Lock risk approximated by histogram of plan’s write‑targets and index coverage.
* **Output:** `SimulationResult[]` sorted by `estimatedCostMs` then `lockRisk`.
* **Budget:** default simulation budget 3 ms; knob up to 20 ms for analytical ops.

### 5.4 DialectSynthesizer

* **Mapping:** IR → SQL for PG/MySQL, aware of `features` set (CTE, window, JSON).
* **Param Strategy:** numbered vs positional depending on dialect; maxParams enforcement.
* **Fallbacks:** If feature unsupported, emit equivalent subquery/derived table pattern.

### 5.5 ExecutionManager

* **Retry Policy:** idempotent DQL auto‑retry (jittered backoff); DML retry only on detected transient errors with savepoints.
* **Transactions:**

  * `begin` opens tx; nested `join` shares context via AsyncLocalStorage.
  * Isolation mapped to engine levels; downgrade warning via telemetry if not supported.
* **Timeouts:** statement timeout per `ExecuteOptions.timeoutMs`.
* **Circuit Breaker:** opens after 5 consecutive `E_CONN/E_TIMEOUT` within 10s; half‑open probes every 2s.

### 5.6 ReinforcementTrainer

* **Feature Vector:** `{ dialect, relationCount, filterSelectivity, hasJoin, hasSort, resultCardinalityBucket }`.
* **Bandit:** Thompson Sampling over discrete plan classes; updates on `durationMs` improvement.
* **Persistence:** weights stored under `~/.sqlx/helix/weights.json` and synced to Control Plane.

### 5.7 TelemetryEmitter

* **Implementation:** OTel spans with attributes for `irId`, `sqlHash`, `estimatedCostMs`, `actualMs`, `retries`, `lockWaitMs`.
* **Delivery:** local queue + backoff; drops after 3 failed batches with warning.

---

## 6. State & Concurrency Model

* **Threading:** Node.js async; no worker threads in v2.0 (future: WASM/Rust hot path).
* **Immutability:** IR nodes are immutable; plan selection returns new objects.
* **Cancellation:** cooperative via `AbortSignal` in all async methods.

---

## 7. Security & Policy Hooks

* **Token Binding:** all connections require caller‑provided token (opaque), forwarded to Control Plane for policy evaluation.
* **Field Masking:** pre‑execution hook allows policy engine to mutate IR (mask, deny, redact) before synthesize.
* **Audit:** each execution emits tamper‑evident hash of `(irId, sqlHash, planId, traceId)`.

---

## 8. Configuration & Defaults

```yaml
# sqlx-core.config.yaml
pool:
  maxConnections: 10
  idleMs: 30000
simulation:
  budgetMs: 3
  maxBudgetMs: 20
retry:
  maxAttempts: 2
  baseDelayMs: 25
circuitBreaker:
  errorThreshold: 5
  windowMs: 10000
  halfOpenProbeMs: 2000
telemetry:
  batchMax: 512
  flushMs: 1000
```

---

## 9. CLI & Dev UX Hooks

* `sqlx ping --url <uri>` → runs FLR probe, prints `DialectProfile`.
* `sqlx advise --sql <q>` → prints top 3 `SimulationResult` with reasons.
* `sqlx bench run` → executes standard bench, outputs CSV + OTel links.

---

## 10. Testing Strategy

### 10.1 Unit

* IR normalization, synthesizer edge cases, retry policy logic, circuit breaker transitions.

### 10.2 Integration

* Docker PG16 + MySQL 9.
* Run FLR → learn profile → synthesize and execute suite.
* Validate transactional invariants with simulated contention.

### 10.3 Golden

* IR → SQL snapshots & plan IDs; PRs modifying goldens require 2 approvals.

### 10.4 Performance

* Benchmarks for 1k/100k/1M rows; collect p50/p95/p99; ensure SLOs met.

---

## 11. Milestones & Work Breakdown

|  Phase | Scope                  | Deliverables                    | Owner   | Exit Criteria                   |
| -----: | ---------------------- | ------------------------------- | ------- | ------------------------------- |
| **P1** | Scaffold & Types       | package, types, error model     | Core    | build+lint+tests pass           |
| **P2** | Connection + FLR integ | pool, TLS/auth, profile caching | Core    | `sqlx ping` prints profile      |
| **P3** | IR Normalize           | parser + normalizer + hashing   | Core    | golden IR fixtures              |
| **P4** | SimulationEngine       | cost/lock/IO estimators         | Perf    | `sqlx advise` outputs 3 plans   |
| **P5** | Synthesizer            | PG + MySQL SQL emitters         | Core    | goldens match reference SQL     |
| **P6** | ExecutionManager       | tx, retry, circuit breaker      | Runtime | p95 latency SLOs met            |
| **P7** | Reinforcement          | bandit + weights persistence    | ML      | latency improves ≥10% vs static |
| **P8** | Telemetry              | OTel spans + local queue        | Observe | 100% events with traceIds       |
| **P9** | Hardening              | fuzzing, chaos tests, docs      | All     | GA readiness report             |

---

## 12. Diagnostics & Observability

* `HELIX_DIAG=1` prints plan selection reasoning and feature vector.
* `sqlx heal --url <uri>` runs connectivity + capability + perf smoke tests.
* Trace fields: `db.system`, `db.statement` (redacted), `sqlx.ir_id`, `sqlx.plan_id`.

---

## 13. Pseudocode (Reference)

```ts
export async function execute<T>(input: string|IRNode, opts: ExecuteOptions = {}): Promise<QueryResult<T>> {
  const ir = typeof input === 'string' ? await buildIR(input) : input;
  const profile = await ensureProfile();
  const plans = await simulate(ir, profile);
  const chosen = select(plans);
  const sql = await synthesize(ir, profile, chosen.planId);
  const start = Date.now();
  try {
    const res = await execSql<T>(sql, ir.params, opts);
    const durationMs = Date.now() - start;
    emitTelemetry({ type: 'query', ts: Date.now(), planId: chosen.planId, attrs: { estimatedCostMs: chosen.estimatedCostMs, actualMs: durationMs } });
    reinforce(ir, chosen, durationMs);
    return { rows: res.rows, rowCount: res.rowCount, durationMs, planId: chosen.planId };
  } catch (e) {
    emitTelemetry({ type: 'error', ts: Date.now(), planId: chosen.planId, attrs: { code: (e as SqlxError).code } });
    throw e;
  }
}
```

---

## 14. Risks & Mitigations

* **Risk:** Simulation adds user‑visible latency.
  **Mitigation:** Strict budget, asynchronous pre‑warming of plan classes.
* **Risk:** Capability mismatch across engines.
  **Mitigation:** feature flags + graceful fallback transforms.
* **Risk:** Reinforcement overfits rare workloads.
  **Mitigation:** decay weights; cap influence of low‑support classes.

---

## 15. Future Hooks (Not in v2.0)

* **WASM hot path** for SimulationEngine in Rust.
* **NeuroPlan++** DRL optimizer (offline training, online inference).
* **Cross‑dialect transactions** with 2PC coordinator.

---

> *If a human must tune it, Helix must learn it.*
> — NuBlox Engineering Principle
