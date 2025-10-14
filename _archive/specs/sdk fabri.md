# SDK Fabric v1.0 — Build Specification (Developer Hand‑Off)

**Subsystems:** `@nublox/sqlx-sdk` (codegen), `@nublox/sqlx-client` (runtime), `@nublox/sqlx-auth` (client auth), `@nublox/sqlx-telemetry` (client observability)
**Owners:** Developer Experience (DX) — SDK Team
**Status:** Ready for Implementation
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Scope

Deliver a **multi‑language SDK Fabric** that generates type‑safe clients for APIs emitted by SQLx OS. It must:

* Provide idiomatic clients for **TypeScript, Go, Python, and Rust**.
* Support **REST & GraphQL** backends with unified ergonomics.
* Handle **auth**, **retries**, **caching**, **pagination**, **streaming**, and **telemetry** consistently.
* Guarantee **semantic versioning**, **source maps**, and **offline codegen** for CI/CD.

**Out of scope:** UI widgets, framework‑specific bindings (React/Vue), mobile SDKs (future).

---

## 2. Success Criteria (Acceptance)

* **Type Safety:** generated types mirror API schema; compile with zero errors on example apps.
* **Performance:** p95 SDK overhead ≤ **5%** vs naked HTTP for typical list/read ops.
* **Resilience:** default retry for idempotent ops; circuit breaker; backoff with jitter.
* **Observability:** 100% requests include trace headers; client exposes spans and metrics.
* **DX:** `npx sqlx-sdk emit` generates a working client in < 5s; docs and examples included.

---

## 3. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                            SDK Fabric                              │
├────────────────────────────────────────────────────────────────────┤
│ 1. Schema Loader (OpenAPI/GraphQL SDL/SQLx manifest)               │
│ 2. Generators (TS/Go/Py/Rust)                                      │
│ 3. Client Runtime (auth, retry, cache, pagination, streaming)      │
│ 4. Observability Bridge (OTel, logging)                            │
│ 5. Distribution (npm, PyPI, crates.io, Go module)                  │
└────────────────────────────────────────────────────────────────────┘
```

**Dataflow**

```
Schema → Generators → Language clients → App code → Gateway/API → Telemetry
```

---

## 4. Inputs & Manifests

* **OpenAPI 3.1** (REST) and **GraphQL SDL** (GraphQL) exported by API Emitter.
* **`.sqlxapi.yaml`** augmentation for auth strategy, cache TTLs, and tags.
* Optional **Policy hints** for field masks and row filters → client validators.

---

## 5. Public CLI & Programmatic API

```bash
sqlx-sdk emit --lang ts --schema ./openapi.json --out ./sdk/ts
sqlx-sdk emit --lang py --schema ./openapi.json --policy enterprise
```

```ts
import { generate } from '@nublox/sqlx-sdk';
await generate({ lang: 'ts', schema: 'openapi.json', out: './sdk/ts' });
```

---

## 6. Client Runtime Requirements

### 6.1 Auth

* Supports bearer JWT, API key, and mTLS (where applicable).
* **DPoP** optional for replay protection.
* Token refresh hook with pre‑emptive renewal.

### 6.2 Retries & Circuit Breaker

* Idempotent GET/HEAD/OPTIONS auto‑retry on 5xx/429 with jitter backoff.
* Circuit opens after N consecutive failures (default 5) per host; half‑open probes.

### 6.3 Caching

* In‑memory LRU cache with TTL; tag‑aware invalidation if server sends `Cache‑Tags` header.
* Stale‑while‑revalidate optional.

### 6.4 Pagination

* Offset pagination and optional cursor pagination with helpers (`for await...of` in TS/Py).

### 6.5 Streaming

* Support NDJSON and GraphQL `@defer`/`@stream` (where enabled).
* Backpressure‑aware readers.

### 6.6 Telemetry

* Inject W3C trace headers (`traceparent`, `tracestate`).
* Emit spans with attributes: `api.endpoint`, `http.status`, `cache.hit`, `policy.masked`.

---

## 7. Language Generators

### 7.1 TypeScript

* ESM + CJS bundles; tree‑shakable; `fetch` by default, adapter for Node HTTP.
* Types from OpenAPI; Zod (optional) runtime validators.

### 7.2 Python

* `httpx` client; `pydantic` models; async and sync variants.

### 7.3 Go

* `net/http` + context; generics for responses; error types with `Unwrap()`.

### 7.4 Rust

* `reqwest` + `serde`; features for async/runtime selection; strong enums.

---

## 8. Error Model

Unified error envelope mapping server errors to language idioms.
TS example:

```ts
export class SqlxApiError extends Error {
  constructor(
    public code: 'POLICY_DENIED'|'BAD_REQUEST'|'NOT_FOUND'|'INTERNAL'|'RATE_LIMIT',
    public status: number,
    public traceId?: string,
    public details?: unknown
  ){ super(code); }
}
```

---

## 9. Versioning & Distribution

* **SemVer** per language; generated `CHANGELOG.md`.
* Publish pipelines: npm (scoped), PyPI, crates.io, Go proxy.
* **Source maps** (TS) and type stubs (Py) included.
* Compatibility matrix pinned to API bundle version.

---

## 10. Configuration

```yaml
sdk:
  langs: ["ts","go","py","rs"]
  cache: { ttlMs: 60000, maxItems: 10000 }
  retry: { attempts: 2, baseMs: 50 }
  breaker: { threshold: 5, windowMs: 10000 }
```

---

## 11. Testing Strategy

* Golden tests for generated code; compile/run samples per language.
* Contract tests vs mock server and real gateway.
* Perf tests comparing overhead to raw HTTP.

---

## 12. Milestones & Work Breakdown

|  Phase | Scope        | Deliverables                 | Owner   | Exit Criteria    |
| -----: | ------------ | ---------------------------- | ------- | ---------------- |
| **P1** | Scaffold     | schema loader, generator API | DX      | build passes     |
| **P2** | TS Generator | types, client runtime        | DX      | example app runs |
| **P3** | Python       | models + async/sync client   | DX      | PyPI prerelease  |
| **P4** | Go           | module + tests               | DX      | go proxy ok      |
| **P5** | Rust         | crate + features             | DX      | crates.io ok     |
| **P6** | Telemetry    | OTel integration             | Observe | traces present   |
| **P7** | Hardening    | perf, docs, CI templates     | All     | GA readiness     |

---

## 13. Reference Pseudocode

```ts
export async function request(path: string, init: RequestInit): Promise<any> {
  const url = base + path;
  const id = cacheKey(url, init);
  const cached = cache.get(id);
  if (cached) { span.setAttribute('cache.hit', true); return cached; }
  const res = await fetch(url, withAuth(init));
  if (!res.ok) throw toError(res);
  const body = await res.json();
  cache.set(id, body, ttlMs);
  return body;
}
```

---

## 14. Risks & Mitigations

* **Risk:** Schema drift breaks generated SDKs.
  **Mitigation:** emit compat shims; deprecation gates; codegen diffs in PRs.
* **Risk:** Language idiom mismatch hurts DX.
  **Mitigation:** native reviewers per language; style guides.

---

## 15. Future Hooks (v1.1+)

* Mobile (Kotlin/Swift) and Edge (WASM) clients.
* Offline‑first cache with conflict resolution.
* Policy‑aware local redaction utilities.

---

> *One schema, four languages — production‑ready in minutes.*
