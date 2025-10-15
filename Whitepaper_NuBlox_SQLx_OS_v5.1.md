# Whitepaper_NuBlox_SQLx_OS_v5.1.md

## Executive Summary
NuBlox SQLx OS is a **self‑learning, dialect‑agnostic** database operating system. A **data‑driven transport** (WireVM + wire packs) speaks engine protocols directly; **FLO** learns server capabilities and per‑database schema profiles; a **Planner** produces online‑safe migration plans. SQLx Studio is the IDE; **NuBlox Cloud** provides identity, RBAC, secrets, audit, and licensing.

**Tagline:** *The Database That Thinks.*

---

## 1. Problem
Today’s database toolchains are fragmented, manual, and fragile—dialect plugins everywhere, static migrations, bolted‑on security, and costly compliance.

---

## 2. Approach

### 2.1 Data‑Driven Transport
- Wire packs describe handshake/auth/opcodes; WireVM interprets and executes.
- TLS negotiation and auth plugins are negotiated automatically—no code branches.

### 2.2 Feature Learning (FLO)
- **Server learning** → `connections.capability_json` + `server_fingerprint`.
- **Database learning** → `database_schemas.profile_json` + `profile_hash`.
- Model: **one server connection → many database schemas**.

### 2.3 Planner & Autonomy
- Snapshot/diff/apply with online strategies (shadow tables, live swap, backfill).
- Auto‑improvement: indexes/partitions/normalization guided by workload clusters.
- Guardrails tied to learned capabilities and policy mode (e.g., HIPAA).

### 2.4 Security & Compliance
- Policy modes (SOX/GDPR/HIPAA/PCI/SOC2) enforce masking, sampling, retention, encryption, audit.
- PII detection with conservative, opt‑in observation.
- Forensic timeline with hash chaining; mirrored to `platform.global_audit_events`.
- Secrets managed in `platform.secrets`, delivered as ephemeral URLs/tokens.

---

## 3. SQLx Studio & Cloud
- Studio tree: **Connection → Databases → Tables/Views/Indexes**.
- Collaboration & history for queries; real‑time editing ops.
- Observability: query executions + hourly analytics; health and usage stats.
- Migrations & planner integration with rollback strategies.
- Cloud workspaces/projects, feature flags, retention policies, notifications.

---

## 4. Lifecycle
1. `createDriver(url)` → connect, greeting, caps proposal, auth loop.
2. `driver.ping()` → health.
3. `driver.learn({ allDatabases | databases })` → persist server caps + db profiles.
4. Design/diff/apply plans with online preference and audit logging.
5. Monitor outcomes and iterate with Copilot suggestions.

---

## 5. Economics
- Consolidation → ~65% OPEX reduction per 100 instances (modeled).
- Velocity 3–4×; −90% downtime through online changes and circuit breakers.

---

## 6. Roadmap
- **Q4’25 Alpha**: MySQL/MariaDB packs, learning, planner v1, Studio alpha, Cloud GA for connections/profiles.
- **2026**: Postgres family, compliance GA, advanced Copilot, marketplace.
- **2027**: OEM + enterprise standardization.

---

## 7. Quick Start
```bash
export DATABASE_URL="mysql://root:password@localhost:3306"
sqlx ping
sqlx learn --all-databases       # skip system schemas by default
sqlx capabilities
```
Open Studio at `user.nublox.io`, add connection, select database, design & run.
