# NuBlox SQLx OS — Engineering Specification v4.0 (Full)

> **Scope:** Production-grade **autonomous, dialect-agnostic database OS** and **Database Studio** atop a zero-dependency TypeScript runtime with optional Rust accelerators. Targets **MySQL ≥8.0 / MariaDB 10.6**, **PostgreSQL ≥13**, **SQLite 3.45** for December RC. Oracle + SQL Server on roadmap.

---

## 0. Non‑Negotiables (Release Contract)

* **Zero runtime dependencies** (Node core only). Optional `@nublox/sqlx-accel-rs` via N-API.
* **Dialect learner**: connect → probe → capability map → cache → verify on each session.
* **Wire-level drivers** for MySQL and Postgres (no `mysql2`, no `pg`).
* **IR-first**: every operation (DDL/DML/DCL/TCL/DQL) represented in canonical IR before emission.
* **Explainable AI**: every advisor action emits a rationale + rollback plan.
* **Fail-safe DDL**: plan, preflight, online mode, rollback snapshot, circuit-breaker.
* **Deterministic CLI/SDK** parity: all features accessible both ways.
* **Observability Bus**: metrics/logs/traces unified; OTel export.

---

## 1. Workspace & Packages (pnpm)

```
packages/
  @nublox/sqlx                    # Core SDK (IR, learner, planner, executor abstraction)
  @nublox/sqlx-driver-mysql       # MySQL/MariaDB wire driver (protocol, auth, text/binary)
  @nublox/sqlx-driver-postgres    # PostgreSQL wire driver (startup, SASL, extended/query)
  @nublox/sqlx-driver-sqlite      # SQLite (file + WASM optional; pure Node binding first)
  @nublox/sqlx-planner            # Diff/plan/apply + online DDL strategies
  @nublox/sqlx-observe            # Telemetry bus, exporters, health scoring
  @nublox/sqlx-cache              # L1 memory, optional L2 Redis adapter (interface only)
  @nublox/sqlx-security           # RBAC, policies, audit graph, crypto envelope
  @nublox/sqlx-cli                # CLI (Node bin) mapping 1:1 to SDK
  @nublox/sqlx-studio             # Web UI (Next/SvelteKit) consuming SDK APIs
  @nublox/sqlx-copilot            # AI advisor (pluggable LLM harness, local + remote)
  @nublox/sqlx-accel-rs           # Optional Rust accelerators (lz4, crc32c, parser SIMD)
```

> **Note:** `@nublox/sqlx-driver-…` must export a common `Driver` interface. No external DB libs.

---

## 2. Core Interfaces (TypeScript)

```ts
// packages/@nublox/sqlx/src/types.ts
export type Dialect = 'mysql' | 'postgres' | 'sqlite';

export interface ConnURL { raw: string }

export interface CapabilityMap {
  dialect: Dialect;
  version: string;
  features: Record<string, boolean | string | number>;
  limits: { maxPacketBytes?: number; maxIdentifierLen?: number };
  sql: { supports: string[]; reservedWords: string[] };
}

export interface Driver {
  connect(url: ConnURL, opts?: ConnectOptions): Promise<Session>;
  learn(session: Session): Promise<CapabilityMap>;
  execute(session: Session, req: ExecRequest): Promise<ExecResult>;
  close(session: Session): Promise<void>;
}

export interface Session {
  id: string;
  dialect: Dialect;
  threadId?: number; // MySQL
  processId?: number; // PG
  capabilities: CapabilityMap;
  telemetry: TelemetrySink;
}

export type SQLText = string;
export interface ExecRequest {
  sql: SQLText;
  params?: unknown[];
  tx?: TxContext;
  mode?: 'text' | 'binary';
  timeoutMs?: number;
}
export interface ExecResult {
  rows?: any[];
  fields?: FieldMeta[];
  rowCount?: number;
  insertId?: bigint | number | null;
  warnings?: string[];
  plan?: ExplainPlan | null;
  stats?: { latencyMs: number };
}

export interface TxContext {
  isolation?: 'read committed' | 'repeatable read' | 'serializable';
  readOnly?: boolean; savepoint?: string;
}

// IR
export type IRNode = IRDDL | IRDML | IRDQL | IRDCL | IRTCL;
export interface IRDDL { kind: 'ddl'; op: 'createTable'|'alterTable'|'dropTable'| ...; payload: any }
export interface IRDML { kind: 'dml'; op: 'insert'|'update'|'delete'|'merge'; payload: any }
export interface IRDQL { kind: 'dql'; op: 'select'; payload: any }
export interface IRDCL { kind: 'dcl'; op: 'grant'|'revoke'|'createUser'|'alterRole'; payload: any }
export interface IRTCL { kind: 'tcl'; op: 'begin'|'commit'|'rollback'|'savepoint'; payload: any }

export interface Planner {
  diff(current: IRSchemaSnapshot, target: IRSchemaSnapshot): Plan;
  validate(plan: Plan, caps: CapabilityMap): ValidationReport;
  apply(session: Session, plan: Plan, opts?: ApplyOptions): Promise<ApplyReport>;
}
```

---

## 3. Protocol Layer — **Feature‑Learning First** (FLP)

> Replace hardcoded, monolithic drivers with a **Protocol‑Lite Adapter (PLA)** + **Feature‑Learning Orchestrator (FLO)**. The adapter speaks just enough wire protocol to connect and execute arbitrary SQL safely; the FLO performs capability discovery, validates behaviors with system tests, and emits durable knowledge artifacts.

### 3.0 Goals

* **Future‑proof**: add a new engine by writing a tiny PLA (~1k–2k LOC) and a probe manifest; no grammar tables.
* **Self‑certifying**: every capability must be proven by a green probe in the current environment.
* **Portable knowledge**: learned results are packaged as **Server Knowledge Packs** and **Schema Neural Graphs** that travel with projects.

### 3.1 Protocol‑Lite Adapters (PLA)

Minimal responsibilities per engine (MySQL, Postgres, SQLite today):

* Connect (TLS first), auth handshake, simple text query, prepared‑stmt path, cancel, ping, graceful close.
* Stream rows/fields with typed decoders; expose a **capabilities‑agnostic** `execute(sql, params)` and `explain(sql)`.
* No dialect rules, no DDL helpers inside the PLA. All higher‑level logic lives in `@nublox/sqlx`.

**Packages**

* `@nublox/sqlx-pla-mysql`
* `@nublox/sqlx-pla-postgres`
* `@nublox/sqlx-pla-sqlite`

> These replace the old *driver* packages; API surface stays the same as the `Driver` interface already defined.

### 3.2 Feature‑Learning Orchestrator (FLO)

**Flow**

1. **Fingerprint**: version, build flags, cluster mode, collation/charset, timezone.
2. **Catalog**: enumerate databases/schemas, default search_path, extensions/plugins.
3. **Scratch Sandbox**: create ephemeral schema/db `sqlx_tmp_####` (RBAC‑respecting) for probes.
4. **Probe Manifests**: run a suite of micro‑tests (DDL/DML/TCL/DQL/DCL) expressed in IR → emitted SQL → executed via PLA. Each probe validates a single feature with strict asserts + cleanup.
5. **Capability Matrix v2**: aggregate green probes into a structured matrix with params (e.g., *"generated columns: stored=✓, virtual=✗"*).
6. **Emission Contracts**: generate dialect emission rules from findings (e.g., prefer `INSTANT`/`CONCURRENTLY`).
7. **Persist Artifacts** (see 3.3) and seal with environment hash.

**Probe Types** (examples):

* Types/Constraints: JSON, CHECK, DEFERRABLE FK, PARTITION BY, ENUM.
* SQL Features: CTEs, recursive CTE, window fns, MERGE/UPSERT forms.
* DDL Modes: INPLACE/INSTANT, CONCURRENTLY, LOCK NONE.
* TCL Semantics: isolation levels, savepoints, deadlock behavior.
* Limits: identifier length, max params, packet size, COPY/BULK limits.

### 3.3 Knowledge Artifacts

* **CapabilityMatrix.v2.json** — keyed by engine/version with param detail and confidence.
* **ServerKnowledgePack (.skp)** — tar+json bundle with:

  * fingerprint, CapabilityMatrix, probe logs, emission preferences, risk flags.
  * signed checksum (from `@nublox/sqlx-security`).
* **Schema Neural Graph (.sng)** — embeddings + topology per catalog:

  * **Graph**: tables, columns, indexes, FKs, views, routines → adjacency list.
  * **Embeddings**: tokenized IR (names, types, comments, sample stats) → vector per object.
  * **Usage**: Copilot reasoning, index hints, join inference, doc search.

Storage layout (project):

```
.sqlx/
  skp/
    mysql-8.4.0@hostA.skp
    postgres-16.3@staging.skp
  sng/
    hostA-appdb.sng
  caps/
    mysql-8.4.0@hostA.json   # CapabilityMatrix cache
```

### 3.4 Config & System Tests (User‑Provided)

Users can supply environment and **System Test** expectations; FLO incorporates them during learning.

**.env (example)**

```
DB_DIALECT=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_ROOT_USER=root
DB_ROOT_PASSWORD=changeMe
SQLX_SYSTEM_TESTS=./sqlx.tests.yaml
SQLX_SCRATCH_SCHEMA=sqlx_tmp
```

**sqlx.config.ts (excerpt)**

```ts
import { defineConfig } from '@nublox/sqlx';
export default defineConfig({
  targets: {
    local: {
      url: process.env.DATABASE_URL!,
      scratchSchema: process.env.SQLX_SCRATCH_SCHEMA || 'sqlx_tmp',
      allowDrops: false,
    },
  },
  learner: {
    probes: './sqlx.tests.yaml',
    maxRuntimeMs: 30000,
  },
});
```

**sqlx.tests.yaml (system tests)**

```yaml
version: 1
expect:
  ddl:
    online_alter_column: true
    concurrent_index_create: true
  features:
    json_type: true
    merge_statement: prefer_emulated # use UPSERT emulation if native missing
limits:
  max_identifier_len: ">= 63"
  max_params: ">= 32767"
```

**CLI**

```
sqlx learn --env .env --out .sqlx/skp
sqlx verify --env .env --tests sqlx.tests.yaml
sqlx caps --print    # pretty table of learned matrix
sqlx graph --emit-sng --db appdb   # build Schema Neural Graph
```

### 3.5 Safety & Idempotency

* All probes run inside `scratchSchema`; teardown is mandatory; FLO aborts if cleanup fails.
* Risk budget: cap concurrent probes; breaker opens on elevated error rate.
* RBAC mode: if root creds not available, FLO scopes to read‑only tests and degrades gracefully.

### 3.6 Neural Layer Details (RC scope)

* **Embeddings**: on‑device small model (e.g., 128–256 dims) trained/fine‑tuned on IR tokens; cold‑start via rules.
* **Inference**: cosine similarity for join/key inference, Copilot context, plan heuristics.
* **No cloud dependency** required; optional cloud federation to NuBlox Cloud later.

---

## 4. Learner Engine (details)

**Goal:** emit a `CapabilityMap` per session.

* **Version Probe**: `SELECT VERSION()` / `SHOW server_version;`
* **Feature Probes**: temporary objects to test:

  * JSON types, generated columns, check constraints, window functions, CTE, MERGE, DEFERRABLE FKs.
  * DDL online capabilities (ALGORITHM=INPLACE/INSTANT; PG `ALTER TABLE ... USING INDEX TABLESPACE ...`).
* **Limits**: max packet, identifier length, max placeholders.
* **Dialect Tokens**: reserved words, quoting rules, identifier case.
* **Caching**: persisted per-host+version; invalidated by version change or failed verify.

---

## 5. IR Schema & Emission

### 5.1 IR Schema Snapshot

```ts
export interface IRSchemaSnapshot {
  dbName: string;
  tables: Record<string, IRTable>;
  views: Record<string, IRView>;
  routines: Record<string, IRRoutine>;
  indexes: Record<string, IRIndex[]>;
  policies?: Record<string, IRPolicy[]>;
}
```

### 5.2 Emission Strategy

* **Emitter** translates IR → SQL per dialect using `CapabilityMap` (no static grammar tables).
* **Safety**: identifiers normalized via `ident()`; literals parameterized.
* **Online DDL**: choose path (INSTANT/INPLACE/LOCK NONE; PG `CONCURRENTLY`).

---

## 6. Planner/Diff/Apply

* **Graph Compare**: topological sort to honor dependencies (FKs, views, routines).
* **Plan Phases**: `preflight` (probes/locks), `ddl`, `postfix` (analyze/vacuum), `verify`.
* **Rollback**: inverse ops generation; for destructive ops require snapshot/export.
* **Batching**: chunk by dependency + lock strategy; `--online` favors non-blocking paths.
* **Dry-Run**: emit plan with risk score and timing estimate.

---

## 7. Self‑Healing & Circuit Breaker

* **Health Score** per target: p50/p95 latency, error rate, saturation, replication lag.
* **Breaker States**: `closed` → `open` (tripped) → `half-open` (probe window).
* **Auto-Retry**: idempotent ops backoff Jitter; non-idempotent require plan resume.
* **Session Resync**: re-prepare statements; validate transaction state.

---

## 8. Telemetry & Observability

* **Metrics**: `sqlx_exec_latency_ms`, `sqlx_errors_total`, `sqlx_rows_read`, `sqlx_cache_hit`.
* **Traces**: span per Exec/Plan phase; W3C trace context.
* **Logs**: structured JSON; redacts secrets via `sqlx-security`.
* **Exporters**: Prometheus pull, OTLP gRPC/HTTP; file sink for air-gapped.

---

## 9. Cache & Compression

* **L1**: in-process LFU; TTL + tag invalidation (`table:users`, `query:Q123`).
* **L2 Interface**: Redis-compatible but optional; adapters are pluggable.
* **Compression**: lz4 (Rust), gzip (Node zlib); auto-threshold via histograms.

---

## 10. Security & Governance

### 10.0 Overview

Enterprise‑grade security is a first‑class kernel inside SQLx OS. Compliance, PII detection, policy learning, and forensic audit are integrated with the runtime (Executor, Planner, Studio) and the Observability Bus.

### 10.1 Integrated Compliance Modes

**Modes:** `SOX`, `GDPR`, `HIPAA`, `PCI`, `SOC2` (extensible).

* **Activation:** `sqlx.config.ts` → `security.compliance = ['GDPR','SOC2']` or CLI `--compliance GDPR,SOC2`.
* **Effects:**

  * Default TLS required; insecure blocked unless `--allow-insecure` with risk prompt.
  * Strong password & rotation policy; ephemeral creds for automations.
  * PII access gating: masking/redaction by default in Studio & SDK.
  * Audit verbosity: raise to `audit+` (full Exec lineage).
  * Data residency & retention hints flow into Planner (e.g., partition by region/date).

### 10.2 PII Classification

* **Engines:** rule‑based detectors (regex + dictionaries), statistical detectors (format/entropy), and **semantic detectors** using the Schema Neural Graph embeddings.
* **Scope:** columns, views, materialized views; sampled data (configurable) with k‑anonymity safeguards.
* **Output:** PII tags on IR (`ir.columns[].tags = ['pii:email','pii:health']`).
* **Actions:** automatic masking in query results, policy checks on DML/DDL, Copilot warnings.
* **CLI:**

```
sqlx pii:classify --url ... --out .sqlx/pii.report.json
sqlx pii:mask --policy pii_default.yml --preview
```

### 10.3 Policy Engine & Policy Learning

* **Policy DSL (YAML/TS):** allow/deny rules on operations, objects, and contexts.

```yaml
version: 1
rules:
  - when: role in ['analyst']
    on: select
    where: table matches 'patient_*'
    effect: allow
    mask:
      columns:
        ssn: last4
        dob: year_only
  - when: region == 'EU'
    on: transfer
    effect: deny
    reason: GDPR residency
```

* **Learning Loop:**

  * Observe Exec stream → infer common access patterns → propose **tightenings** (least privilege, column‑level grants, row policies).
  * Drift detection: if ad‑hoc wider privileges persist without justification, raise review tasks.
* **Enforcement Points:** CLI, SDK Exec gate, Studio mutations; violations produce `ESEC_POLICY` with remediation advice.

### 10.4 Forensic Timeline (Tamper‑Proof)

* **Model:** append‑only audit log with hash‑chain (Merkle root per window); timestamped with monotonic clock; signed with environment key.
* **Coverage:** connect, learn, plan, apply, exec (text + params hash), policy decisions, PII scans, user actions in Studio.
* **Storage:** local `.sqlx/audit/*.ndjson` + optional remote sink (S3/object store, SIEM via OTLP).
* **Verification:** `sqlx audit:verify` recomputes hashes and validates signatures.
* **Export:** `sqlx audit:export --format csv|json|parquet`.

### 10.5 Encryption & Secrets

* **TLS Everywhere:** SNI, cert pinning (via `@nublox/sqlx-security`), mTLS optional.
* **At Rest:** envelope encryption for snapshots/plans using OS keychain or KMS plugin.
* **In Memory:** key material isolated; zeroization on process exit.

---

## 11A. Autonomous Schema Planner & Refactorer (ASP)

### 11A.0 Goal

Continuously analyze the live schema + workload + capabilities to **propose and optionally enact more efficient database designs**, safely and explainably.

### 11A.1 Inputs

* **Schema Neural Graph (.sng):** topology + embeddings.
* **Workload Telemetry:** query fingerprints, latencies, cardinalities, hot paths.
* **CapabilityMatrix:** partitioning/index options, online DDL modes.
* **Policies & Compliance:** residency, retention, PII masking constraints.

### 11A.2 Heuristics & ML Signals

* **Normalization/Denormalization:** detect over‑join patterns; propose materialized views or selective denorm with write‑amplification budget.
* **Index Synthesis:** composite indexes based on selectivity/coverage; invisible index trials when supported.
* **Partitioning/Sharding:** propose range/hash partitions; time‑based partitions for retention.
* **Constraints:** identify missing FKs/uniques; suggest deferrable constraints where supported.
* **Storage Layout:** column type tightening, compression, JSON → typed columns when safe.

### 11A.3 Pipeline

1. **Discover** (learn, snapshot, SNG build)
2. **Analyze** (telemetry + SNG to identify bottlenecks)
3. **Hypothesize** (generate IR deltas; compute cost/benefit)
4. **Simulate** (shadow environment or offline planner with rowcount histograms)
5. **Validate** (risk scoring, policy/compliance checks)
6. **Propose** (human‑readable report, diffs, rollback plan)
7. **Apply** (optional, online DDL with breaker + snapshot)

### 11A.4 Artifacts

* **Schema Improvement Plan (SIP)** — `plan.sip.json` with:

  * rationale, before/after DDL (IR + emitted SQL), risk level, rollback steps, expected latency/throughput deltas.
* **Bench Reports** — synthetic or captured replays with before/after metrics.

### 11A.5 Interfaces

```ts
interface SchemaImprovementPlan { id: string; rationale: string[]; risk: 'low'|'med'|'high';
  changes: IRDDL[]; expected: { latencyPct?: number; throughputPct?: number; storagePct?: number };
  rollback: IRDDL[]; }

const sip = await sqlx.planSchemaImprove({ goals: { reduceLatencyPct: 30, storagePct: 10 } });
await sqlx.simulate(sip, { mode: 'shadow', duration: '10m' });
await sqlx.apply(sip, { online: true, requireApproval: true });
```

### 11A.6 CLI

```
sqlx plan:schema-improve --url ... --goals latency=-30,storage=-10 --out plan.sip.json
sqlx simulate --url ... --plan plan.sip.json --shadow --duration 10m
sqlx apply --url ... --plan plan.sip.json --online --approve
```

### 11A.7 Guardrails

* **Safety First:** destructive ops gated; snapshot/backup required; staged rollout with small read replica first when available.

* **Explainability:** every proposed change must include a clear reasoning trail referencing telemetry + SNG evidence.

* **Reversibility:** rollback IR required for approval.

* **RBAC**: roles, grants; policy evaluation hooks per Exec.

* **Secrets**: TLS, password vault via OS keychain; ephemeral creds rotation.

* **Audit Graph**: append-only log; hash chain; exportable.

* **PII Tagging**: column classifier (regex + stats + rules), opt-in Dec RC.

---

## 11. CLI Spec (`@nublox/sqlx-cli`)

```
sqlx connect --url mysql://user:pass@host:3306/db
sqlx learn --url ... --out caps.json
sqlx snapshot:pull --url ... --out schema.snapshot.json
sqlx plan:diff --from schema.snapshot.json --to target.schema.json --out plan.sqlx.json
sqlx apply --url ... --plan plan.sqlx.json --online --rollback-snapshot s1.tgz
sqlx observe --url ... --otel http://localhost:4318
sqlx ping --url ... --timeout 2000
sqlx explain --url ... --sql "SELECT ..."
```

* **Config**: `sqlx.config.ts` (targets, policies, environments).
* **Output Contracts**: JSON schemas versioned (v1).

---

## 12. Studio (Dec RC)

* **Views**: Connections, Schema Designer, Plan/Apply, Query Monitor, Telemetry, Security.
* **Copilot**: NL → IR → SQL; Explain/Why; one-click apply with plan preview.
* **Offline Mode**: work against snapshots; generate plans; simulate timings.

---

## 13. Performance Targets (RC)

* **Connect+Learn**: ≤ 300 ms median.
* **Schema Diff (1k objects)**: ≤ 1.0 s generate plan.
* **Bulk Insert (1M rows)**: ≥ 250k rows/s Node-only; ≥ 600k with Rust accel.
* **Exec p95**: overhead ≤ 5% over native drivers.
* **Memory**: baseline < 70 MB idle core; < 200 MB with Studio.

---

## 14. Testing & Validation

* **Matrix**: Node 20/22; Linux/macOS; MySQL 8.0/8.4; PG 13/14/16; SQLite 3.45.
* **Golden Files**: IR→SQL emission tests by capability map permutations.
* **Chaos**: kill connections mid-transaction; packet truncation; slow network.
* **Soak**: 24h mixed workload; memory growth < 2%.
* **Security**: fuzz parsers; TLS MITM; secret redaction tests.

---

## 15. Error Model

```ts
export interface SqlxError extends Error {
  code: string;           // EPROTO, EAUTH, EDDLLOCK, ETIMEOUT, ETRANSIENT
  severity: 'info'|'warn'|'error'|'fatal';
  retriable?: boolean;
  context?: Record<string, unknown>;
}
```

* **Classifier** maps wire errors to canonical codes; suggests action (retry, rollback, open-breaker).

---

## 16. Roadmap Detail (Oct–Dec)

### October (Core Online)

* [ ] MySQL driver: handshake, auth, COM_QUERY, prepared stmts, ping, kill.
* [ ] PG driver: startup, SCRAM, simple query, extended proto MVP.
* [ ] Learner v1: version/feature probes; cache.
* [ ] IR v1: DDL(table/index/fk), DML(insert/update/delete), TCL begin/commit.
* [ ] Planner diff MVP: tables/indexes; drop gated behind `--allow-drop`.
* [ ] CLI: connect, learn, ping, snapshot:pull.

### November (Autonomy + Safety)

* [ ] Online DDL strategies; rollback snapshots.
* [ ] Planner validate/apply with risk scoring.
* [ ] Self-healing + circuit breaker.
* [ ] Observability Bus + OTLP exporter.
* [ ] Copilot alpha: NL→IR for DDL + SELECT.

### December (Studio RC)

* [ ] SQLx Studio views + plan/apply UX.
* [ ] Security kernel: RBAC + audit log MVP.
* [ ] Performance hardening + accel-rs optional.
* [ ] Docs + examples + demo datasets.

---

## 17. Example Flows

### 17.1 Connect → Learn → Diff → Apply

1. `sqlx connect --url ...`
2. `sqlx learn --url ...` → writes `caps.json`.
3. `sqlx snapshot:pull --url ...` → `schema.snapshot.json`.
4. Edit `target.schema.json` (or generate via Copilot).
5. `sqlx plan:diff --from ... --to ... --out plan.json`.
6. `sqlx apply --url ... --plan plan.json --online --rollback-snapshot r1.tgz`.

### 17.2 Copilot DDL

* Prompt: *“Add orders table with id, user_id FK users(id), total numeric(12,2) default 0, created_at now; index on user_id.”*
* Output: IR + emitted SQL per dialect; reasoning + risk.

---

## 18. Security Design Details

* **TLS**: Enforce TLS by default; insecure requires `--ssl=0` + warning.
* **Secrets-at-Rest**: OS keychain integration; env override for CI.
* **Audit**: hash-chain with `prevHash`; export to SIEM.
* **PII**: column tags in IR; policies enforce redaction at fetch.

---

## 19. Public Contracts (Stable)

* JSON Schemas: `CapabilityMap.v1.json`, `IRSchemaSnapshot.v1.json`, `Plan.v1.json`, `ApplyReport.v1.json`.
* Semver: `@nublox/sqlx` 0.9.x pre-RC; RC tagged 0.99.0.

---

## 20. Acceptance Criteria (RC Go/No-Go)

* ✅ MySQL & Postgres drivers pass conformance + soak tests.
* ✅ Planner can migrate 80% of common changes online with rollback path.
* ✅ Studio performs core tasks end-to-end in ≤5 clicks.
* ✅ Copilot can generate ≥70% correct DDL/DQL on first pass with explanations.
* ✅ Observability Bus integrated; OTLP verified in Prometheus/Grafana/Tempo.

---

## 21. Open Risks & Mitigations

* **Wire edge-cases (auth, timezone, collation)** → add integration fixtures; expand learner probes.
* **Planner correctness** → golden tests; dry-run required in CI before apply.
* **Performance regressions** → benchmarks in CI; perf budgets enforced.
* **Security drift** → policy snapshots + diff; signed releases.

---

## 22. Glossary

* **IR**: Intermediate Representation. Canonical DB-agnostic model.
* **CapabilityMap**: Learned dialect features + limits for a session/engine.
* **Plan**: Ordered steps to transform current → target safely.
* **Breaker**: Circuit breaker to isolate failing targets.

---

## 23. Appendix — Minimal API Examples

```ts
import { Sqlx } from '@nublox/sqlx';
const sqlx = await Sqlx.connect('mysql://root:pass@localhost:3306/app');
const caps = await sqlx.learn();
const snap = await sqlx.snapshot();
const plan = await sqlx.planDiff(snap, target);
await sqlx.apply(plan, { online: true, rollbackSnapshot: 'r1.tgz' });
```

```bash
# CLI
sqlx learn --url $URL > caps.json
sqlx snapshot:pull --url $URL > schema.snapshot.json
sqlx plan:diff --from schema.snapshot.json --to target.json --out plan.json
sqlx apply --url $URL --plan plan.json --online --rollback-snapshot r1.tgz
```

---

> **This document is the engineering source of truth for the December RC build.** All feature, performance, and security decisions must trace back to the contracts defined here.
