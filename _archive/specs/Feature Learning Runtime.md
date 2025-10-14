# Intermediate Representation (IR) & Knowledge Graph v2.0 — Build Specification (Developer Hand‑Off + Cognitive Annotations)

**Subsystems:** `@nublox/sqlx-core/ir`, `@nublox/sqlx-core/hkg`, `@nublox/sqlx-embeddings`
**Owners:** Core Platform — IR/Graph Team; Applied AI — Embeddings/Reasoner
**Status:** Ready for Implementation
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Non‑Goals

**Purpose.** Define the canonical, dialect‑neutral **Intermediate Representation (IR)** and the **Helix Knowledge Graph (HKG)** that together capture *query intent*, *schema semantics*, and *causal relationships*—enabling simulation, optimization, governance, and AI reasoning across SQLx OS.

**Non‑Goals.**

* SQL parser for natural language (handled upstream by CII).
* Full EXPLAIN/PLAN adapters (consumed as hints; not required to construct IR).
* Graph visualization UI (Control Plane Console responsibility).

---

## 2. Success Criteria (Acceptance)

* **Determinism:** Same input (AST or ORM call) → same normalized IR hash (`irId`) regardless of whitespace or field order.
* **Completeness:** IR covers DDL/DML/DQL/TCL constructs required by Helix Core v2.0 for PG16 & MySQL 9 parity.
* **Causality:** Every IR node links to affected schema objects (tables, columns, indexes) in HKG.
* **Performance:** IR build+normalize ≤ **1 ms** median; HKG writes ≤ **2 ms** median (local store).
* **Testability:** Goldens for IR JSON & hash; round‑trip serde (json → ts → json) lossless.

---

## 3. Domain Model — Concepts

| Concept        | Role                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| **IR Node**    | Canonical, typed representation of an operation (DQL/DML/DDL/TCL).                       |
| **IR Edge**    | Typed relation between IR nodes and schema objects (e.g., `affects`, `reads`, `writes`). |
| **HKG Entity** | Persistent semantic node (Table, Column, Index, Constraint, View, Policy).               |
| **Embedding**  | Vector representation of IR/HKG nodes for similarity and analogical reasoning.           |
| **Lineage**    | Provenance path linking operations to outcomes and artifacts.                            |

---

## 4. IR Schema (JSON‑first, TS‑strong)

### 4.1 Core Types

```ts
export type IRKind = 'dql' | 'dml' | 'ddl' | 'tcl';
export type JoinKind = 'inner' | 'left' | 'right' | 'full' | 'cross';
export type MutationKind = 'insert' | 'update' | 'delete' | 'upsert';

export interface IRBase {
  irId: string;                 // sha256 of normalized IR
  kind: IRKind;
  source: 'sql' | 'orm' | 'api' | 'nl' | 'system';
  tenant?: string;              // multi‑tenant boundary
  env?: 'dev'|'staging'|'prod';
  tags?: string[];              // freeform labels
  createdAt: number;            // epoch ms
  meta?: Record<string, unknown>;// e.g., embeddings, confidence
}

export interface IRSelect extends IRBase {
  kind: 'dql';
  from: string;                 // base entity/table
  fields: Array<string | { expr: string; alias?: string }>;
  joins?: Array<{ target: string; on?: string; kind: JoinKind }>;
  where?: Record<string, unknown> | string; // structured or raw predicate expr
  groupBy?: string[];
  having?: string | Record<string, unknown>;
  orderBy?: Array<{ field: string; dir: 'asc'|'desc' }>;
  limit?: number; offset?: number;
}

export interface IRMutation extends IRBase {
  kind: 'dml';
  op: MutationKind;
  target: string;                // table
  values?: Record<string, unknown>; // for insert/update/upsert
  where?: Record<string, unknown> | string; // for update/delete
  returning?: string[];          // db‑specific, synthesized later if unsupported
}

export interface IRDdl extends IRBase {
  kind: 'ddl';
  action: 'create_table'|'alter_table'|'drop_table'|'create_index'|'drop_index'|'add_column'|'drop_column'|'add_constraint'|'drop_constraint'|'create_view'|'drop_view';
  object: { name: string; type: 'table'|'index'|'view'|'constraint'|'column' };
  spec?: Record<string, unknown>; // engine‑neutral specification
}

export interface IRTx extends IRBase {
  kind: 'tcl'; action: 'begin'|'commit'|'rollback'|'savepoint'|'release'; name?: string;
}

export type IRNode = IRSelect | IRMutation | IRDdl | IRTx;
```

### 4.2 Normalization Rules (Canonicalization)

* **Field ordering:** lexicographic by key; arrays deterministically sorted unless order is semantic (`orderBy`, `groupBy`).
* **Predicates:** transform `where` trees to DNF; hoist literals to `params[]` with stable indices; case‑fold identifiers where dialect‑invariant.
* **Joins:** normalize to explicit `on` expressions; collapse duplicates; ensure `JoinKind` explicit.
* **Hash:** `irId = sha256(JSON.stringify(NormalizedIR))` using stable stringify (no spacing, sorted keys).

### 4.3 Examples (Golden)

```json
{
  "irId": "sha256:...",
  "kind": "dql",
  "source": "orm",
  "from": "orders",
  "fields": ["id","total","customer_id"],
  "joins": [{"target":"customers","on":"orders.customer_id=customers.id","kind":"inner"}],
  "where": {"status":"SHIPPED"},
  "orderBy": [{"field":"created_at","dir":"desc"}],
  "limit": 100,
  "createdAt": 1739480000
}
```

---

## 5. Helix Knowledge Graph (HKG)

### 5.1 Entity Types

```ts
export type HkgType = 'Table'|'Column'|'Index'|'Constraint'|'View'|'Policy'|'Query'|'Txn'|'Migration';

export interface HkgNodeBase { id: string; type: HkgType; name?: string; attrs?: Record<string, unknown>; }
export interface HkgEdge { id: string; from: string; to: string; rel: string; attrs?: Record<string, unknown>; }
```

**Required Relations**

* `(Query:IRNode) -[reads]-> (Table|View)`
* `(Query:IRNode) -[writes]-> (Table|Column)`
* `(DDL) -[affects]-> (Table|Index|Column|Constraint|View)`
* `(Column) -[in_table]-> (Table)`
* `(Index) -[optimizes]-> (Query)` (added post‑analysis)
* `(Policy) -[guards]-> (Table|Column|Endpoint)`

### 5.2 Lineage & Causality

* Every **TelemetryEvent** creates/updates edges for `causes`, `results_in`, `degrades`, `improves`.
* Causal DAG maintained with vector clock metadata (`logicalTs`, `nodeId`).

---

## 6. Embedding Pipeline (Similarity & Analogy)

### 6.1 Objectives

* Enable **near‑neighbor retrieval** of similar queries and schemas for plan reuse and advice.
* Provide **semantic contexts** for LLM Gateway and Helix Reasoner.

### 6.2 Feature Extraction → Embedding

```
IRNode → FeatureVector (one‑hot + numeric) → Dimensionality Mapper → Embedding (float32[N])
```

**FeatureVector (illustrative)**

* categorical: `dialect`, `join_pattern`, `predicate_shape`
* numeric: `field_count`, `join_count`, `estimated_cardinality_bucket`
* flags: `has_window`, `has_cte`, `has_json`

**Mapper**: start with PCA/autoencoder; pluggable for future models.
**Index**: HNSW or IVF‑PQ (local); API returns `k` nearest with cosine distance.

### 6.3 Storage

* `EmbeddingsStore` columnar file per tenant/env (`.arrow`/`.parquet`); in‑memory LRU for hot set.
* Write‑through on IR persist; compaction nightly.

---

## 7. Persistence & Indexing

### 7.1 IR Store

* Append‑only log + keyspace (`irId` → IR JSON).
* Secondary indexes: `kind`, `from`, `target`, `tags[]`, `createdAt`.

### 7.2 HKG Store

* Node/edge tables (KV/columnar) with **schema‑first** IDs: `node:<type>:<name|hash>`.
* Edge fan‑out lists per node with compressed adjacency (varint).

### 7.3 Transactions

* IR/HKG writes occur inside ExecutionManager’s tx when available; otherwise atomic batch with WAL.

---

## 8. Public APIs (TS)

```ts
export interface IRService {
  build(input: string | any /* AST */): Promise<IRNode>; // parse + normalize
  hash(ir: IRNode): string;
  persist(ir: IRNode): Promise<void>;
  link(ir: IRNode, touched: { reads?: string[]; writes?: string[]; affects?: string[] }): Promise<void>;
  findSimilar(ir: IRNode, k?: number): Promise<Array<{ irId: string; score: number }>>;
}

export interface HkgService {
  upsertNode(node: HkgNodeBase): Promise<string>; // returns id
  upsertEdge(edge: HkgEdge): Promise<string>;
  neighbors(id: string, rel?: string): Promise<HkgNodeBase[]>;
  lineage(nodeId: string, depth?: number): Promise<{ nodes: HkgNodeBase[]; edges: HkgEdge[] }>;
  diff(envA: string, envB: string): Promise<{ added: HkgNodeBase[]; removed: HkgNodeBase[]; changed: HkgEdge[] }>;
}

export interface EmbeddingsService {
  vectorize(ir: IRNode): Promise<Float32Array>;
  kNearest(vec: Float32Array, k: number): Promise<Array<{ id: string; score: number }>>;
}
```

---

## 9. Drift Detection & Impact Analysis

### 9.1 Schema Drift

```
HKG(env:prod) ⊖ HKG(env:staging) → ΔNodes, ΔEdges → Severity Score → Advisory
```

Severity uses: affected entities × dependency depth × historical incident weight.

### 9.2 Query Impact Simulation

* For each `DDL` IR, enumerate dependent `Query` nodes; enqueue simulations to estimate regression risk; produce **Causal Narrative**.

---

## 10. Integration Points

| Consumer          | Usage                                                             |
| ----------------- | ----------------------------------------------------------------- |
| **Helix Core**    | build/simulate/execute; plan reuse via `findSimilar()`            |
| **Helix ORM**     | generate models/relations from HKG graph                          |
| **API Emitter**   | endpoint schemas from HKG; policy constraints from `Policy` nodes |
| **Control Plane** | drift diff, policy graph, fleet analytics                         |
| **Observe**       | causal narratives, anomaly DNA linking                            |
| **LLM Gateway**   | context windows from IR/HKG + embeddings                          |

---

## 11. Configuration & Footprint

```yaml
ir:
  store: file   # file | sqlite | custom adapter
  path: ~/.sqlx/ir
hkg:
  store: file
  path: ~/.sqlx/hkg
embeddings:
  index: hnsw
  dim: 64
  lruItems: 10000
```

Resource targets (developer laptop): IR write ≤2ms, HKG upsert ≤3ms, kNN@10 ≤5ms.

---

## 12. Testing Strategy

### 12.1 Unit

* Normalization invariants, hash stability, DNF predicate transformation, join normalization.

### 12.2 Golden

* `/tests/golden/ir/*.json` fixtures with canonical hashes; PRs changing hashes require approval.

### 12.3 Integration

* Ingest synthetic schemas; run ORM queries; validate HKG edges and lineage.

### 12.4 Performance

* Microbench IR/HKG/Embeddings against SLOs; report p50/p95/p99.

---

## 13. Milestones & Work Breakdown

|  Phase | Scope          | Deliverables               | Owner    | Exit Criteria   |
| -----: | -------------- | -------------------------- | -------- | --------------- |
| **P1** | Schema & Types | TS interfaces + normalizer | IR       | build+unit pass |
| **P2** | IR Store       | append‑only + indexes      | IR       | 1ms build SLO   |
| **P3** | HKG Store      | node/edge upsert + queries | Graph    | lineage works   |
| **P4** | Embeddings     | vectorizer + kNN           | AI       | kNN@10 ≤5ms     |
| **P5** | Diff & Drift   | env diff + severity score  | Graph    | alerts produced |
| **P6** | Integration    | Core/ORM/API wiring        | Platform | end‑to‑end demo |
| **P7** | Hardening      | goldens, docs, chaos       | All      | GA readiness    |

---

## 14. Cognitive Annotations (for Applied AI)

* **Analogy‑First Optimization:** `findSimilar(ir)` precedes fresh simulation for warm start; attach candidate plan priors to Helix bandit.
* **Semantic Paraphrase Map:** group IR nodes by embedding neighborhood; expose centroid exemplars to LLM Gateway for natural explanations ("This query resembles these optimized cases → index advice").
* **Policy Semantics:** convert `Policy` nodes into constraint templates usable by CLP engine; add counters for violation frequency → *adaptive RBAC tightening*.
* **Narrative Seeds:** store short human summaries alongside IR/HKG nodes for deterministic LLM output scaffolding.

---

## 15. Reference Pseudocode

```ts
export async function build(input: string|AST): Promise<IRNode> {
  const ast = typeof input === 'string' ? parseSql(input) : input;
  const ir = normalize(ast); // order, DNF, params
  ir.irId = stableHash(ir);
  await IRStore.put(ir);
  await Hkg.linkFromIR(ir); // reads/writes/affects edges
  const vec = await Embeddings.vectorize(ir);
  await Embeddings.index(ir.irId, vec);
  return ir;
}

export async function linkFromIR(ir: IRNode) {
  // infer touched objects (simple heuristic + catalog lookup)
  const touched = inferTouched(ir);
  for (const t of touched.reads) await upsertEdge(edge(ir.irId, t, 'reads'));
  for (const t of touched.writes) await upsertEdge(edge(ir.irId, t, 'writes'));
}
```

---

## 16. Risks & Mitigations

* **Risk:** IR over‑generalizes edge cases (e.g., vendor‑specific JSON ops).
  **Mitigation:** use `meta.vendorHints`; allow dialect synthesizer to down‑cast.
* **Risk:** Embedding drift → unstable neighborhoods.
  **Mitigation:** versioned mappers; offline recalibration; neighborhood pinning for hot queries.
* **Risk:** Graph bloat at scale.
  **Mitigation:** TTL on transient queries; compress adjacency; nightly compaction.

---

## 17. Future Hooks (v2.1+)

* Bidirectional NL↔IR explanations with reversible transforms.
* Schema concept learning (semantic column types: email, currency, pii).
* Cross‑env causal transfer (prod insights → staging simulations) via CRDTs.

---

> *IR is the language of thought for SQLx OS; HKG is its memory.*
