# NuBlox SQLx OS — Engineering Specification v4.1 (Full)

> **Scope:** Production‑grade autonomous, dialect‑agnostic **database OS** + **Database Studio** atop a zero‑dependency TypeScript runtime with optional Rust accelerators. Targets **PostgreSQL family**, **MySQL family**, **SQLite** for December RC. SQL Server (TDS) + Oracle (OCI) next.

---

## 0) Non‑Negotiables (Release Contract)
- **Dialect‑free code:** No `if (dialect)` branches; only capability predicates from FLO.  
- **Family transports only:** Transport packs (TDL JSON) for PG/MySQL/SQLite (TDS/OCI later).  
- **IR‑first:** Every op (DDL/DML/DQL/DCL/TCL) flows through canonical IR.  
- **Explainable AI:** Every advisor action has rationale + rollback IR.  
- **Fail‑safe DDL:** Preflight, online strategies, rollback snapshot, circuit breaker.  
- **CLI/SDK parity** and **Unified Observability (OTel)**.  
- **NuBlox‑native Copilot** (no third‑party LLMs).

---

## 1) Workspace & Packages (pnpm)
```
packages/
  @nublox/sqlx              # Core facade (createDriver)
  @nublox/sqlx-transport    # Transport runner (TDL interpreter)
  @nublox/sqlx-flo          # Feature-Learning Orchestrator
  @nublox/sqlx-ir           # IR types & serializers
  @nublox/sqlx-planner      # Diff/validate/apply + SIP + simulate
  @nublox/sqlx-sng          # Schema Neural Graph
  @nublox/sqlx-observe      # Metrics/logs/traces (OTLP/Prom)
  @nublox/sqlx-security     # TLS policy, PII, policy DSL/learning, audit chain
  @nublox/sqlx-copilot      # NuBlox-native LLM runtime (Edge/Pro/Enterprise)
  @nublox/sqlx-rdm          # Optional runtime driver micro-builder
  @nublox/sqlx-cli          # CLI
transports/
  registry.json             # scheme → TDL pack map
  pg.tdl.json mysql.tdl.json sqlite.tdl.json
```
---

## 2) Core API (createDriver)
```ts
export async function createDriver(url: string): Promise<Driver>
export interface Driver {
  url: string
  ping(): Promise<void>
  execute(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>
  explain(sql: string): Promise<any>
  snapshot(): Promise<IRSchemaSnapshot>
  capabilities(): Promise<CapabilityMatrix>
  plan: {
    diff(from: IRSchemaSnapshot, to: IRSchemaSnapshot): Promise<Plan>
    schemaImprove(goals?: ImproveGoals): Promise<SchemaImprovementPlan>
    apply(plan: Plan | SchemaImprovementPlan, opts?: ApplyOpts): Promise<ApplyReport>
  }
  close(): Promise<void>
}
```
- URL scheme is used only to load a **transport pack** from `transports/registry.json`.  
- TLS auto‑negotiation; remote requires TLS by default; localhost plaintext allowed with warnings.

---

## 3) Transport Runner (TDL Interpreter)
**Responsibilities:** run handshake/auth, encode/decode frames, query/prepare/execute, cancel, ping — driven by **TDL** data packs.  
**Outputs:** Opaque `session` + `exec/explain/ping/close` primitives.  
**No dialect literals in code.**

---

## 4) Feature‑Learning Orchestrator (FLO)
- Sandbox schema → **probe manifests** (IR → SQL via emitter) → asserts → **Capability Matrix v2**.  
- Persist **Server Knowledge Pack (SKP)** with logs, prefs, signed checksum.  
- Cache per host/version; invalidate on change; emit **security** info (TLS outcome).

**CapabilityMatrix.v2** includes: features, limits, supported SQL constructs, security flags.

---

## 5) IR & Emission
- IR nodes for DDL/DML/DQL/DCL/TCL; `IRSchemaSnapshot`.  
- Emission chooses strategies by **capability predicates** (e.g., `features.concurrentIndexCreate`).  
- Literals parameterized; identifiers normalized; dialect tokens derived from **learned** rules only.

---

## 6) Planner/Apply/Simulate
- **Diff:** graph compare; dependencies honored.  
- **Validate:** against caps & policies; risk scoring.  
- **Apply:** online strategies; breaker; rollback snapshot required for destructive steps.  
- **Simulate:** shadow mode or offline histograms.  
- **SIP:** Schema Improvement Plan with expected deltas and rollback IR.

---

## 7) Security & Governance
- **TLS policy:** require TLS for remote; self-signed/pin options; audit connection outcomes.  
- **Compliance modes:** `SOX`, `GDPR`, `HIPAA`, `PCI`, `SOC2`.  
- **PII classification:** rules+stats+SNG semantics → IR tags, default masking.  
- **Policy DSL & learning:** auto-tightening least-privilege proposals.  
- **Forensic timeline:** append-only, hash-chained, signed; `audit:verify` and export.

---

## 8) Schema Neural Graph (SNG)
- Build from snapshot + workload fingerprints.  
- Provide embeddings & topology for Copilot and planner (join inference, index/partition hints, PII cues).

---

## 9) Copilot (NuBlox‑native LLM)
- **Models:** NBX‑DBA‑Edge (~1.3B), Pro (~7B), Enterprise (~13B) with SQL/IR-aware tokenizer.  
- **Inference:** deterministic mode; JSON schema outputs; tool-calls into Planner/FLO/SNG; air‑gapped.  
- **Guardrails:** rollback IR required; policy gates before apply; audit prompts/tool calls.

---

## 10) Observability
- **Metrics:** `sqlx_exec_latency_ms`, `sqlx_errors_total`, `sqlx_rows_read`, `sqlx_cache_hit`.  
- **Traces:** spans per exec/plan phase; W3C trace context.  
- **Logs:** structured JSON with redaction; OTLP/Prom exporters.

---

## 11) Performance Targets (RC)
- Connect+Learn ≤ 300 ms median (warm).  
- Plan diff (1k objects) ≤ 1.0 s.  
- Exec overhead ≤ 5% vs native.  
- Bulk insert (1M rows) ≥ 250k r/s Node‑only; ≥ 600k with Rust accel.  
- Memory: core < 70 MB idle; Studio < 200 MB.

---

## 12) Testing & Quality
- Matrix: Node 20/22; Linux/macOS; PG 13/16; MySQL 8.0/8.4; SQLite 3.45.  
- Golden tests: IR→SQL per capability permutations.  
- Chaos: packet drops, mid‑tx kill, auth failures.  
- Soak: 24h mixed workload; mem growth < 2%.  
- Lint: denylist for dialect literals (allowed only in `transports/*.tdl.json`).

---

## 13) CLI Spec
```
sqlx ping
sqlx learn --env .env --out .sqlx/skp
sqlx snapshot:pull --out .sqlx/schema.snapshot.json
sqlx plan:diff --from a.json --to b.json --out plan.json
sqlx plan:schema-improve --goals latency=-30,storage=-10 --out plan.sip.json
sqlx simulate --plan plan.sip.json --shadow --duration 10m
sqlx apply --plan plan.json --online --approve
sqlx audit:verify
```
- Prints a **security banner** (TLS=on/off, trust, pin/fingerprint).

---

## 14) Roadmap (Oct–Dec)
- **Oct:** Transport runner MVP; FLO v1 (version/feature probes); IR v1; CLI ping/learn/snapshot.  
- **Nov:** Online strategies; rollback snapshots; breaker; Observability; Copilot alpha (DDL + SELECT).  
- **Dec:** Studio RC; Security kernel MVP; performance hardening; docs & demos.

---

## 15) Acceptance Criteria (RC)
- PG/MySQL/SQLite transports pass conformance + soak.  
- Planner achieves ≥80% common DDL online with rollback.  
- Studio completes core tasks end‑to‑end in ≤ 5 clicks.  
- Copilot ≥70% correct first‑pass DDL/DQL with explanations.  
- Observability integrated; OTLP verified.
