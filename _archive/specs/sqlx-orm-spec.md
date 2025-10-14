# Helix ORM Build Specification  
**Subsystem:** @nublox/sqlx-orm  
**Version:** 1.0  
**Status:** Design-Approved (Q1 2026 Target)  
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Scope

`@nublox/sqlx-orm` implements the **Helix ORM** — a self-generating, dialect-agnostic ORM built on SQLx Core and IR.

---

## 2. Functional Overview

| Capability | Description |
|-------------|-------------|
| **Schema Introspection** | Imports IR metadata and builds an entity graph. |
| **Model Generation** | Creates entities, fields, relations, constraints. |
| **Live Sync** | Detects drift and updates models and types. |
| **Query Builder** | Fluent, dialect-neutral query syntax. |
| **Transaction Integration** | Uses SQLx Core transaction fabric. |
| **Type Emitter** | Generates TS/Go/Python models. |

---

## 3. Key Components

```
SchemaGraphBuilder → EntityModelGenerator → TypeEmitter
                       ↓
                 QueryBuilder/Resolver → SQLx Core
```

---

## 4. Internal Data Flow

```
IR Schema → Graph → Models → Types → Queries → Core.execute()
```

---

## 5. Core Interfaces (TypeScript)

```ts
export interface OrmConfig {
  dialect: string;
  connectionUrl: string;
  syncIntervalMs?: number;
  emitTypes?: boolean;
}

export interface OrmEntity {
  name: string;
  fields: OrmField[];
  relations: OrmRelation[];
  primaryKey?: string;
}

export interface OrmField {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: any;
}

export interface OrmRelation {
  target: string;
  type: '1:1' | '1:n' | 'n:n';
  via?: string;
}

export interface QueryFilter {
  where?: Record<string, any>;
  orderBy?: string[];
  limit?: number;
  offset?: number;
  include?: string[];
}

export class OrmClient {
  constructor(config: OrmConfig);
  query<T>(entity: string, filter?: QueryFilter): Promise<T[]>;
  insert<T>(entity: string, data: Partial<T>): Promise<T>;
  update<T>(entity: string, id: any, data: Partial<T>): Promise<T>;
  delete<T>(entity: string, id: any): Promise<void>;
  transaction<T>(fn: (tx: OrmClient) => Promise<T>): Promise<T>;
}
```

---

## 6. Implementation Tasks (Phased)

| Phase | Goal | Deliverables |
|--------|------|--------------|
| **P1** | Schema Graph Builder | `SchemaGraphBuilder.ts` |
| **P2** | Model Generator | `EntityModelGenerator.ts` |
| **P3** | Query Builder | `QueryBuilder.ts` |
| **P4** | Type Emitter | `TypeEmitter.ts` |
| **P5** | Relation Mapper | `RelationMapper.ts` |
| **P6** | Sync Watcher | `SyncWatcher.ts` |
| **P7** | Tx Bridge + Telemetry | `TransactionBridge.ts` |
| **P8** | Perf + Docs | `/docs/api/orm.md` |

---

## 7. Testing Strategy

- Unit: graph, model, builder.  
- Integration: Docker MySQL/PG parity with SQL.  
- Golden: generated SQL & types.  
- Bench: compare to Prisma/Drizzle.

---

## 8. Integration Points

| Module | Usage |
|--------|-------|
| `@nublox/sqlx-core` | IR, synthesize/execute |
| `@nublox/sqlx-api` | Build REST/GraphQL |
| `@nublox/sqlx-observe` | Telemetry |
| `@nublox/sqlx-control` | Policy injection |

---


© 2025 NuBlox Technologies Ltd. All Rights Reserved.
