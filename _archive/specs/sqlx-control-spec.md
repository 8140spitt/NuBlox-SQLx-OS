# Control Plane & Policy Registry Build Specification  
**Subsystem:** @nublox/sqlx-control  
**Version:** 1.0  
**Status:** Design-Approved (Q4 2026 Target)  
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Scope

`@nublox/sqlx-control` is the centralized **governance and fleet orchestration hub**.  
It stores dialect fingerprints, enforces policies, aggregates telemetry, and publishes API endpoints to managed gateways.

---

## 2. Functional Overview

| Capability | Description |
|-------------|-------------|
| **Fingerprint Registry** | Stores dialect/feature profiles learned by FLR 2.0. |
| **Policy Engine** | RBAC, region rules, time windows, rate limits, field masking. |
| **Telemetry Collector** | Receives Observability Bus events from nodes. |
| **Gateway Publisher** | Manages API deployment lifecycle (create/update/revoke). |
| **Drift Detection** | Alerts on schema drift across environments. |

---

## 3. Components

```
Nodes (SQLx) ⇄ Control API ⇄ Registry/Policy/Telemetry DBs
                      ↓
                 Admin Console
```

---

## 4. Core Interfaces (TypeScript)

```ts
export interface FingerprintRecord {
  nodeId: string;
  dialect: string;
  version: string;
  features: Record<string, boolean>;
  learnedAt: number;
}

export async function registerFingerprint(r: FingerprintRecord): Promise<void>;

export interface PolicyRule {
  id: string;
  target: string; // table/column/endpoint
  action: 'allow' | 'deny' | 'mask';
  condition?: string; // CEL or simple expr
}

export async function getPolicyProfile(profileId: string): Promise<PolicyRule[]>;

export interface GatewaySpec {
  id: string;
  baseUrl: string;
  region: string;
}

export async function publishApi(gateway: GatewaySpec, router: any): Promise<{ url: string }>;
```

---

## 5. Implementation Tasks (Phased)

| Phase | Goal | Deliverables |
|--------|------|--------------|
| **P1** | Control API skeleton | `api/server.ts` |
| **P2** | Registry models | `models/fingerprint.ts` |
| **P3** | Policy engine | `policy/engine.ts` |
| **P4** | Telemetry collector | `telemetry/ingest.ts` |
| **P5** | Gateway bridge | `gateway/publisher.ts` |
| **P6** | Console (MVP) | `/console/` SPA |
| **P7** | Docs & ops | `/docs/control/index.md` |

---

## 6. Testing Strategy

- Unit: registry/policy logic.  
- Integration: node → control → gateway publish flow.  
- Security: policy bypass attempts, auth scopes.  
- Load: telemetry ingestion throughput.

---

## 7. Integration Points

| Module | Usage |
|--------|-------|
| `@nublox/sqlx-core` | Receives fingerprints, distributes policies |
| `@nublox/sqlx-api` | Publishes endpoints, resolves policy ids |
| `@nublox/sqlx-observe` | Telemetry source |

---


© 2025 NuBlox Technologies Ltd. All Rights Reserved.
