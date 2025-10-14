# NuBlox SQLx OS — Product Vision v4.0

> **Category:** *Database Operating System (DBOS)* — an autonomous, dialect‑agnostic database layer that learns, plans, optimizes, secures, and explains.
>
> **North Star (EOY 2025):** The most advanced full‑stack IDE is powered by SQLx OS — the brain that DBAs and developers live inside every day.

---

## 1) Positioning & One‑liner

**For** teams who manage heterogeneous SQL estates, **NuBlox SQLx OS** is a **self‑learning database operating system** that **replaces 50+ tools** with one intelligent runtime — **connect → learn → plan → apply → observe → heal** — so you ship faster with higher reliability and built‑in compliance.

**Tagline:** *The Database That Thinks.*

---

## 2) Core Value Propositions

| Pillar                        | Customer Value                                            | Proof/Feature Anchor                                                    |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Dialectless Intelligence**  | Eliminate dialect friction across MySQL, Postgres, SQLite | Feature‑Learning Orchestrator (FLO) + Capability Matrix v2              |
| **Zero‑Downtime Change**      | Ship schema updates safely                                | Online DDL planner, rollback snapshots, circuit breaker                 |
| **Performance Autonomy**      | Improve latency/throughput without manual tuning          | Adaptive cache, telemetry, AI index/partition advisor                   |
| **Governed by Design**        | Pass audits and protect data                              | Compliance modes (GDPR/SOX/PCI/HIPAA/SOC2), PII classifier, audit chain |
| **Single Pane for Dev & DBA** | One workflow from schema → API → UI                       | SQLx Studio + Copilot across IDE                                        |

---

## 3) Ideal Customer Profiles (ICP)

1. **Modern SaaS** (10–500 engineers): multi‑tenant Postgres/MySQL; fast iteration with strict SLAs.
2. **Fintech/Healthtech** (regulated): tight compliance (PCI/HIPAA), verifiable audit, least‑privilege.
3. **Data‑heavy Platforms** (marketplaces/IoT): mixed workloads, scale, HA, and online schema evolution.

**Personas:**

* **Lead DBA** (reliability, change safety), **Backend Lead** (velocity), **Security/Compliance** (evidence), **VP Eng** (tool consolidation & cost).

---

## 4) Product Pillars (what we’ll be famous for)

1. **Learn‑First Runtime** — SQLx learns the engine before it acts; knowledge is portable (SKP/SNG).
2. **Explainable Autonomy** — every plan has a rationale, risk score, and rollback.
3. **Unified Observability** — metrics/logs/traces for every Exec & Plan step.
4. **Built‑in Governance** — policy engine, PII tagging, forensic timeline.
5. **Studio‑Grade UX** — delightful, AI‑assisted workflows that collapse weeks into minutes.

---

## 5) Product Surface (Dec RC)

* **SQLx OS Core** — IR, PLA drivers, FLO, Planner, Telemetry, Security Kernel.
* **SQLx Studio** — schema designer, migration manager, query monitor, telemetry, security.
* **SQLx Copilot** — NL→IR→SQL, reasons, proposes SIPs (Schema Improvement Plans).
* **CLI & SDK** — `learn`, `snapshot:pull`, `plan:diff`, `apply --online`, `observe`, `plan:schema-improve`.

---

## 6) Packaging & Pricing (draft)

| Tier                | Audience        | What’s Included                                                                | Price (indicative)                       |
| ------------------- | --------------- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| **Community (OSS)** | Solo/dev/test   | Core OS, CLI basics, local Studio                                              | Free (AGPL/elastic license strategy TBD) |
| **Pro**             | Small teams     | Studio Pro, Copilot basic, planner online DDL                                  | $39–$79 / user / mo                      |
| **Enterprise**      | Regulated/scale | Compliance modes, PII classifier, audit chain, SSO/SAML, RBAC, policy learning | $199+ / user / mo + platform fee         |
| **Cloud**           | Hosted          | Multi‑tenant SQLx Cloud (telemetry store, SKP/SNG sync, policy CI)             | Usage‑based (compute + storage)          |

> **OEM** track: bundle with MySQL/Aurora/PG vendors (rev‑share per instance).

---

## 7) Go‑To‑Market (GTM)

**Inbound OSS → Pro:**

* Launch `sqlx learn` & `plan:diff` OSS; publish benchmarks & “online DDL cookbook”.
* Content flywheel: *Dialectless series*, *Zero‑Downtime field guide*, *Compliance by design*.

**Enterprise Sales:**

* Compliance narratives with verifiable **audit chain** demos.
* POC motion: 2‑week **Shadow Migration** using `plan:schema-improve` + simulation.

**Partnerships:**

* **AWS/GCP/Azure** marketplace listings; **Datadog/Grafana** exporters; **HashiCorp** integration.
* **OEM** pilots with cloud DB services.

---

## 8) Competitive Landscape (how we win)

| Axis                      | SQLx OS | Liquibase/Flyway | Prisma/Hibernate | DataGrip/DBeaver | Datadog/OTel       |
| ------------------------- | ------- | ---------------- | ---------------- | ---------------- | ------------------ |
| Dialect‑agnostic learning | **✅**   | ❌ (static)       | ⚠️ (per driver)  | ❌                | N/A                |
| Online DDL + rollback     | **✅**   | ⚠️               | ❌                | ❌                | N/A                |
| Autonomy (AI)             | **✅**   | ❌                | ❌                | ❌                | ⚠️ (insights only) |
| Compliance baked‑in       | **✅**   | ❌                | ❌                | ❌                | ⚠️ (observability) |
| Studio UX                 | **✅**   | ❌                | ❌                | ⚠️               | ❌                  |

---

## 9) KPI North‑Stars

* **Time‑to‑Plan** (schema diff → plan): median ≤ 60s.
* **Zero‑Downtime Coverage**: ≥ 80% common DDLs.
* **Copilot Acceptance Rate**: ≥ 70% first‑pass DDL/DQL accepted.
* **Mean Time to Recovery**: −50% vs legacy stacks.
* **Compliance Proof Time**: audit export ≤ 5 min.

---

## 10) Launch Narrative (Dec 2025)

**Hook:** *Databases finally get an OS.*

**Demo Story:**

1. `sqlx learn` fingerprints a live Postgres; capability matrix appears.
2. Import a snapshot, open Studio → visualize schema + hot queries.
3. Run `plan:schema-improve` → SIP with rationale (indexes + partitions); simulate → apply online.
4. Flip **GDPR mode** on → columns auto‑masked, lineage recorded, audit verified.

**CTA:** “Replace 50+ tools with one brain. Start with `npm i @nublox/sqlx`.”

---

## 11) Objections & Answers

* **“We already have DBAs + tools”** → Consolidation + autonomy cuts toil; SQLx augments DBAs with explainable plans.
* **“Compliance risk?”** → Forensic, signed audit + policy learning; faster, provable audits.
* **“Driver reliability?”** → Protocol‑Lite Adapters are minimal and tested; planner simulates before apply.

---

## 12) Adoption Path

1. **Observe** (no‑risk): connect read‑only; build SKP/SNG; surface insights.
2. **Plan** (low‑risk): generate plans, simulate, export audit.
3. **Apply** (controlled): online DDL with breaker, rollback snapshots.
4. **Automate**: Copilot + policy learning; pipeline integration.

---

## 13) Visual/Brand Brief

* **Tone:** confident, technical, minimal; *“OS for Data”*.
* **Iconography:** neuron‑grid for SNG, shield‑chain for audit, split‑arrow for online DDL.
* **Hero visual:** flow from **Connect → Learn → Plan → Apply → Observe → Heal**.

---

## 14) Roadmap Signals (public)

* 2025: Core OS + Studio RC (MySQL/Postgres/SQLite).
* 2026: Compliance packs, Federation/HA, more dialects, Cloud.
* 2027: OEM inclusion; default runtime in major distributions.

---

## 15) Call to Action

* **Developers:** `npm i @nublox/sqlx` → `sqlx learn` → open Studio.
* **Leads/DBAs:** Schedule a 30‑min *Shadow Migration* workshop.
* **Compliance:** Request a guided **Forensic Timeline** demo.

---

## 16) SaaS Platform — nublox.io (Workspaces, Studio, Licensing)

**Goal:** Make onboarding and day‑to‑day use trivial: users register at **nublox.io**, get a dedicated **`user.nublox.io`** portal, and run **SQLx Studio** on web or desktop with unified licensing.

### 16.1 Tenancy & Routing

* **Workspace** is the primary tenant unit (Figma‑style).
* **Subdomain:** `user.nublox.io` (or `org.nublox.io`) maps to that workspace’s portal.
* **Projects** live under a workspace for grouping connections, artifacts, and plans.

### 16.2 Identity, Access, Billing

* Users sign up to **nublox.io**, then create or join **workspaces**.
* Roles: **owner, admin, developer, analyst, viewer**.
* **Billing** is workspace‑scoped: plan (`free`, `pro`, `enterprise`) + seats.
* Feature access is controlled via **entitlements** embedded in a signed **license token (JWT)** issued to the workspace.

### 16.3 Studio Delivery: Web + Desktop

* **Web Studio** hosted at `user.nublox.io` with always‑latest features.
* **Desktop Studio** (installable) signs in with the same account, honors the same entitlements, and supports **offline** workflows (snapshots/SKP/SNG).
* Both surfaces use the same Core/Planner/FLO APIs.

### 16.4 Secure Connectivity & Secrets

* **No raw secrets** in platform DB. Credentials/DSNs are kept in a **Secrets Vault/KMS**; platform stores only **secret references**.
* **Connection Policy** objects define TLS/timeout/max‑conn rules (e.g., require TLS for remote, allow plaintext on localhost, pin certificates).
* Connections are **dialectless** and capability‑first: we store a `url_template`, link to secret refs, and persist learned **Capability Matrix** & **Server Knowledge Pack (SKP)** as artifacts.

### 16.5 Workspace Agents (optional)

* For on‑prem/VPC databases, a lightweight **Workspace Agent** runs near the DBs.
* Web Studio submits tasks (learn/snapshot/plan/apply) that the Agent executes and returns **artifacts** (SKP/SNG/Plans).
* Agents authenticate with short‑lived **agent tokens** (hash stored server‑side).

### 16.6 Artifacts & Audit

* **Artifacts store** keeps SKP, SNG, schema snapshots, plans (diff/SIP), and signed audit bundles.
* **Forensic timeline** is append‑only, hash‑chained, and exportable for audits.

### 16.7 Plans & Pricing Signals (draft)

* **Community (OSS):** Core + CLI + local Studio.
* **Pro:** Studio Pro, Copilot (Edge), online DDL, team features.
* **Enterprise:** Compliance modes, PII classifier, forensic audit, SSO/SAML, RBAC, policy learning, Agents, extended retention.
* **Cloud:** Hosted telemetry/SKP/SNG sync and policy CI (usage‑based).

---

## 17) Data Model Highlights (Platform)

> These complement the Studio/OS and keep the platform dialect‑free and secrets‑safe.

* **`db_connections`** (dialectless): `url_template`, `secret_ref` links, `connection_policy`, `caps_json`, `security_json`, and `skp_artifact_id`.
* **`secret_refs`**: provider+locator for KMS/Vault—no plaintext in DB.
* **`connection_policies`**: TLS and timeout rules (reusable).
* **`artifacts`**: SKP/SNG/snapshot/plan/audit stored in object storage with checksums.
* **`license_tokens`**: workspace entitlements for Studio/Copilot.
* **`workspace_agents` / `agent_tokens`**: optional on‑prem execution path.

---

## 18) Flows (End‑to‑End)

1. **Sign‑up & Workspace:** user registers at nublox.io → creates workspace → gets `user.nublox.io`.
2. **Connect:** add connection via `url_template` + secret refs → attach policy → run `learn` → SKP + capabilities saved as artifacts.
3. **Observe:** Studio shows schema, hot queries, security banner (TLS result/fingerprint).
4. **Plan:** `plan:diff` or `plan:schema-improve` produces a SIP with rationale; simulate.
5. **Apply:** online DDL with breaker + rollback snapshot; audit chain records actions.
6. **Govern:** toggle compliance mode (GDPR/SOX/HIPAA/PCI/SOC2) → masking/default policies apply.
7. **Scale:** use Workspace Agent for VPC databases; Web Studio remains thin.

---

## 19) Commitments (Product‑Level)

* **Dialectless forever:** No driver enums in code; only learned capabilities.
* **Secrets‑safe by design:** vault‑only credentials; short‑lived tokens for Agents.
* **Explainable autonomy:** every plan includes risk, rationale, and rollback IR.
* **Compliance as a feature:** evidence export in minutes, not days.
