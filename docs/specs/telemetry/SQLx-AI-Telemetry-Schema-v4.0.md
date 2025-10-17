Perfect.
Here is the **definitive, single-canvas, copy-paste-ready** document for your telemetry layer — the unified v4.1 edition that harmonises with Kernel, UDR, Observability and Copilot.

Save as:
`docs/specs/telemetry/SQLx-AI-Telemetry-Schema-v4.1.md`

---

````markdown
# SQLx AI Telemetry Schema (ATS) v4.1  
*Unified Traces, Metrics, Logs, and Learning Artifacts for Autonomous SQLx OS*  
**Version:** 4.1 **Status:** Stable **Owner:** NuBlox Labs — AI Fabric & Observability  

---

## Executive Summary  
The **AI Telemetry Schema (ATS)** defines the canonical format for all observability and learning data in SQLx OS.  
It provides a vendor-neutral, OpenTelemetry-aligned envelope for **traces**, **metrics**, **logs**, and **learning artifacts**, unifying system telemetry with reinforcement signals for the AI Fabric (Copilot).  
ATS v4.1 extends v4.0 with new fields for **epoch tracking**, **policy linkage**, **SLO classification**, and **Copilot reasoning metadata**, ensuring every event is auditable, explainable, and AI-ready.

---

## 1  Design Principles  

| Principle | Description |
|:--|:--|
| **Vendor-neutral** | Aligns to OpenTelemetry and Prometheus conventions. |
| **Stable IDs** | Deterministic hashes for AIR graphs, plans, and spans. |
| **Schema Evolution** | Additive; backward compatible across releases. |
| **Privacy-first** | Default redaction, tokenisation, and classification. |
| **AI-Aware** | Contains structured reward, model, and epoch metadata. |
| **Stream-Ready** | Works over HTTP/gRPC/Kafka with JSON or Parquet payloads. |

---

## 2  Envelope Schema  

All ATS families share a common top-level structure:

```json
{
  "ts": "2025-10-17T09:00:00.234Z",
  "tenant": "acme",
  "workspace": "prod-eu",
  "trace_id": "4a1b...",
  "span_id": "9f3a...",
  "air_id": "air:Q-9f3a",
  "plan_hash": "ph:ab12",
  "policy_id": "pol:ff3d",
  "dialect": "mysql",
  "region": "eu-west-2",
  "slo_class": "L",
  "ai_meta": {
    "model": "copilot-v1",
    "epoch": 1234,
    "reward": +1.4,
    "confidence": 0.98
  }
}
````

**Required fields:** `ts`, `trace_id`, `span_id`, `tenant`, `workspace`.
All other fields optional but recommended for correlation.

---

## 3  Artifact Families

| Family                 | Purpose                                      | Transport       | Typical Volume |
| :--------------------- | :------------------------------------------- | :-------------- | :------------- |
| **Trace Events**       | Distributed spans for Kernel, Driver, Policy | OTLP/HTTP/gRPC  | High           |
| **Metrics**            | Quantitative SLO indicators                  | OTLP/Prometheus | Continuous     |
| **Logs**               | Structured audit and diagnostics             | Loki/Elastic    | Moderate       |
| **Learning Artifacts** | Rewards, embeddings, cost models             | Kafka/Parquet   | Variable       |

---

## 4  Trace Attributes

| Attribute        | Type              | Example                                  |
| :--------------- | :---------------- | :--------------------------------------- |
| `sqlx.tenant`    | string            | `"acme"`                                 |
| `sqlx.workspace` | string            | `"prod-eu"`                              |
| `db.system`      | string            | `"mysql"`, `"postgresql"`                |
| `db.statement`   | string (redacted) | `"SELECT name FROM users WHERE age > ?"` |
| `db.operation`   | string            | `"SELECT"`                               |
| `sqlx.air_id`    | string            | `"air:Q-9f3a"`                           |
| `sqlx.plan_hash` | string            | `"ph:ab12"`                              |
| `sqlx.policy_id` | string            | `"pol:ff3d"`                             |
| `net.peer.name`  | string            | `"db.prod.internal"`                     |
| `net.peer.port`  | int               | `5432`                                   |
| `enduser.id`     | string            | `"actor:svc-billing"`                    |
| `slo.class`      | string            | `"L"`                                    |
| `ai.reward`      | float             | `+1.4`                                   |

Sensitive literals are **redacted** unless `telemetry.debugRedact=false` in dev.

---

## 5  Metric Definitions

### 5.1 Counters

| Metric                         | Labels        | Description               |
| :----------------------------- | :------------ | :------------------------ |
| `sqlx_driver_errors_total`     | dialect,class | Transport/protocol errors |
| `sqlx_policy_denies_total`     | reason        | Policy denials            |
| `sqlx_cache_events_total`      | type          | hit/miss/invalidate       |
| `sqlx_sched_preemptions_total` | class         | Scheduler preemptions     |

### 5.2 Histograms

| Metric                   | Labels     | Unit | Description          |
| :----------------------- | :--------- | :--- | :------------------- |
| `sqlx_exec_latency_ms`   | class      | ms   | Query latency        |
| `sqlx_driver_latency_ms` | dialect,op | ms   | Driver op latency    |
| `sqlx_policy_eval_ms`    | -          | ms   | Policy decision time |
| `sqlx_air_compile_ms`    | phase      | ms   | AIR parse/plan time  |

### 5.3 Gauges

| Metric               | Labels  | Description           |
| :------------------- | :------ | :-------------------- |
| `sqlx_pool_active`   | dialect | Active connections    |
| `sqlx_pool_idle`     | dialect | Idle connections      |
| `sqlx_cache_size`    | kind    | Cache footprint       |
| `sqlx_model_version` | agent   | Copilot model version |

---

## 6  Log Schema

Structured JSON logs support deterministic ingestion.

**Example: plan regression**

```json
{
  "ts": "2025-10-17T09:01:11Z",
  "trace_id": "4a1b...",
  "event": "udr.plan.regression",
  "tenant": "acme",
  "air_id": "air:Q-9f3a",
  "plan_hash": "ph:ab12",
  "baseline_cost": 122.3,
  "new_cost": 178.9,
  "regression": true,
  "action": "rollback_plan"
}
```

**Example: policy decision**

```json
{
  "ts": "2025-10-17T09:02:00Z",
  "event": "policy.deny",
  "actor": "user:analyst-42",
  "object": "db.public.users.email",
  "reason": "cross-region egress blocked",
  "obligations": ["mask:email"]
}
```

---

## 7  Learning Artifacts

Learning artifacts drive Copilot’s reinforcement and embedding models.

### 7.1 Reward Record

```json
{
  "ts": "2025-10-17T09:03:05Z",
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

### 7.2 Embedding Record

```json
{
  "ts": "2025-10-17T09:03:06Z",
  "air_id": "air:Q-9f3a",
  "embedding_id": "emb:Q-9f3a:v1",
  "vector": [0.112, -0.045, ...],
  "model": "sqlx-emb-encoder-v1",
  "meta": {"kind":"SELECT","sensitivity":"none"}
}
```

### 7.3 Capability Discovery

```json
{
  "ts": "2025-10-17T09:03:07Z",
  "dialect": "postgres",
  "version": "15.3",
  "capability": "WINDOW",
  "evidence": "row_number() accepted",
  "confidence": 0.98
}
```

---

## 8  Privacy & Federation

### 8.1 Classification

| Field         | Values                    | Purpose        |
| :------------ | :------------------------ | :------------- |
| `sensitivity` | pii, phi, financial, none | PII tagging    |
| `residency`   | eu, uk, us, ...           | Region tagging |
| `retention`   | 30d, 90d, 365d            | Data lifecycle |

Tags propagate from AIR nodes into telemetry automatically.

### 8.2 Redaction

* Parameters replaced with `?` or `$1`.
* Token vault optional for reversible pseudonymisation in dev.
* Differential privacy budgets per tenant.

### 8.3 Consent Flags

```json
{
  "federation": {
    "share": false,
    "privacy_budget_eps": 1.0,
    "privacy_budget_delta": 1e-6
  }
}
```

### 8.4 Retention Policy

| Artifact           | Default Retention                               |
| :----------------- | :---------------------------------------------- |
| Traces/Logs        | 30 days                                         |
| Metrics            | 400 days (rolled up)                            |
| Learning Artifacts | 90 days local; 0 days federated unless opted-in |

---

## 9  Transport & Storage

| Layer                   | Implementation                                             |
| :---------------------- | :--------------------------------------------------------- |
| **Traces/Metrics/Logs** | OTLP Collector → Prometheus / Tempo / Loki                 |
| **Learning Stream**     | Kafka / Redpanda (`sqlx.learn.reward`, `sqlx.learn.embed`) |
| **Batch Lake**          | Parquet on S3/GCS/Azure Blob                               |
| **Search**              | OpenSearch for indexed logs                                |

Topic partitioning:

```
sqlx.learn.reward.{workspace}.{yyyyMMdd}
sqlx.learn.embed.{workspace}.{yyyyMMdd}
```

---

## 10  Schema Registry & Versioning

* Header: `ats.version = 4.1.0`
* Backward-compatible additions only.
* Breaking change → bump major + dual-write period.
* Registry stored in `docs/specs/telemetry/schema/ats-4.1.0.json`.

---

## 11  Sampling & Budgeting

| Type                    | Description                                |
| :---------------------- | :----------------------------------------- |
| **Tail-based sampling** | Retain only slow/error traces.             |
| **Dynamic sampling**    | Higher rate for new releases or anomalies. |
| **Learning budget**     | Cap reward events per tenant/day.          |
| **PII budget**          | Block federation when exhausted.           |

---

## 12  Validation & Conformance

* JSON Schema validation on ingestion.
* Unit tests for producers in CI.
* Golden traces maintained for benchmark workloads.
* Schema registry enforces type stability and required fields.

---

## 13  Security Considerations

* **Transport**: mTLS between producers/collectors.
* **Integrity**: signed learning artifacts with SHA-256 hash.
* **Access**: scoped tokens (`read:metrics`, `read:learn`).
* **Secrets**: automatic masking in logs.
* **PII Handling**: full redaction unless authorised via policy.

---

## 14  Example End-to-End Flow

```mermaid
flowchart LR
    APP[Client] --> KRN[Kernel]
    KRN -->|spans/logs| OTL[OTel Collector]
    KRN -->|rewards/embeddings| KAF[Kafka Topics]
    OTL --> OBS[Traces/Metrics Stores]
    KAF --> LBS[Learning Batch Store (Parquet)]
    LBS --> AIF[AI Fabric Training]
    AIF --> KRN
```

---

## 15  Extensions in v4.1

| New Field    | Purpose                                           |
| :----------- | :------------------------------------------------ |
| `policy_id`  | Correlate telemetry with policy decisions         |
| `slo_class`  | Link spans to SLO target (L/B/A/S)                |
| `ai_meta`    | Nested model/epoch/reward/confidence data         |
| `residency`  | Explicit region tag for privacy enforcement       |
| `federation` | Fine-grained control of learning artifact sharing |

---

## 16  Open Questions (RFCs)

1. Should ATS define binary streaming for rewards to cut overhead by 50 %?
2. Should embeddings support **incremental delta encoding** for vector reuse?
3. Can Copilot push adaptive sampling directives via ATS control messages?
4. Should telemetry adopt a **columnar Arrow/Parquet** schema for hot analytics?
5. How to federate ATS registry updates across multi-tenant clusters?

---

## 17  Related Documents

* `docs/specs/observability/SQLx-Observability-and-SLOs-v4.0.md`
* `docs/specs/kernel/SQLx-Kernel-Spec-v4.0.md`
* `docs/specs/policy/SQLx-Policy-Graph-and-RBAC-v4.0.md`
* `docs/specs/udr/SQLx-UDR-Spec-v4.0.md`
* `docs/specs/ai/SQLx-Copilot-Architecture-v1.0.md`

---

**Author:** NuBlox Engineering **Reviewed:** October 2025
**License:** NuBlox SQLx OS — Autonomous Database Framework

```