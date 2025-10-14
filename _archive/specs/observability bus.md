# Observability Bus v2 — Build Specification (Developer Hand‑Off)

**Subsystems:** `@nublox/sqlx-observe` (Collector, Normalizer, Stream, Narrative, FinOps), `@nublox/sqlx-otel` (tracing/metrics bridge), `@nublox/sqlx-causal` (Causal Graph)
**Owners:** Platform — Observability & FinOps
**Status:** Ready for Implementation
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Scope

Provide a unified, low‑latency Observability Bus that ingests **traces, metrics, logs, and Helix domain events**, constructs a **Causal Event Graph**, detects **anomaly DNA patterns**, and emits **human‑readable narratives** with **FinOps cost attribution**. This is the analytic backbone for Helix reinforcement, Policy AI insights, and developer diagnostics.

**Goals**

* 100% correlation between API/ORM/Core operations and telemetry (trace‑first design).
* Deterministic event schemas; strong contracts for downstream consumers (Control Plane, CLI, Consoles).
* Causal narratives within **≤ 500 ms** of event ingestion (p95) for interactive feedback.
* FinOps cost model per query/mutation/migration with rollups by service, entity, tenant, and region.

**Non‑Goals**

* Long‑term storage tier (hand‑off to data lake/SIEM via exporters).
* UX dashboards (owned by Console), though API supports them.

---

## 2. Success Criteria (Acceptance)

* **Latency:** ingestion→narrative p95 ≤ 500 ms; ingestion→metric p50 ≤ 50 ms.
* **Coverage:** ≥ 99.9% events carry `traceId`+`spanId` and `irId`/`planId` where applicable.
* **Accuracy:** anomaly classifier precision ≥ 0.85 on reference incident corpus; cost model error ≤ 10% vs cloud billing.
* **Scalability:** sustain 50k events/s per region; horizontal scaling supported.

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Observability Bus v2                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. Ingest Gateway (OTel HTTP/gRPC, JSON Events)                               │
│ 2. Normalizer (schema mapping, redaction, enrichment)                          │
│ 3. Stream Processor (Kafka/NATS adapter, windowing)                            │
│ 4. Causal Graph Builder (edges, vector clocks, lineage)                        │
│ 5. Anomaly DNA (pattern mining, classifiers)                                   │
│ 6. Narrative Engine (template+LLM hybrid; deterministic mode)                  │
│ 7. FinOps Engine (cost attribution & rollups)                                  │
│ 8. API Layer (query, narratives, analytics)                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Dataflow**

```
OTel/JSON → Ingest → Normalizer → Stream → { CausalGraph, AnomalyDNA, FinOps } → Narrative/API → Control/Helix/Console
```

---

## 4. Event Model & Schemas

### 4.1 Core Identifiers

* `traceId`, `spanId`: W3C Trace Context.
* `irId`, `planId`: from Helix Core.
* `entity`, `tenant`, `region`, `env`, `bundleVersion`.

### 4.2 TelemetryEvent (Domain)

```ts
export type EventKind = 'query'|'ddl'|'error'|'policy'|'cache'|'deploy'|'health';
export interface TelemetryEvent {
  id: string; ts: number; kind: EventKind;
  traceId: string; spanId: string; parentSpanId?: string;
  attrs: Record<string, unknown>; // dialect, estimatedCostMs, actualMs, retries, policyRuleId …
  irId?: string; planId?: string; entity?: string; tenant?: string; region?: string; env?: string;
}
```

### 4.3 Metric & Log Bridges

* **Metrics**: Histograms/counters/gauges mapped from events (e.g., `sqlx.query.duration`).
* **Logs**: structured JSON, redacted fields; only emitted on policy/access/error events.

### 4.4 Redaction Policy

* PII/secret detectors run in **Normalizer**; redact before persistence.
* Allowlist attributes (entity names, numeric sizes) preserved.

---

## 5. Ingestion & Normalization

### 5.1 Ingest Gateway

* Accepts OTel gRPC/HTTP and raw JSON batches.
* Auth via Control Plane service tokens; per‑source quotas.

### 5.2 Normalizer

* Maps incoming payloads to `TelemetryEvent`; applies **schema versioning** and **redaction**.
* Enrichment: attach `tenant`, `region`, `bundleVersion`, `dialectProfileId` from Control Plane cache.
* Dedup: idempotency key `(traceId, spanId)`.

---

## 6. Stream Processing

* Backing broker adapter (Kafka or NATS JetStream).
* Sliding/tumbling windows for anomaly detection (1s, 10s, 60s).
* Reorder tolerance: 5s; watermark algorithm for out‑of‑order.

---

## 7. Causal Graph Builder (`@nublox/sqlx-causal`)

### 7.1 Model

```ts
export interface CausalNode { id: string; ts: number; kind: EventKind; ref?: string /* irId/planId */; attrs?: Record<string, unknown> }
export interface CausalEdge { id: string; from: string; to: string; rel: 'causes'|'results_in'|'degrades'|'improves'|'same_trace'|'depends_on'; weight?: number }
```

* Build edges using: `trace linkage`, `temporal proximity`, `IR/HKG dependencies`, and **policy decisions**.
* Maintain vector clocks per node origin; resolve partial orders.

### 7.2 Persistence

* Columnar node/edge tables for hot queries; compressed adjacency per node.
* TTL for transient nodes (7d default); policy/deploy/audit kept 90d.

---

## 8. Anomaly DNA

### 8.1 Objectives

* Detect recurrent failure/perf signatures (e.g., "index dropped", "cross‑region lag", "N+1 includes").

### 8.2 Methods

* Pattern mining (`seq2pat`) over Causal Graph windows.
* Classifiers: gradient boosted trees on feature vector `{ delta_p95, cache_hit_drop, lock_wait_ms, replication_lag_ms, topk_entities, policy_denials }`.
* Similarity clustering via embeddings of narrative seeds.

### 8.3 Output

```ts
export interface Anomaly {
  id: string; class: 'perf'|'reliability'|'security'|'policy';
  score: number; // 0..1
  features: Record<string, number|string>;
  culprit?: { entity?: string; index?: string; policyRuleId?: string };
}
```

---

## 9. Narrative Engine

### 9.1 Requirements

* Deterministic, concise human‑readable summaries with optional LLM augmentation.
* **Latency** p95 ≤ 200 ms from anomaly detection.

### 9.2 Template System

* Handwritten templates with placeholders for key metrics and entities.
* Language: Markdown fragments for Console rendering.

### 9.3 Optional LLM Augmentation

* Input: `(Causal subgraph, top features, prior incidents)`.
* Guardrails: length limit, style, **no PII**.
* Fallback to templates on timeout.

### 9.4 Examples

* *"Read latency +32% (p95 180→238 ms) after deploy `api@1.14.2`. Cause: dropped `idx_orders_ts`. Fix: recreate composite `(created_at,status)`; expected gain 25–35%."*
* *"Policy denials +210% for `endpoint:/api/users` in region `eu-west-2` post policy `eu-pii-mask`. Consider cache of decision or scope rule."*

---

## 10. FinOps Engine

### 10.1 Cost Model

* Per event: compute resource cost (CPU sec, IO bytes, egress GB) × regional cloud rates.
* Attribution dimensions: `service`, `entity`, `tenant`, `region`, `env`, `bundleVersion`.

### 10.2 Rollups & Budgets

* Rolling 1m/5m/1h windows; daily budgets with alerts.
* Exporters to billing backends (BigQuery/S3/CSV).

---

## 11. Storage & Indexing

* **Hot store:** columnar (Arrow/Parquet) for events; LSM KV for indexes.
* **Graph store:** adjacency with varint encoding; query by `traceId`, `irId`, `entity`.
* **Retention:** 7d hot, 30–90d warm (object storage), cold export beyond.

---

## 12. Public APIs

```ts
export interface ObserveQueryApi {
  getTrace(traceId: string): Promise<{ events: TelemetryEvent[]; causal: { nodes: CausalNode[]; edges: CausalEdge[] } }>;
  searchEvents(filter: Partial<TelemetryEvent> & { tsFrom?: number; tsTo?: number }): Promise<TelemetryEvent[]>;
  topAnomalies(window: '1m'|'10m'|'1h', k?: number): Promise<Anomaly[]>;
  narratives(filter: { entity?: string; region?: string; since?: number }): Promise<string[]>; // markdown fragments
  finopsRollup(dim: 'entity'|'tenant'|'region', window: '1h'|'24h'): Promise<Array<{ key: string; costUsd: number }>>;
}
```

---

## 13. Integration Points

| Component         | Integration                                                        |
| ----------------- | ------------------------------------------------------------------ |
| **Helix Core**    | Consumes narratives for reinforcement; emits query/plan events.    |
| **Control Plane** | Uses anomalies to suggest policy changes; consumes FinOps rollups. |
| **ORM**           | Surfaces advice in developers' CLI; emits builder diagnostics.     |
| **API Gateway**   | Exposes SLOs; forwards request spans and policy decisions.         |

---

## 14. Security & Privacy

* **PII Safe:** redaction at Normalizer; fields never leave secure boundary.
* **AuthZ:** token‑guarded APIs; RBAC for narratives/finops queries.
* **Tamper‑evidence:** forward append to Tamper Audit Graph for critical events.

---

## 15. Performance & Sizing Targets

* Single region: 50k events/s sustained, burst 200k/s; 3× replication factor optional.
* Causal graph build ≤ 5 ms/event p95; narrative generation ≤ 200 ms p95; kNN anomaly search ≤ 20 ms.

---

## 16. Configuration

```yaml
observe:
  ingest:
    otel: { http: 4318, grpc: 4317 }
    auth: control-plane
  stream:
    broker: nats
    windowMs: [1000, 10000, 60000]
  retention:
    hotDays: 7
    warmDays: 30
  finops:
    region: eu-west-2
    rates: { cpuPerSecUsd: 0.00002, ioPerGbUsd: 0.09, egressPerGbUsd: 0.12 }
```

---

## 17. Testing Strategy

### 17.1 Unit

* Schema mapping, redaction filters, anomaly feature extraction, narrative templates.

### 17.2 Integration

* End‑to‑end ingest → narrative generation; validate causal linkage against synthetic incidents.

### 17.3 Performance

* Load generator simulating 50k events/s; verify p95 SLAs; broker backpressure behavior.

### 17.4 Accuracy

* Classifier evaluation on labeled corpus; track precision/recall; run drift monitoring.

---

## 18. Milestones & Work Breakdown

|  Phase | Scope              | Deliverables                      | Owner    | Exit Criteria        |
| -----: | ------------------ | --------------------------------- | -------- | -------------------- |
| **P1** | Scaffold & Schemas | TS types; OTel bridge; normalizer | Observe  | build passes         |
| **P2** | Stream Processor   | broker adapter; windowing         | Observe  | window ops stable    |
| **P3** | Causal Graph       | node/edge store; vector clocks    | Causal   | lineage queries pass |
| **P4** | Anomaly DNA        | feature extractor; classifiers    | Perf     | accuracy ≥ 0.85      |
| **P5** | Narrative Engine   | templates; LLM optional           | Observe  | p95 ≤ 200 ms         |
| **P6** | FinOps Engine      | cost model; rollups; exporters    | FinOps   | error ≤ 10%          |
| **P7** | APIs               | query endpoints; authZ            | Platform | Console integration  |
| **P8** | Hardening          | perf, chaos, docs                 | All      | GA readiness         |

---

## 19. Reference Pseudocode

```ts
async function onEvent(e: TelemetryEvent) {
  const n = normalize(e);             // redact + enrich
  await stream.publish(n);
}

stream.subscribe(async (n) => {
  const nodeId = await causal.upsertNode(n);
  await causal.linkTrace(nodeId, n.traceId);
  const anomalies = anomaly.detect(n); // windowed
  if (anomalies.length) {
    const md = await narrative.render(anomalies[0]);
    await api.pushNarrative(md);
  }
  await finops.account(n);
});
```

---

## 20. Risks & Mitigations

* **Risk:** High cardinality metrics explode storage.
  **Mitigation:** tail‑based sampling + exemplar storage; bloom filtering for rare labels.
* **Risk:** LLM delays narratives.
  **Mitigation:** template‑first; LLM as optional async enhancement.
* **Risk:** Broker backpressure causes lag.
  **Mitigation:** dynamic batching; autoscale consumers; backoff + shed non‑critical logs.

---

## 21. Future Hooks (v2.1+)

* Root‑cause graph queries (counterfactuals) integrated with Helix Reasoner.
* Cross‑region incident correlation with geospatial visualization.
* Cost anomaly detection with seasonality decomposition.

---

> *From raw signals to clear stories — in time to act.*
