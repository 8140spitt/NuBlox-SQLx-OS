---
title: "NuBlox SQLx OS — AI Telemetry Schema (ATS) v4.0 (Draft)"
status: Draft
version: 4.0.0-draft.1
owners:
  - Stephen Spittal (@8140spitt)
  - NuBlox Labs — AI Fabric & Observability
reviewers:
  - Kernel Team
  - Security & Compliance
  - Driver Fabric Team
created: 2025-10-16
updated: 2025-10-16
---

> **Purpose** — The **AI Telemetry Schema (ATS)** standardizes **traces, metrics, logs, and learning artifacts** emitted by SQLx OS.  
> ATS enables: (1) **online optimization** (reinforcement signals), (2) **explainability** (policy/plan rationale), (3) **observability** (SLOs, drift), and (4) **federated learning** with privacy controls.

---

# 1. Design Principles

- **Vendor-neutral**: aligns to OpenTelemetry (OTel) where possible.  
- **Minimal PII**: default redaction and classification; safe-by-default exports.  
- **Deterministic IDs**: stable hashes for AIR graphs, plans, and compiled SQL.  
- **Schema Evolution**: semver + backward compatibility; additive by default.  
- **Stream-Ready**: transport-agnostic (gRPC/HTTP/Kafka/NATS).  
- **Privacy-Aware Learning**: explicit consent flags and privacy budgets for federation.

---

# 2. Top-Level Data Model

ATS defines four primary artifact families:

| Family | Purpose | Transport |
|:--|:--|:--|
| **Trace Events** | Spans for kernel/driver/policy/UDR steps | OTel Traces |
| **Metrics** | Counters, gauges, histograms | OTel Metrics |
| **Logs** | Structured audit and diagnostics | OTel Logs |
| **Learning Artifacts** | RL rewards, embeddings, cost models | JSON/Parquet (batch), Kafka (stream) |

All artifacts share a common **envelope** with correlation identifiers.

```json
{
  "ts": "2025-10-16T14:01:05.345Z",
  "tenant": "acme",
  "workspace": "prod-eu",
  "trace_id": "4a1b...",
  "span_id": "9f3a...",
  "air_id": "air:Q-9f3a",
  "plan_hash": "ph:ab12",
  "dialect": "mysql",
  "region": "eu-west-2"
}
```

---

# 3. Event Taxonomy

| Category | Event Names (suffix: .start|.ok|.error) |
|:--|:--|
| **Kernel Exec** | `kernel.exec`, `kernel.cancel`, `kernel.retry`, `kernel.timeout` |
| **Scheduler** | `sched.classify`, `sched.preempt`, `sched.enqueue`, `_sched.dequeue_` |
| **AIR** | `air.parse`, `air.normalize`, `air.plan`, `air.hash` |
| **UDR** | `udr.compile`, `udr.reverse`, `udr.exec`, `udr.emulation.used` |
| **Driver** | `driver.handshake`, `driver.query`, `driver.prepare`, `driver.close` |
| **Policy (π)** | `policy.evaluate`, `policy.deny`, `policy.obligation` |
| **Cache (PPC)** | `cache.hit`, `cache.miss`, `cache.invalidate` |
| **DDL/Migration** | `ddl.migration.start|ok|rollback`, `ddl.lock`, `ddl.online` |
| **Security** | `sec.auth`, `sec.tls`, `sec.key.rotate`, `sec.violation` |

> Naming is dot-scoped; each emits a **trace span** and a structured **log record**.

---

# 4. Trace Attributes (OTel Mapping)

| Attribute | Type | Example |
|:--|:--|:--|
| `sqlx.tenant` | string | `"acme"` |
| `sqlx.workspace` | string | `"prod-eu"` |
| `db.system` | string | `"mysql"`, `"postgresql"` |
| `db.statement` | string (redacted) | `"SELECT name FROM users WHERE age > ?"` |
| `db.operation` | string | `"SELECT"` |
| `db.sqlx.air_id` | string | `"air:Q-9f3a"` |
| `db.sqlx.plan_hash` | string | `"ph:ab12"` |
| `net.peer.name` | string | `"db.prod.internal"` |
| `net.peer.port` | int | `5432` |
| `enduser.id` | string (pseudonymous) | `"actor:svc-billing"` |

**Redaction policy**: parameters and sensitive literals are omitted from `db.statement` unless `telemetry.debugRedact=false` in dev mode.

---

# 5. Metric Set (SLO-Oriented)

### Counters
- `sqlx_driver_errors_total{dialect,class}`  
- `sqlx_policy_denies_total{reason}`  
- `sqlx_cache_events_total{type}` (hit/miss/invalidate)  
- `sqlx_sched_preemptions_total{class}`

### Histograms
- `sqlx_exec_latency_ms{class}` (L/B/A/S)  
- `sqlx_driver_latency_ms{dialect,op}` (handshake, query, prepare)  
- `sqlx_policy_eval_ms`  
- `sqlx_air_compile_ms` (parse/normalize/plan)

### Gauges
- `sqlx_pool_active{id}` / `sqlx_pool_idle{id}`  
- `sqlx_cache_size{kind}`  
- `sqlx_model_version{agent}`

---

# 6. Log Records (Structured)

Example: **policy denial**

```json
{
  "ts": "2025-10-16T14:03:22.111Z",
  "trace_id": "4a1b...",
  "span_id": "00ef...",
  "evt": "policy.deny",
  "tenant": "acme",
  "actor": "user:analyst-42",
  "air_id": "air:Q-42",
  "reason": "cross-region egress blocked by residency=eu",
  "obligations": ["mask:email"]
}
```

Example: **plan regression**

```json
{
  "ts": "2025-10-16T14:05:12.001Z",
  "evt": "udr.compile.ok",
  "air_id": "air:Q-9f3a",
  "plan_hash": "ph:ab12",
  "baseline_cost": 122.3,
  "new_cost": 178.9,
  "regression": true,
  "action": "rollback_plan"
}
```

---

# 7. Learning Artifacts

Learning artifacts power the AI Fabric and are stored in Parquet (batch) or emitted to Kafka (stream).

## 7.1 Reward Record
```json
{
  "ts": "2025-10-16T14:06:17.441Z",
  "air_id": "air:Q-9f3a",
  "plan_hash": "ph:ab12",
  "class": "L",
  "latency_ms": 12.3,
  "cpu_ms": 1.8,
  "io_bytes": 4096,
  "rows": 42,
  "success": true,
  "reward": -14.1, 
  "context": {"dialect":"mysql","region":"eu-west-2","engine":"8.0.36"}
}
```

## 7.2 Embedding Record
```json
{
  "ts": "2025-10-16T14:06:17.500Z",
  "air_id": "air:Q-9f3a",
  "embedding_id": "emb:Q-9f3a:v1",
  "vector": [0.112, -0.045, ...],
  "model": "sqlx-emb-encoder-v1",
  "meta": {"kind":"SELECT","sensitivity":"none"}
}
```

## 7.3 Capability Discovery Record
```json
{
  "ts": "2025-10-16T14:07:03.210Z",
  "dialect": "postgres",
  "version": "15.3",
  "capability": "WINDOW",
  "evidence": "row_number() accepted",
  "confidence": 0.98
}
```

---

# 8. PII, Privacy & Federation

## 8.1 Classification
Columns and literals are tagged in AIR; ATS copies tags into telemetry with **no raw values**.  
- `sensitivity = pii|phi|financial|none`  
- `residency = eu|uk|us|...`  
- `retention = 30d|90d|365d|...`

## 8.2 Redaction & Tokenization
- `db.statement` parameters replaced with `?` or `$1`.  
- **Token vault** optional for reversible dev-mode tokenization.

## 8.3 Consent Flags (per artifact)
```json
{
  "federation": {
    "share": false,
    "privacy_budget_eps": 1.0,
    "privacy_budget_delta": 1e-6
  }
}
```

## 8.4 Retention Policy (defaults)
| Artifact | Default Retention |
|:--|:--|
| Traces/Logs | 30 days |
| Metrics | 400 days (roll-up) |
| Learning Artifacts | 90 days (local), 0 days (federation unless opted-in) |

---

# 9. Transport & Storage

| Layer | Option |
|:--|:--|
| **Traces/Metrics/Logs** | OTel Collector → Prometheus/Tempo/Loki or OTLP gRPC |
| **Learning Stream** | Kafka / Redpanda topics (`sqlx.learn.reward`, `sqlx.learn.embed`) |
| **Batch Lake** | Parquet in object store (S3/GCS/Azure Blob) |
| **Search** | OpenSearch/Elasticsearch for logs |

**Topic Partitioning**
```
sqlx.learn.reward.{workspace}.{yyyyMMdd}
sqlx.learn.embed.{workspace}.{yyyyMMdd}
```

---

# 10. Schema Registry & Versioning

- **SemVer** header: `ats.version = 4.0.0`  
- **Backward-compatible changes**: add fields; do not change types.  
- **Breaking changes**: bump MAJOR; dual-write during migration window.  
- **Registry**: JSON schema in `/docs/specs/telemetry/schema/ats-4.0.0.json`

---

# 11. Sampling & Budgeting

- **Tail-based sampling** for slow or erroneous spans.  
- **Dynamic sampling** increases for new deployments or anomalies.  
- **Learning budget** — cap daily reward volume per tenant to control cost.  
- **PII budget** — block federation when privacy budget exhausted.

---

# 12. Validation & Conformance

- JSON Schema validation on ingestion.  
- Conformance tests in CI for all event producers.  
- Golden traces for benchmark scenarios (OLTP, ETL, BI).

---

# 13. Security Considerations

- mTLS between producers and collectors.  
- Signed artifacts (learning batches) with content hash + signature.  
- Access control via workspace scopes (`read:metrics`, `read:logs`, `read:learn`).  
- Secret redaction in logs (denylist patterns + context-aware filters).

---

# 14. Example End-to-End Flow (Mermaid)

```mermaid
flowchart LR
    APP[Client] --> KRN[SQLx Kernel]
    KRN -->|spans/logs| OTL[OTel Collector]
    KRN -->|rewards/embeddings| KAF[Kafka Topics]
    OTL --> OBS[Metrics/Traces/Logs Stores]
    KAF --> LBS[Learning Batch Store (Parquet)]
    LBS --> AIF[AI Fabric Training]
    AIF --> KRN
```

---

# 15. Open Questions

1. Should ATS define a minimal binary format for rewards to reduce overhead?  
2. Do we expose a public gRPC for external reward ingestion (third-party agents)?  
3. How to standardize per-tenant privacy budgets across meshes?  
4. Should we adopt differential privacy at source for sensitive spans?

---
