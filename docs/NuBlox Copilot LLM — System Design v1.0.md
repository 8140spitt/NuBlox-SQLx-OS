# NuBlox Copilot LLM — System Design v1.0

> **Mandate:** NuBlox Copilot uses a **NuBlox‑native LLM** — no third‑party LLMs at runtime. Models run **locally or on‑prem**, are trained/fine‑tuned on SQLx IR, capability matrices, telemetry fingerprints, and curated SQL corpora. All inference is **air‑gapped** and governed by SQLx policies.

---

## 1) Model Family

| Model                  | Params | Context | Target            | Notes                                              |
| ---------------------- | -----: | ------: | ----------------- | -------------------------------------------------- |
| **NBX‑DBA‑Edge**       |  ~1.3B |  16–32k | Laptop/desktop    | int4/int8 quant; fast tool‑use; local Studio       |
| **NBX‑DBA‑Pro**        |    ~7B |     64k | Team server       | preferred Studio backend; balanced latency/quality |
| **NBX‑DBA‑Enterprise** |   ~13B |    128k | Regulated on‑prem | best reasoning; GPU optional                       |

---

## 2) Tokenization & Special Tokens

* SQL/IR‑aware tokenizer.
* Reserved tokens: `<IR:ddl>`, `<IR:dml>`, `<IR:dql>`, `<IR:dcl>`, `<IR:tcl>`, `<CAP:...>`, `<SNG:node>`, `<PLAN:step>`.

---

## 3) Training & Fine‑Tuning

* **Pretrain Mix:** permissively‑licensed SQL corpora; technical text on RDBMS; planner docs.
* **Supervised Fine‑Tuning:** IR↔SQL pairs, migration recipes, online DDL strategies, compliance narratives.
* **RLHF/RLAIF:** reward: zero‑downtime, minimal lock time, correctness vs simulated replay; penalties: unsafe drops, missing rollback.
* **Continual Learning:** opt‑in from SKP/SNG snapshots; anonymized; never ships outside customer boundary.

---

## 4) Inference & Tools

* Tooling API: `plan.diff`, `plan.schemaImprove`, `caps.query`, `sng.search`, `explain`, `audit.note`.
* Deterministic mode (temperature clamp, top‑p cap) for governance‑critical paths.
* JSON‑only output schemas for plans and policies; strict validators.

```ts
const res = await copilot.planSchemaImprove({ goals: { latencyPct: -30 } });
```

---

## 5) Privacy & Compliance

* No outbound network; all data local/on‑prem.
* Redaction/masking pipeline on sampled data; PII tags propagated from IR.
* Forensic timeline logs prompts/tool‑calls; hash‑chained, signed.

---

## 6) Guardrails & Safety

* Must emit rollback IR for any DDL.
* Policy gates enforced before apply; compliance modes can veto plans.
* Dangerous ops require human approval + snapshot presence.

---

## 7) Deployment Patterns

* **Local:** Edge model embedded in Studio for offline dev.
* **Team Server:** Pro model behind `@nublox/sqlx-copilot` service.
* **Enterprise:** HA pair with GPU + encrypted model store; SSO/SAML.

---

## 8) Public API (SDK/CLI)

```ts
import { Copilot } from '@nublox/sqlx-copilot';
const cp = await Copilot.start({ model: 'nbx-dba-pro', deterministic: true });
await cp.useTools(['plan.diff','sng.search']);
const sip = await cp.plan.schemaImprove({ goals: { storagePct: -10 } });
```

CLI:

```
sqlx copilot:start --model nbx-dba-pro --deterministic
sqlx plan:schema-improve --goals latency=-30
```

---

## 9) Roadmap (H1 2026)

* Context window expansion; LoRA adapters per dialect idiosyncrasies.
* Mixed‑initiative planning (Copilot asks for targeted probes).
* On‑device vector engine for SNG querying.
