# API Emitter & Gateway Fabric v1.0 — Build Specification (Developer Hand‑Off)

**Subsystems:** `@nublox/sqlx-api` (Emitter, Resolvers, Schema), `@nublox/sqlx-gateway` (Edge/Gateway)
**Owners:** Data Platform — API Team; Platform — Edge/Gateway
**Status:** Ready for Implementation
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Scope

Provide an automated path from **Helix ORM metadata** to production‑grade **REST** and **GraphQL** APIs with built‑in **policy enforcement**, **caching**, and **telemetry**. The Gateway Fabric publishes, secures, and operates these APIs across regions.

**Goals:**

* Zero‑boilerplate API generation (CRUD + search + relations + aggregates) from ORM/HKG.
* Declarative composition via `.sqlxapi.yaml` manifests.
* Cognitive caching (tag‑based, plan-aware invalidation) and policy integration with Control Plane.
* One‑command publish to regional Gateways with RBAC, rate limits, and observability by default.

**Non‑Goals:** GUI consoles (Control Plane), vendor‑specific API gateways (class adapters optional later).

---

## 2. Success Criteria (Acceptance)

* **Coverage:** emit endpoints for ≥95% of ORM entities/relations used by reference apps; GraphQL schema passes SDL validation with strong types.
* **Performance:** p95 resolver latency overhead ≤ 10% vs direct Core call; cache hit rate ≥ 70% for steady‑state read traffic.
* **Security:** 100% requests pass token verification and policy evaluation (deny/mask/filter) with audit trail.
* **Operability:** Gateway exposes metrics (RPS, p50/95/99, error rates, cache hit %, policy denials) and structured logs; blue/green deploy supported.

---

## 3. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           API Emitter & Gateway                            │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. ApiEmitter (REST Router / GraphQL Schema)                                │
│ 2. Resolver Layer (Helix ORM/Core bridge)                                   │
│ 3. Policy Middleware (mask/deny/row filters; Control Plane integration)     │
│ 4. Resolver Cache (tag-based, write-through invalidation)                   │
│ 5. Gateway Publisher (deploy to edge with RBAC, rate limit, TLS)            │
│ 6. Telemetry Hooks (OTel: traces, metrics, logs)                             │
└────────────────────────────────────────────────────────────────────────────┘
```

**Dataflow**

```
ORM → ApiEmitter → (REST Router | GraphQL Schema) → Gateway → Policy → Resolver → Core → DB
                                                   ↘ Cache ↗
```

---

## 4. Public Developer Interfaces (TypeScript)

```ts
export interface ApiEmitOptions {
  basePath?: string;            // default "/api"
  include?: string[];           // entities to include
  exclude?: string[];           // entities to skip
  graphQL?: boolean;            // emit GraphQL schema
  rest?: boolean;               // emit REST router
  cacheTtlMs?: number;          // default 60_000
  policyProfile?: string;       // Control Plane profile id
  paginationDefault?: number;   // default 50
  paginationMax?: number;       // default 500
}

export interface GatewaySpec {
  id: string; region: string; baseUrl: string; tls: { certId: string };
  rbac?: { provider: 'control-plane'|'jwt'; audience?: string };
  rateLimit?: { windowMs: number; limit: number; burst?: number };
}

export interface PublishResult { url: string; version: string; }

export interface ApiComposerSpec {
  endpoints: Array<{
    name: string;                 // e.g., "topCustomers"
    entity: string;               // base ORM entity
    select?: string[];            // fields to return
    include?: string[];           // relations to include
    where?: Record<string, unknown>;
    orderBy?: Array<{ field: string; dir: 'asc'|'desc' }>;
    cacheTtl?: number;            // per-endpoint override
    policy?: string;              // policy profile override
    method?: 'GET'|'POST';        // REST only
    path?: string;                // REST path override
  }>;
}

export interface ApiEmitter {
  emitRest(orm: OrmClient, opts?: ApiEmitOptions): Promise<Router>;
  emitGraphql(orm: OrmClient, opts?: ApiEmitOptions): Promise<GraphQLSchema>;
  compose(spec: ApiComposerSpec): Promise<Router|GraphQLSchema>;
}

export interface GatewayPublisher {
  publish(router: Router|GraphQLSchema, gw: GatewaySpec): Promise<PublishResult>;
}
```

---

## 5. REST Surface (Default)

```
GET    /api/<entity>                 # list (pagination)
GET    /api/<entity>/:id             # read by id
POST   /api/<entity>                 # create
PATCH  /api/<entity>/:id             # update partial
DELETE /api/<entity>/:id             # delete
GET    /api/<entity>/search          # search with q=... (simple syntax)
```

* **Query Parameters:** `limit`, `offset`, `orderBy`, `include`, `fields`, and `filter` (JSON encoded when complex).
* **Errors:** consistent JSON error envelope with `code`, `message`, `traceId`.

---

## 6. GraphQL Surface (Default)

### 6.1 Types & Operations

* Types per entity, relations mapped via `include` metadata.
* Queries: list + byId; Mutations: create/update/delete with input types.

Example (condensed):

```graphql
type Order { id: ID!, total: Float!, status: String!, customer: Customer! }

type Query {
  orders(limit: Int, offset: Int, orderBy: [OrderOrder!], where: OrderWhere): [Order!]!
  order(id: ID!): Order
}

type Mutation {
  createOrder(input: OrderInput!): Order!
  updateOrder(id: ID!, input: OrderPartial!): Order!
  deleteOrder(id: ID!): Boolean!
}
```

### 6.2 GraphQL Directives (Policy/Caching)

* `@policy(profile: String)` — override policy profile.
* `@cache(ttlMs: Int)` — override resolver cache TTL.

---

## 7. Resolver Layer

### 7.1 Responsibilities

* Translate incoming request → ORM QuerySpec → IR → Core execution.
* Attach policy filters/masks pre‑IR (via Control Plane rules).
* Apply caching (read‑through) and invalidation (write/DDL hooks).

### 7.2 Pseudocode

```ts
async function resolveList(entity: string, args: QueryArgs, ctx: Ctx) {
  const spec = composeSpec(args);                // where/order/include
  const masked = await applyPolicy(spec, ctx);   // row filters & field masks
  const cacheKey = makeKey(entity, masked);
  const cached = await cache.get(cacheKey);
  if (cached) return cached;
  const rows = await orm.query(entity, masked);
  await cache.set(cacheKey, rows, ttlFor(entity));
  return rows;
}
```

---

## 8. Policy Middleware (Control Plane Integration)

* **Token Verification:** JWT/OAuth2 via Control Plane; audience + issuer enforced.
* **RBAC:** roles resolved to **policy rules** (`allow`/`deny`/`mask`/`filter`).
* **PII Masking:** declarative functions (e.g., `mask_email`, `mask_phone`) applied at projection time.
* **Row‑Level Security:** tenant/region filters injected into QuerySpec.
* **Audit:** every decision produces an event with rule id and effect.

**Policy Rule Example**

```json
{ "id":"eu-pii-mask", "target":"column:users.email", "action":"mask", "condition":"region != 'EU'" }
```

---

## 9. Resolver Cache

### 9.1 Keys & Tags

* **Key:** hash(entity + normalized where/order/include + fields).
* **Tags:** `entity:<name>`, `entity:<name>:id:<id>`, custom manifest tags.

### 9.2 Invalidation

* On write (insert/update/delete) → invalidate entity tag and id tag(s).
* On DDL (schema drift) → invalidate entity tag + regenerate router/schema.

### 9.3 Storage Options

* In‑memory LRU (dev) and Redis/Memcached (prod) adapters.
* Configurable TTL per entity + global default.

---

## 10. Pagination, Filtering, and Sorting

* **Pagination:** `limit`/`offset`, with `default` and `max` from `ApiEmitOptions`.
* **Cursor‑based pagination** (optional): stable ordering fields required; emit `pageInfo { endCursor, hasNextPage }`.
* **Filtering:** allow structured filters (operators `$eq,$ne,$gt,$gte,$lt,$lte,$in,$like`).
* **Sorting:** validate order fields against schema; multi‑field order supported.

---

## 11. Error Model & Envelopes

```json
{
  "error": {
    "code": "POLICY_DENIED|BAD_REQUEST|NOT_FOUND|RATE_LIMIT|INTERNAL",
    "message": "…",
    "traceId": "…"
  }
}
```

* Map internal errors (`SqlxError`) to public codes; never leak SQL or secrets.

---

## 12. Gateway Publisher

### 12.1 Deploy Flow

```
Router/Schema → Package (bundle) → Sign → Upload → Activate (blue/green) → Health Check → Switch
```

### 12.2 Runtime Features

* TLS termination; HTTP/2 and HTTP/3 (QUIC) optional.
* Rate limiting: token bucket per API key/subject.
* Request/response compression.
* Static asset for GraphQL Playground (dev only, off in prod).

### 12.3 RBAC & Secrets

* API keys/JWT integration via Control Plane; no secrets in bundle.

---

## 13. Telemetry & Observability

* **Traces:** span per request with `api.entity`, `api.operation`, `cache.hit`, `policy.decision`.
* **Metrics:** RPS, latency histograms, cache hit %, rate limit rejects, policy denials.
* **Logs:** structured JSON; redacted inputs; correlation with `traceId`.

---

## 14. Configuration

```yaml
api:
  basePath: /api
  rest: true
  graphQL: true
  cacheTtlMs: 60000
  pagination: { default: 50, max: 500 }
  policyProfile: default
  gateway:
    region: eu-west-2
    rateLimit: { windowMs: 60000, limit: 6000, burst: 12000 }
```

---

## 15. Testing Strategy

### 15.1 Unit

* Router generation from ORM metadata; GraphQL SDL snapshots; policy middleware decisions; cache key/tag behavior.

### 15.2 Integration

* E2E: emit → publish → call REST/GraphQL; validate rows vs reference SQL; verify policy masking and denials.

### 15.3 Performance

* Load test with 95/5 read/write mix; ensure p95 overhead ≤ 10%; measure cache hit ≥ 70% steady state.

### 15.4 Security

* Fuzz request parameters; enforce allowed fields; verify no SQL in error payloads.

---

## 16. Milestones & Work Breakdown

|  Phase | Scope             | Deliverables                               | Owner    | Exit Criteria               |
| -----: | ----------------- | ------------------------------------------ | -------- | --------------------------- |
| **P1** | Scaffold & Types  | Emitter interfaces; Router/Schema skeleton | API      | build passes                |
| **P2** | REST Emitter      | CRUD/search routes; validators             | API      | routes live in dev          |
| **P3** | GraphQL Emitter   | SDL + resolvers; directives                | API      | SDL validates; queries work |
| **P4** | Policy Middleware | Control Plane client; masks/filters        | Platform | policy tests pass           |
| **P5** | Resolver Cache    | tag keys; invalidation on write/DDL        | Perf     | hit rate ≥70%               |
| **P6** | Gateway Publisher | bundle/sign/activate; RBAC/rate limit      | Edge     | publish to staging          |
| **P7** | Telemetry         | traces/metrics/logs wired                  | Observe  | dashboards show data        |
| **P8** | Hardening         | perf, fuzz, docs                           | All      | GA readiness                |

---

## 17. Reference Pseudocode

```ts
export async function emitRest(orm: OrmClient, opts: ApiEmitOptions) {
  const router = new Router(opts.basePath ?? '/api');
  for (const entity of selectEntities(orm, opts)) {
    router.get(`/${entity}`, ctx => resolveList(entity, parseArgs(ctx), ctx));
    router.get(`/${entity}/:id`, ctx => resolveById(entity, ctx.params.id, ctx));
    router.post(`/${entity}`, ctx => resolveCreate(entity, ctx));
    router.patch(`/${entity}/:id`, ctx => resolveUpdate(entity, ctx.params.id, ctx));
    router.delete(`/${entity}/:id`, ctx => resolveDelete(entity, ctx.params.id, ctx));
  }
  return router.use(policyMiddleware(opts.policyProfile)).use(cacheMiddleware());
}
```

---

## 18. Risks & Mitigations

* **Risk:** Over‑broad includes generate heavy joins.
  **Mitigation:** enforce include depth; offer `fields` projection; advice warnings.
* **Risk:** Cache inconsistency after complex writes.
  **Mitigation:** tag invalidation + DDL hooks; optional transactional cache.
* **Risk:** Policy latency at scale.
  **Mitigation:** local decision cache with TTL; push‑based policy updates.

---

## 19. Future Hooks (v1.1+)

* WebSockets/GraphQL subscriptions with change data capture (CDC) integration.
* Edge caching hints from Helix Simulation (predictive cache pre‑warm).
* Multi‑gateway canary rollout with automatic rollback on error budgets.

---

> *Schema in, production API out — secured, cached, and observable by default.*
