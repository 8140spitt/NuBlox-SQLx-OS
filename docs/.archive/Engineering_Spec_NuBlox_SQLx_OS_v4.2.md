# Engineering_Spec_NuBlox_SQLx_OS_v4.2.md

## 0) What changed in v4.2
- Integrated the **SQLx Studio schema** (server→databases→tables→columns) with FLO and Planner.
- Clarified **server-level vs database-level** learning and storage.
- Standardized on **data‑driven transports** (wire packs + WireVM). No DB client libs.
- Added **capability_json**/**server_fingerprint** on `connections`, and **profile_json/profile_hash** on `database_schemas`.
- Documented CLI flags: `--all-databases`, `--databases`, `--include-system`.
- Build notes for pnpm/tsup + TS configs.

---

## 1) Monorepo (unchanged layout)
```
NuBlox-SQLx-OS/
  apps/studio/                         # SQLx Studio (web/desktop shell)
  packages/
    @nublox/sqlx                       # Public API (createDriver) + orchestration
    @nublox/sqlx-cli                   # CLI (ping/learn/capabilities/...)
    @nublox/sqlx-flo                   # Feature Learning & Observation
    @nublox/sqlx-planner               # Snapshot/ Diff/Apply/Improve
    @nublox/sqlx-transport             # WireVM + registry loader (data-driven)
  transports/
    registry.json                      # family→pack
    mysql.wire.json                    # example pack
  docs/
  ...
```

**Build quickstart**
```bash
pnpm -w i
pnpm -r build
# or per package:
pnpm -C packages/@nublox/sqlx-transport build
pnpm -C packages/@nublox/sqlx-flo build
pnpm -C packages/@nublox/sqlx-planner build
pnpm -C packages/@nublox/sqlx build
pnpm -C packages/@nublox/sqlx-cli build
```
> Ensure each package `tsconfig.json` extends `../../tsconfig.base.json` and includes `"types": ["node"]`.

---

## 2) Data-driven Transport (WireVM)

### 2.1 Wire Packs
- JSON files that describe: framing, opcodes, capability flags, greeting layout, auth plugins, and simple scripts for **auth negotiation**.
- Example: `mysql.wire.json` defines v10 greeting parse, SSLRequest flow, `caching_sha2_password`/`mysql_native_password` auth, `COM_QUERY/PING` messages.
- `transports/registry.json` maps URL schemes to pack (`mysql`/`mariadb` → `mysql.wire.json`).

### 2.2 WireVM responsibilities
- TCP/TLS connect → parse greeting → emit `handshake.greeting` event to FLO.
- Accept **clientCaps** proposal from FLO policy; optionally do TLS upgrade.
- Run plugin‑ordered **auth loop** until OK or terminal error.
- Execute simple commands (PING, INIT_DB, QUERY) needed by FLO/Planner.
- Provide a thin `exec()` channel for queries (ROW streaming with back‑pressure).

**No dialect branches in code**—behavior is driven entirely by the wire pack.

---

## 3) Feature Learning & Observation (FLO)

### 3.1 Scope: server‑level vs database‑level
- **Server level** (one row in `sqlxstudio.connections`):
  - learn protocol version, server caps/limits, supported auth plugins, TLS posture.
  - store to `connections.capability_json` and `connections.server_fingerprint`.
- **Database level** (child rows in `sqlxstudio.database_schemas`):
  - learn schema graph (tables/columns/indexes/constraints/routines), stats, privileges.
  - store to `database_schemas.profile_json` and `database_schemas.profile_hash`.

### 3.2 Learning pipeline
1. **Greeting** parsed by WireVM → FLO generates conservative `clientCaps` (TLS if remote, multi‑results, tx, etc.).
2. **Auth loop** (plugin-ordered from wire pack) until success.
3. **Server probes** (read‑only):
   - limits (identifier length, params), supported features (CTE, window, JSON, generated columns), isolation + savepoints.
4. **Catalog discovery**:
   - list databases (skip system by default), or focus one if URL had a db.
   - per db: `USE db` → enumerate tables/views/indexes/constraints/columns; lightweight stats; roles/policies (when available).
5. **Persist**: capability matrix on connection; IR snapshot per db; update counters and timestamps.

### 3.3 FLO API (summary)
```ts
type LearnedServer = {
  version: string;
  caps: Record<string, boolean | number | string>;
  limits: Record<string, number>;
  security: { tls: 'on'|'off'; authPlugins: string[]; trust: 'system'|'custom' };
  fingerprint: string; // hash(host:port:version:salt)
};

type LearnedDatabase = {
  db: string;
  schemaGraph: IRSchemaSnapshot;
  profileHash: string;
  stats?: { tables: number; views: number; ... };
};

async function learnServer(session): Promise<LearnedServer>;
async function listDatabases(session): Promise<string[]>;
async function learnDatabase(session, db: string): Promise<LearnedDatabase>;
```

---

## 4) Planner

### 4.1 Responsibilities
- **Snapshot**: Convert live catalog → IR.
- **Diff**: IR → plan (create/alter/index/partition/constraint changes).
- **Apply**: execute with **online** strategies where safe (shadow tables, live swap, backfill).
- **Auto‑improve**: suggest indexes/partitions/normalization based on query clusters and table stats; produce a rollout plan with rollback.

### 4.2 Inputs/Outputs
- Inputs: `LearnedServer`, `LearnedDatabase` (from FLO), studio user goals (e.g., “optimize for heavy writes”).
- Outputs: plan graph with **guardrails** keyed to `capability_json` and **policy mode** (e.g., HIPAA).

---

## 5) SQLx Studio + Cloud

### 5.1 Schema integration
- `sqlxstudio.connections` → **server-level** identity, policy, learned capabilities.
- `sqlxstudio.database_schemas` → **database-level** graph (IR snapshot) and status.
- `sqlxstudio.tables`, `sqlxstudio.columns`, `sqlxstudio.indexes` → optional materialized metadata for fast search and change tracking.
- Observability: `connection_health_checks`, `connection_usage_stats`, `query_executions`, `query_performance_analytics`.
- Planner/Migrations: `migration_projects`, `migrations`, `migration_executions`.
- Collaboration: `queries`, `query_folders`, `query_edit_sessions`, `query_change_operations`.

### 5.2 Server→Databases model
- One **connection** per host:port:user (server) with one secret.
- Many **database_schemas** linked to that connection.
- Studio tree: **Connection** → **Databases** → Tables/Views/Indexes.

### 5.3 Compliance & Security
- Compliance modes (SOX/GDPR/HIPAA/PCI/SOC2) drive masking, sampling, retention, encryption, audit verbosity, RBAC strictness.
- PII/PHI discovery: name/regex heuristics + optional sampled introspection with strict guards.
- Forensic timeline: hash‑chained events mirrored to `platform.global_audit_events`.

---

## 6) Public API (driver)

```ts
export type Driver = {
  ping(): Promise<void>;
  learn(options?: { allDatabases?: boolean; databases?: string[]; includeSystem?: boolean }): Promise<LearnReport>;
  capabilities(): CapabilityMatrix;                     // from connections.capability_json
  snapshot(db: string): Promise<IRSchemaSnapshot>;      // convenience wrapper
  diff(fromIR: IRSchemaSnapshot, toIR: IRSchemaSnapshot): Promise<Plan>;
  apply(plan: Plan, opts?: ApplyOptions): Promise<ApplyReport>;
  close(): Promise<void>;
};

export async function createDriver(url: string): Promise<Driver>;
```

**CLI mapping**
```bash
sqlx ping
sqlx learn --all-databases
sqlx learn --databases app,analytics
sqlx learn --include-system
sqlx capabilities
sqlx plan:diff --from a.json --to b.json
sqlx apply --plan plan.json
```

---

## 7) Build & Type Safety
- Each package emits `dist/index.js` and `dist/index.d.ts` via `tsup`.
- Build order matters: transport → flo → planner → sqlx → cli.
- If TS shows “implicitly any” on imports, build the dependency first.

---

## 8) December “Studio Alpha” scope
- **MySQL/MariaDB** packs: greeting v10, TLS upgrade, native + caching_sha2 auth, PING/QUERY/INIT_DB.
- FLO server+db learning with persistence in Studio schema.
- Planner snapshot/diff/apply v1 with online‑safe DDL.
- Studio: editor, schema explorer, capability viewer, migration runner.
- Cloud: workspaces, secrets, audit chain, connections CRUD.
