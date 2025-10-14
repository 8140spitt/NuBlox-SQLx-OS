# Auto-API Emitter & GraphQL Fabric Build Specification  
**Subsystem:** @nublox/sqlx-api  
**Version:** 1.0  
**Status:** Design-Approved (Q2 2026 Target)  
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Scope

`@nublox/sqlx-api` generates **REST and GraphQL APIs** directly from the live schema IR and Helix ORM metadata.  
It enables instant, policy-aware data services without manual controllers.

---

## 2. Functional Overview

| Capability | Description |
|-------------|-------------|
| **REST Generator** | Emits CRUD + search endpoints per entity with pagination and filters. |
| **GraphQL Generator** | Builds GraphQL types, queries, and mutations from ORM entities. |
| **API Composer** | Compiles declarative manifests (`.sqlxapi.yaml`) into composite endpoints. |
| **Resolver Cache** | Adaptive caching with tag-based invalidation. |
| **Policy Injection** | Enforces RBAC, region, and data masking per request. |
| **Gateway Bridge** | Publishes endpoints to Control Plane gateway. |

---

## 3. Components

```
IR/ORM → APIEmitter → (REST Router | GraphQL Schema)
                           ↓                 ↓
                      Resolver Layer   Policy & Cache
                           ↓                 ↓
                        SQLx Core ← Telemetry Events
```

---

## 4. REST Layout Example

```
/api
  /orders        GET, POST
  /orders/{id}   GET, PATCH, DELETE
  /orders/search GET ?q=...&limit=...
```

---

## 5. GraphQL Example (Generated)

```graphql
type Order {
  id: ID!
  total: Float!
  customer: Customer!
}

type Query {
  orders(limit: Int, offset: Int): [Order!]!
  order(id: ID!): Order
}

type Mutation {
  createOrder(input: OrderInput!): Order!
  updateOrder(id: ID!, input: OrderInput!): Order!
  deleteOrder(id: ID!): Boolean!
}
```

---

## 6. Core Interfaces (TypeScript)

```ts
export interface ApiEmitOptions {
  basePath?: string; // default: /api
  include?: string[]; // entities
  exclude?: string[];
  cacheTtlMs?: number;
  policyProfile?: string; // control-plane policy id
}

export async function emitRestApi(orm: OrmClient, opts?: ApiEmitOptions): Promise<any>;
export async function emitGraphqlSchema(orm: OrmClient, opts?: ApiEmitOptions): Promise<any>;

export interface ApiComposerSpec {
  endpoints: Array<{
    entity: string;
    include?: string[];
    select?: string[];
    where?: Record<string, any>;
    cacheTtl?: number;
    policy?: string;
  }>;
}

export function compileApiManifest(spec: ApiComposerSpec): any;
```

---

## 7. Implementation Tasks (Phased)

| Phase | Goal | Deliverables |
|--------|------|--------------|
| **P1** | REST generator | `rest/Emitter.ts` + tests |
| **P2** | GraphQL generator | `gql/Schema.ts` + tests |
| **P3** | Resolver cache | `cache/ResolverCache.ts` |
| **P4** | Policy middleware | `policy/Enforcer.ts` |
| **P5** | Manifest compiler | `composer/Manifest.ts` |
| **P6** | Gateway bridge | `gateway/Publisher.ts` |
| **P7** | Docs & samples | `/docs/api/api.md` |

---

## 8. Testing Strategy

- Unit: route/schema generation, policy, cache.  
- Integration: end-to-end with Docker DBs.  
- Golden: generated GraphQL schema snapshots.  
- Perf: RPS & p95 latency under load.

---

## 9. Integration Points

| Module | Usage |
|--------|-------|
| `@nublox/sqlx-orm` | Source of entities/relations |
| `@nublox/sqlx-core` | Execution & simulation |
| `@nublox/sqlx-control` | Gateway publish & policy ids |
| `@nublox/sqlx-observe` | Telemetry events |

---


© 2025 NuBlox Technologies Ltd. All Rights Reserved.
