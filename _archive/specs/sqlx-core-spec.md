# SQLx Core Build Specification  
**Subsystem:** @nublox/sqlx-core  
**Version:** 1.0  
**Status:** Design-Approved (Q4 2025 Target)  
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Scope

`@nublox/sqlx-core` is the foundation of **NuBlox SQLx OS**.  
It provides the low-level runtime, dialect learning, query synthesis, and adaptive transaction control required by all higher-level modules.

**Primary Objective:**  
Implement a **self-learning database runtime** capable of understanding any SQL dialect at wire level, converting queries into a canonical Intermediate Representation (IR), and synthesizing dialect-specific SQL with predictive execution.

---

## 2. Functional Overview

| Capability | Description |
|-------------|-------------|
| **Feature Learning Runtime (FLR 2.0)** | Learns protocol/auth/TLS/dialect features from live handshake and discovery queries. |
| **Intermediate Representation (IR)** | Canonical JSON schema for DDL/DML/DQL/TCL. |
| **Dialect Synthesizer** | Translates IR → dialect SQL + parameter bindings. |
| **Simulation Engine** | Estimates query cost, locks, and I/O before execution. |
| **Execution Manager** | Connection pools, retry logic, circuit breakers, telemetry. |
| **Observability Hooks** | Emits structured events to `@nublox/sqlx-observe`. |

---

## 3. Key Components

```
┌──────────────────────────────────────────┐
│              SQLx Core Runtime           │
├──────────────────────────────────────────┤
│ 1. ConnectionManager                    │
│ 2. FeatureLearningRuntime (FLR 2.0)      │
│ 3. IntermediateRepresentation (IR)       │
│ 4. DialectSynthesizer                    │
│ 5. SimulationEngine                      │
│ 6. ExecutionManager + Retry Loop         │
│ 7. TelemetryEmitter (Observability Hook) │
└──────────────────────────────────────────┘
```

---

## 4. Internal Data Flow

```
connect(url)
   ↓
handshake() → Feature Probe Tests
   ↓
generate DialectProfile → cache → Control Plane
   ↓
build IR(sql|schema)
   ↓
simulate(IR)
   ↓
synthesizeSQL(IR, dialect)
   ↓
execute(connection, statement)
   ↓
emitTelemetry(result)
```

---

## 5. Core Interfaces (TypeScript)

```ts
export interface DialectProfile {
  id: string;
  name: 'mysql' | 'postgres' | string;
  version: string;
  features: Record<string, boolean>;
  capabilities: string[];
  learnedAt: number;
}

export async function learnDialect(url: string): Promise<DialectProfile>;

export interface IntermediateRepresentation {
  type: 'ddl' | 'dml' | 'dql' | 'tcl';
  statement: string;
  params?: any[];
  meta?: Record<string, any>;
}

export async function synthesizeSQL(
  ir: IntermediateRepresentation,
  dialect: string
): Promise<string>;

export interface SimulationResult {
  estimatedCostMs: number;
  estimatedLocks: number;
  rowEstimate: number;
  confidence: number;
}

export async function simulateQuery(
  ir: IntermediateRepresentation,
  profile: DialectProfile
): Promise<SimulationResult>;

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  durationMs: number;
}

export async function executeQuery<T>(
  connection: Connection,
  sql: string,
  params?: any[]
): Promise<QueryResult<T>>;
```
---

## 6. Implementation Tasks (Phased)

| Phase | Goal | Deliverables |
|--------|------|--------------|
| **P1 – Core Scaffold** | Package & test harness | `/src/index.ts`, build passes |
| **P2 – Connection & Handshake** | MySQL & Postgres negotiation | `ConnectionManager.ts` |
| **P3 – FLR 2.0** | Probe auth/TLS/limits | `FeatureLearningRuntime.ts` |
| **P4 – IR** | Canonical structures & helpers | `ir.ts` + tests |
| **P5 – Synthesizer** | IR → SQL for MySQL/PG | `DialectSynthesizer.ts` + goldens |
| **P6 – Simulation** | Cost/lock estimates | `SimulationEngine.ts` |
| **P7 – Execution** | Retry/backoff/circuit breaker | `ExecutionManager.ts` |
| **P8 – Telemetry** | OTel events | `emitEvent()` hooks |
| **P9 – Docs** | API docs + integration tests | TypeDoc + README |

---

## 7. Testing Strategy

- Unit: Vitest per util.  
- Integration: Docker MySQL & PG; FLR run; synthesized query exec.  
- Golden: Expected SQL snapshots.  
- Bench: latency/throughput/retry metrics.

---

## 8. Integration Points

| Target Module | Integration |
|----------------|------------|
| `@nublox/sqlx-orm` | IR builders + `synthesizeSQL()` |
| `@nublox/sqlx-api` | `simulateQuery()` for cost gating |
| `@nublox/sqlx-control` | `registerFingerprint()` |
| `@nublox/sqlx-observe` | Telemetry `emitEvent()` |

---


© 2025 NuBlox Technologies Ltd. All Rights Reserved.
