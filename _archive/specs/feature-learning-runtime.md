# Feature Learning Runtime (FLR) 2.1 — Build Specification (Developer Hand‑Off)

**Subsystem:** `@nublox/sqlx-core/flr`
**Owner:** Core Platform — Protocol Intelligence
**Status:** Ready for Implementation
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Non‑Goals

**Purpose.** Implement a self‑learning runtime that discovers database protocol/dialect characteristics at connection time and continuously refines a **DialectProfile** used by Helix Core, ORM, API, and Control Plane.

**Goals:**

* Zero‑config onboarding to new/unknown SQL engines and versions.
* Safe, idempotent, read‑only probing by default (no DDL/DML).
* Deterministic **capability matrix** and **limits** discovery (params, packet size, timeouts, isolation levels).
* Persisted **fingerprint** + **profile**; sync with Control Plane Registry.
* Telemetry on all probes for future learning.

**Non‑Goals:**

* Vendor‑specific admin (backup/restore, replication setup).
* Full ANSI conformance test suite (out of scope);
* Cross‑DB federation — handled by higher layers.

---

## 2. Success Criteria (Acceptance)

* **Correctness:**

  * For PG16 + MySQL 9, FLR 2.1 returns a stable `DialectProfile` matching ground truth (feature flags, max params, isolation, JSON support, CTE/window support).
  * Profile hash is deterministic across identical servers (± clock skew).
* **Safety:**

  * Read‑only probe suite by default; destructive tests require `--allow-destructive` and safe sandbox checks.
* **Performance:**

  * Cold learn ≤ **250 ms** median; warm (cached) learn ≤ **25 ms**.
* **Portability:**

  * Gracefully degrades (marks unsupported) for unknown features; never blocks connection.
* **Observability:**

  * 100% probe steps emit `TelemetryEvent` with step name, duration, and outcome.

---

## 3. Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│                   Feature Learning Runtime 2.1                │
├───────────────────────────────────────────────────────────────┤
│ 1. HandshakeManager (auth/TLS/params)                         │
│ 2. ProbeSuite (capabilities tests)                            │
│ 3. Profiler (normalize → DialectProfile)                      │
│ 4. CacheStore (local)                                         │
│ 5. RegistryClient (Control Plane sync)                        │
│ 6. TelemetryEmitter (OTel events for each probe)              │
└───────────────────────────────────────────────────────────────┘
```

**Dataflow**

```
url → Handshake → ProbeSuite → Profiler → CacheStore → RegistryClient → profile
```

---

## 4. External Contracts (Stable APIs)

### 4.1 TypeScript Interfaces

```ts
export interface DialectProfile {
  id: string;                 // stable hash of {vendor, version, caps, limits}
  vendor: 'postgres' | 'mysql' | string;
  version: string;            // server_version
  caps: Record<string, boolean>; // e.g., json, jsonb, lateral, cte, window, sargableLike
  limits: {
    maxParams?: number;       // bind parameter limit
    maxPacket?: number;       // max payload size
    maxIdentifierLen?: number;
    txLevels?: Array<'read_committed'|'repeatable_read'|'serializable'>;
  };
  network: { ssl: boolean; compression?: boolean };
  learnedAt: number;          // epoch ms
  source: 'cache' | 'probed' | 'registry';
}

export interface LearnOptions {
  url: string;                // connection string
  timeoutMs?: number;         // global probe deadline
  allowDestructive?: boolean; // enable DDL/DML probes (off by default)
}

export interface FlrClient {
  learn(opts: LearnOptions): Promise<DialectProfile>;
  getCached(url: string): Promise<DialectProfile | null>;
  clearCache(url?: string): Promise<void>;
}
```

### 4.2 Telemetry Contract

```ts
export interface FlrProbeEvent {
  id: string; ts: number; step: string; ok: boolean; durationMs: number;
  attrs?: Record<string, unknown>; // e.g., serverVersion, ssl, caps(json=true)
}
```

### 4.3 Error Model

```ts
export type FlrErrorCode = 'E_HANDSHAKE' | 'E_TIMEOUT' | 'E_UNSUPPORTED' | 'E_INTERNAL';
export class FlrError extends Error { constructor(public code: FlrErrorCode, msg: string, public details?: unknown) { super(msg); } }
```

---

## 5. Probe Matrix (v2.1)

| Area        | Probe       | Method                                         | Success Signal     | Fallback                    |
| ----------- | ----------- | ---------------------------------------------- | ------------------ | --------------------------- |
| **Network** | SSL/TLS     | Attempt SSL; read `ssl_accepted`/status        | `ssl=true`         | plaintext with warning      |
|             | Compression | Negotiate if vendor supports                   | `compression=true` | none                        |
| **Auth**    | Mechanism   | Try SASL/MD5/scram                             | token accepted     | downgrade + warn            |
| **Server**  | Version     | `SELECT version()` / handshake banner          | parse major.minor  | unknown → `vendor='custom'` |
| **Syntax**  | CTE         | `EXPLAIN WITH q AS (SELECT 1) SELECT * FROM q` | no error           | mark `cte=false`            |
|             | Window      | `EXPLAIN SELECT row_number() OVER()`           | no error           | `window=false`              |
|             | JSON        | vendor‑specific `json/jsonb` ops               | plan ok            | `json=false`                |
|             | Lateral     | `EXPLAIN SELECT * FROM t, LATERAL (...)`       | no error           | `lateral=false`             |
| **Limits**  | Max Params  | binary search bind count                       | highest passing N  | cap at N                    |
|             | Packet Size | send payloads of increasing size               | last ok size       | cap at size                 |
| **Tx**      | Isolation   | set level + readback                           | accepted           | remove unsupported          |

> All SQL probes executed as `EXPLAIN` or in temporary session; **no writes** unless `allowDestructive=true`.

---

## 6. Detailed Components

### 6.1 HandshakeManager

* Parse URL; resolve host/port; open socket with deadline.
* Negotiate SSL; attempt compression if supported.
* Auth via best‑available mechanism; emit telemetry for mech + rounds.
* Read server banners/capabilities.

### 6.2 ProbeSuite

* Execute **read‑only** capability tests in priority order; each with per‑probe timeout (default 50 ms).
* Binary‑search for max params and packet size (log₂ rounds).
* Detect feature gates (CTE/window/lateral/json) using vendor‑neutral patterns.

### 6.3 Profiler

* Normalize raw results → `DialectProfile`.
* Compute `id = sha256(vendor|version|caps|limits)`; include stable sort of keys.
* Attach `source='probed'`, `learnedAt=now()`.

### 6.4 CacheStore

* Key: normalized `connection authority` (host:port:db:vendor).
* Store JSON at `~/.sqlx/flr/profiles.json` with LRU (max 256 entries).
* TTL: 24h default; refresh on version change.

### 6.5 RegistryClient (Control Plane)

* POST `/registry/fingerprint` with profile; receive policy hints.
* Backoff on network failure; cache `pending` state and retry later.

### 6.6 TelemetryEmitter

* Emit `FlrProbeEvent` per step; batch flush every 500 ms or 128 events.

---

## 7. Security & Safety

* **Least privilege:** connect with read‑only role during FLR.
* **Sandbox guard:** destructive probes require temp schema + capability flag; auto‑cleanup.
* **Secrets handling:** never log credentials; redact DSNs in traces.
* **Time‑boxed:** global `timeoutMs` cancels probe suite.

---

## 8. Performance Targets

* Cold handshake+probes: median ≤ 250 ms; p95 ≤ 600 ms.
* Warm cache hit: ≤ 25 ms.
* Network retries: max 1 with 20 ms jittered backoff during learn.

---

## 9. CLI & Dev UX

```
sqlx ping --url <dsn>            # handshake + profile print (safe)
sqlx learn --url <dsn> --json    # full FLR; emits profile JSON
sqlx learn --clear-cache         # wipe local FLR cache
```

Sample output (truncated):

```json
{
  "vendor": "postgres",
  "version": "16.2",
  "caps": {"cte": true, "window": true, "jsonb": true, "lateral": true},
  "limits": {"maxParams": 65535, "txLevels": ["read_committed","repeatable_read","serializable"]}
}
```

---

## 10. Testing Strategy

### 10.1 Unit

* URL parsing, SSL negotiation state machine, binary search for limits, JSON/CTE/window detection parsers.

### 10.2 Integration

* Docker PG16 & MySQL 9; run full learn and validate profile against known ground truth.
* Fault injection: drop packets, handshake timeout, auth‑fail.

### 10.3 Golden

* Store canonical `DialectProfile` fixtures per engine version under `/tests/golden/flr/*`.
* Profile `id` must be stable across runs.

### 10.4 Performance

* Benchmark cold vs warm learn; ensure targets met.

---

## 11. Milestones & Work Breakdown

|  Phase | Scope            | Deliverables                               | Owner    | Exit Criteria              |
| -----: | ---------------- | ------------------------------------------ | -------- | -------------------------- |
| **P1** | Scaffold         | package, interfaces, error/telemetry model | Protocol | build passes               |
| **P2** | Handshake        | SSL/auth negotiation, banners              | Protocol | `sqlx ping` success        |
| **P3** | Probes           | CTE/window/json/lateral + limits           | Protocol | caps matrix passes         |
| **P4** | Profiler & Cache | profile hashing + local cache              | Core     | warm learn ≤25 ms          |
| **P5** | RegistryClient   | sync to Control Plane                      | Control  | profile visible in console |
| **P6** | Hardening        | chaos/fault tests, docs                    | All      | GA readiness               |

---

## 12. Reference Pseudocode

```ts
export async function learn(opts: LearnOptions): Promise<DialectProfile> {
  const cached = await CacheStore.get(opts.url);
  if (cached) return { ...cached, source: 'cache' };

  const hs = await HandshakeManager.negotiate(opts);
  const caps = await ProbeSuite.runAll(hs.conn, { timeoutMs: 50 });

  const profile: DialectProfile = Profiler.normalize(hs, caps);
  await CacheStore.put(opts.url, profile);
  RegistryClient.register(profile).catch(() => void 0);

  TelemetryEmitter.flush();
  return { ...profile, source: 'probed' };
}
```

---

## 13. Diagnostics & Observability

* `FLR_DEBUG=1` logs probe names and durations (redacted DSN).
* Telemetry fields: `flr.step`, `flr.ok`, `flr.duration_ms`, `db.system`, `db.version`.
* `sqlx heal --url <dsn>` includes FLR connectivity & capability checks.

---

## 14. Risks & Mitigations

* **Risk:** Probes mis‑classified on older engines.
  **Mitigation:** favor `EXPLAIN` over execution; vendor‑neutral SQL; add per‑version overrides.
* **Risk:** Profile staleness after upgrade.
  **Mitigation:** embed server version in cache key; trigger re‑learn on mismatch.
* **Risk:** Network instability causes slow learns.
  **Mitigation:** strict per‑probe timeouts + global deadline; early return with partial profile.

---

## 15. Future Hooks (v2.2+)

* Oracle/SQL Server adapters with partial probe coverage.
* Passive learning from production traces (no active probes).
* Coordinated learning via CRDT profiles across nodes.
* Privacy‑preserving profile analytics (sketching) in Control Plane.

---

> *Zero config. Zero surprises. Learn first, optimize always.*
