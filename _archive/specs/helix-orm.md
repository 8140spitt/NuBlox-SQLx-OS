# Helix ORM v2.0 — Build Specification (Developer Hand‑Off)

**Subsystem:** `@nublox/sqlx-orm`
**Owners:** Data Platform — ORM Team
**Status:** Ready for Implementation
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Scope

Implement **Helix ORM v2.0**, a self‑generating, dialect‑agnostic ORM that:

* Introspects live databases through FLR/IR/HKG and **materializes models automatically**.
* Provides a **fluent, type‑safe query builder** compiled to IR → SQL via Helix Core.
* **Synchronizes** models/types with schema drift in near‑real‑time.
* Emits **multi‑language SDKs** (TypeScript, Go, Python, Rust) with strong types.
* Exposes **advice hooks** (indexes, query shape, caching) powered by Observability + IR embeddings.

**Out of scope:** Admin GUIs, visual schema editors (Control Plane Console), cross‑DB 2PC (future), full migration DSL (basic guided migrations included).

---

## 2. Success Criteria (Acceptance)

* **Type Safety:** TS client has full generics on entity fields and relations; compile‑time errors for invalid columns/filters.
* **Parity:** Query builder can express ≥ 95% of read/write operations used by reference apps (e‑commerce + SaaS fixtures) on PG16 + MySQL 9.
* **Sync:** Schema drift detected ≤ 2s (dev) / ≤ 30s (prod) and models regenerated without breaking types for unchanged fields.
* **Performance:** Builder → IR build ≤ 1 ms median; end‑to‑end overhead vs hand‑tuned SQL ≤ 10% p95.
* **Observability:** 100% operations emit TelemetryEvents including entity, predicate shape, and estimated cardinality.

---

## 3. Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                         Helix ORM v2.0                         │
├────────────────────────────────────────────────────────────────┤
│ 1. Introspector  (catalog → HKG)                               │
│ 2. SchemaGraphBuilder (entities/relations)                     │
│ 3. EntityModelGenerator (runtime model objects)                │
│ 4. QueryBuilder (fluent API → IR)                              │
│ 5. RelationMapper (joins, includes, eager/lazy)                │
│ 6. TypeEmitter (TS/Go/Py/Rust types + SDKs)                    │
│ 7. SyncWatcher (drift detect → regen)                          │
│ 8. AdviceEngine (index/query/cache suggestions)                │
│ 9. PolicyFilter (mask/deny based on Control Plane rules)       │
└────────────────────────────────────────────────────────────────┘
```

**Dataflow**

```
Catalog → HKG → SchemaGraph → EntityModels → QueryBuilder → IR → Helix Core (simulate/exec)
```

---

## 4. Public Developer API (TypeScript)

```ts
export interface OrmInitOptions {
  url: string;                 // DSN
  dialect?: 'postgres'|'mysql'|string; // optional hint
  emitTypes?: boolean;         // write types to /generated
  syncIntervalMs?: number;     // default 30000 in prod, 2000 in dev
  policyProfile?: string;      // Control Plane policy id
}

export interface IncludeSpec {
  path: string;                // e.g., 'orders.items.product'
  select?: string[];           // fields to project on included entity
  where?: Record<string, unknown>;
}

export interface QuerySpec<TFilter = Record<string, unknown>> {
  where?: TFilter;
  orderBy?: Array<{ field: string; dir: 'asc'|'desc' }>;
  limit?: number; offset?: number;
  include?: IncludeSpec[];
  advise?: Array<'predictive-index'|'cache'|'pagination'|'partition'>;
}

export interface OrmClient {
  entity<T = any>(name: string): OrmEntity<T>;
  query<T = any>(name: string, spec?: QuerySpec): Promise<T[]>;
  insert<T = any>(name: string, data: Partial<T>): Promise<T>;
  update<T = any>(name: string, id: unknown, data: Partial<T>): Promise<T>;
  delete(name: string, id: unknown): Promise<void>;
  transaction<T>(fn: (tx: OrmClient) => Promise<T>): Promise<T>;
  advise(entity: string, spec?: QuerySpec): Promise<Advice[]>;
}

export interface OrmEntity<T = any> {
  where(filter: Record<string, unknown>): OrmEntity<T>;
  include(path: string|IncludeSpec): OrmEntity<T>;
  select(fields: string[]): OrmEntity<T>;
  orderBy(field: string, dir?: 'asc'|'desc'): OrmEntity<T>;
  limit(n: number): OrmEntity<T>;
  offset(n: number): OrmEntity<T>;
  advise(kind?: QuerySpec['advise'][number]): Promise<Advice[]>;
  toIR(): Promise<IRNode>; // materialize IR for simulation/debug
  run<T = T[]>(): Promise<T>;
}

export interface Advice {
  kind: 'index'|'query_shape'|'cache'|'partition'|'pagination';
  message: string;
  meta?: Record<string, unknown>;
}
```

---

## 5. Introspection & Schema Graph

### 5.1 Introspector

* Uses Helix Core + HKG to read catalog (tables, columns, PK/FK, indexes, views).
* Emits `HkgNode`/`HkgEdge` entries and caches checksum per entity.

### 5.2 SchemaGraphBuilder

* Builds an in‑memory graph with nodes: `Entity`, `Field`, `Relation` (1:1, 1:n, n:n via junction detection).
* Detects **semantic column roles** (email, currency, pii) using heuristics + HKG annotations; tags persisted for PolicyFilter.

### 5.3 EntityModelGenerator

* Produces runtime model objects with metadata and validation (nullability, default, enum domain).
* Registers **resolvers** for relations and **eager/lazy** fetch strategies.

---

## 6. Query Builder → IR Compilation

### 6.1 Builder Semantics

* Fluent API builds a declarative tree (no execution until `.run()` or `.toIR()`).
* **Includes** compile to deterministic join orders; circular includes rejected at compile time.
* **Predicates** normalized to DNF; params hoisted; supports raw expressions with safe placeholders.

### 6.2 IR Generation Rules

* `where` converts to structured predicates when possible; otherwise `expr` string (flagged for simulator).
* `include('a.b.c')` expands to join chain using relation metadata.
* Compound primary keys encoded as composite filter nodes.

### 6.3 Example

```ts
const db = await initOrm({ url });
const rows = await db.entity('Order')
  .where({ status: 'SHIPPED', total: { $gte: 100 } })
  .include({ path: 'customer', select: ['id','name','tier'] })
  .include('items.product')
  .orderBy('created_at','desc')
  .limit(100)
  .run();
```

Produces IR (condensed):

```json
{"kind":"dql","from":"orders","joins":[{"target":"customers","on":"orders.customer_id=customers.id","kind":"inner"},{"target":"order_items","on":"orders.id=order_items.order_id","kind":"inner"},{"target":"products","on":"order_items.product_id=products.id","kind":"inner"}],"where":{"status":"SHIPPED","total":{"$gte":100}},"orderBy":[{"field":"created_at","dir":"desc"}],"limit":100}
```

---

## 7. Sync, Drift, & Regeneration

### 7.1 SyncWatcher

* Watches HKG checksums; on change: recompute SchemaGraph → regen EntityModels → update TypeEmitter outputs.
* In dev: hot‑reload models; in prod: versioned models with compatibility mapping.

### 7.2 Compatibility

* Non‑breaking changes (add column, add nullable field) → auto type extension.
* Breaking (drop/rename/constraint change) → raise a **DriftWarning** with migration recipe and optional code‑mod hints.

---

## 8. Type Emission & SDK Fabric

* Targets: **TypeScript**, **Go**, **Python**, **Rust**.
* Output location: `./generated/<lang>/` with per‑entity clients and shared types.
* **Versioning:** semantic version bump on breaking schema changes; emit `CHANGELOG.md` with diff.

Example TS type:

```ts
export interface Order { id: string; total: number; status: 'NEW'|'PAID'|'SHIPPED'|'CANCELLED'; customer_id: string; created_at: string }
```

---

## 9. Advice Engine (Predictive)

* Consumes Observability events + IR embeddings → suggests:

  * **Indexes** (missing composite, prefix length for MySQL, partial for PG).
  * **Query shape** rewrites (move filter to join side, avoid SELECT * ).
  * **Caching** hints (entity/where tag key recommendations).
  * **Partitioning** (time/range hash based on cardinality drift).
* Output: `Advice[]` with `message` and `meta` (estimated gain, p95 impact).

---

## 10. Policy Filter (Compliance & Masking)

* Before `.toIR()`/`.run()`, apply Control Plane rules:

  * **Field masking** (replace projection with deterministic mask function).
  * **Row‑level filters** (inject tenant/region predicates).
  * **Denials** (block operation + raise policy error with remediation link).

---

## 11. Transactions & Concurrency

* Delegates to Helix Core ExecutionManager.
* `.transaction(fn)` provides scoped client tied to the same connection + isolation.
* **Optimistic concurrency** helpers via version columns (`_version`) and ETag‑like semantics.

---

## 12. Configuration

```yaml
orm:
  syncIntervalMs: 30000
  emitTypes: true
  sdkTargets: ["ts","go","py","rs"]
  advise: { enabled: true, minConfidence: 0.7 }
  policyProfile: default
```

---

## 13. Testing Strategy

### 13.1 Unit

* Relation expansion, predicate normalization, include cycles detection, type emission snapshots.

### 13.2 Integration

* Docker PG + MySQL; run introspection → graph build → queries; validate rows vs reference SQL.

### 13.3 Golden

* Snapshot generated SQL for common patterns; snapshot generated types/SDKs per fixture.

### 13.4 Performance

* Measure builder overhead and end‑to‑end p95 vs hand SQL; ensure ≤10% overhead.

---

## 14. Milestones & Work Breakdown

|   Phase | Scope            | Deliverables                     | Owner    | Exit Criteria        |
| ------: | ---------------- | -------------------------------- | -------- | -------------------- |
|  **P1** | Scaffold & Types | package, public API, error model | ORM      | build passes         |
|  **P2** | Introspector     | catalog → HKG + checksums        | ORM      | entities detected    |
|  **P3** | SchemaGraph      | relations, roles, validation     | ORM      | graph tests pass     |
|  **P4** | Entity Models    | runtime objects + resolvers      | ORM      | CRUD E2E works       |
|  **P5** | Query Builder    | fluent API → IR                  | ORM      | goldens stable       |
|  **P6** | TypeEmitter      | TS/Go/Py/Rust SDKs               | SDK      | types compile        |
|  **P7** | SyncWatcher      | drift detect + regen             | ORM      | hot reload in dev    |
|  **P8** | AdviceEngine     | index/query/cache hints          | Perf     | advice accuracy ≥70% |
|  **P9** | PolicyFilter     | masking/deny/row filters         | Platform | policy tests pass    |
| **P10** | Hardening        | perf/chaos/docs                  | All      | GA readiness         |

---

## 15. Pseudocode (Reference)

```ts
export async function query(name: string, spec: QuerySpec = {}) {
  const entity = models.get(name);
  const plan = compile(entity, spec);       // includes → joins, normalize predicates
  const ir = toIR(plan);                     // build IRSelect
  const irMasked = await applyPolicy(ir);    // mask/deny/row filters
  const sim = await core.simulate(irMasked); // get cost model
  const res = await core.execute(irMasked);  // run
  telemetry.emit({ type: 'query', attrs: { entity: name, planId: res.planId } });
  return res.rows as any[];
}
```

---

## 16. Risks & Mitigations

* **Risk:** Hot‑reload races during drift.
  **Mitigation:** versioned models + readers see consistent snapshot; swap on quiescent boundary.
* **Risk:** Over‑eager includes → heavy joins.
  **Mitigation:** cost‑aware include advisor + soft caps with override.
* **Risk:** SDK type churn in CI.
  **Mitigation:** semantic diff + changelog, PR guard rails.

---

## 17. Future Hooks (v2.1+)

* **NL → Builder** helpers (CII) for plain‑English queries with confirmable IR preview.
* **Offline codegen** for edge runtimes (WASM SDK).
* **Materialized view advisor** integrated with Control Plane migrations.

---

> *Models that learn, queries that teach.*
