Awesome — here’s a **publication-grade, single-canvas** spec you can paste straight into:

`docs/specs/policy/SQLx-Policy-Graph-and-RBAC-v4.0.md`

---

````markdown
# SQLx Policy Graph and RBAC v4.0  
*Deterministic Authorization, Compliance Obligations, and Explainable Decisions for the SQLx OS*  
**Version:** 4.0 **Status:** Stable **Owner:** NuBlox Labs — Policy Engine Team  

---

## Executive Summary  
The SQLx **Policy Graph** is the formal authorization and governance layer of the SQLx Operating System.  
It combines **role-based access control (RBAC)** with **attribute-based constraints (ABAC)** and **obligation rules** (masking, routing, approvals) to decide whether an operation may proceed and under what conditions.  
Decisions are **explainable** and **trace-linked**, feeding Observability for audit and Copilot for reinforcement learning.  
This document specifies the graph model, decision algorithm, authoring language, runtime APIs, telemetry mapping, and security posture.

---

## 1  Purpose and Scope  
- Provide a **deterministic, auditable** decision engine for DCL/TCL and query execution.  
- Enforce **data governance** (PII, residency, retention) and **least-privilege** principles.  
- Emit **explanations** (why allowed/denied) and **obligations** (what must happen).  
- Integrate with **AIR** (semantic tags), **Kernel** (gate), **Observability** (evidence), and **AI Copilot** (policy synthesis & tuning).

Out-of-scope: external IdP configuration, enterprise SSO wiring (covered in Security documents).

---

## 2  Conceptual Model

| Concept | Description |
|:--|:--|
| **Subject** | The actor (human or service) with roles and attributes. |
| **Object** | The data or resource (table, column, schema, export, policy API). |
| **Action** | Operation being performed (`SELECT`, `INSERT`, `EXPORT`, `DDL`). |
| **Context** | Request metadata (tenant, residency, purpose, time, risk, location). |
| **Policy** | A rule that evaluates (subject, object, action, context) → decision + obligations. |
| **Obligation** | A mandatory side condition (mask columns, route to RO, require approval). |
| **Policy Graph** | DAG linking roles, groups, resources, and constraint nodes into compiled evaluators. |

The Policy Graph compiles to a fast evaluator with short-circuit semantics and cached side-facts.

---

## 3  Data Model

### 3.1  Subjects and Roles

| Field | Type | Notes |
|:--|:--|:--|
| `subject.id` | string | `user:alice` or `svc:billing` |
| `subject.roles[]` | string[] | e.g., `workspace.admin`, `analyst`, `etl` |
| `subject.attrs` | map | `department=fin`, `mfa=true`, `risk=low` |

**RBAC Resolution**: roles may **inherit** other roles; cycles are rejected at compile time.

### 3.2  Objects and Classifiers

| Field | Type | Notes |
|:--|:--|:--|
| `object.kind` | enum | `table`, `column`, `schema`, `export`, `policy` |
| `object.id` | string | e.g., `db.public.users.email` |
| `object.tags` | map | `sensitivity=pii`, `residency=eu`, `retention=365d` |

Tags are **propagated** from AIR nodes into evaluation context.

### 3.3  Actions and Context

| Field | Type | Notes |
|:--|:--|:--|
| `action` | enum | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `DDL`, `EXPORT` |
| `context.tenant` | string | workspace/tenant key |
| `context.purpose` | enum | `oltp`, `etl`, `bi`, `ddl` |
| `context.location` | string | client/cluster region |
| `context.time` | instant | UTC now |
| `context.risk` | enum | `low`, `med`, `high` |
| `context.residency` | enum | `eu`, `uk`, `us`, … |
| `context.requestId` | string | `x-sqlx-trace-id` linkage |

---

## 4  Policy Language (SQLx Policy DSL)

The **Policy DSL** is a compact, declarative syntax compiled into the Policy Graph.

### 4.1  Syntax Overview

```policy
// Bind role capabilities
allow role analyst on action SELECT where object.tags.sensitivity in ["none","internal"]
  obligations = [mask_if("email","pii"), route("readReplica")]

// Deny cross-region egress for PII unless approved
deny when object.tags.sensitivity == "pii" and context.location != object.tags.residency
  unless context.approval == true
  reason "cross-region egress blocked"
  obligations = [mask_all(), log("pii_egress_denied")]

// Require MFA for EXPORT actions
require subject.attrs.mfa == true on action EXPORT
  reason "MFA required for export"
````

### 4.2  Semantics

* **Order:** `deny` rules have higher precedence than `allow`, unless an `unless` clause explicitly overrides with an approval token.
* **Obligations:** attached to the decision; Kernel must enforce or fail the request.
* **Variables:** `subject.*`, `object.*`, `context.*`, and `air.*` (from AIR tags).
* **Functions:** `mask(columns...)`, `mask_if(column, tag)`, `route("readReplica")`, `require_approval(scope)`, `throttle(qps)`, `log(topic)`.

### 4.3  Example Pack — “GDPR Core”

```policy
// Pseudonymize PII by default for analysts
allow role analyst on action SELECT where air.tags.sensitivity == "pii"
  obligations = [mask_if_tag("pii")]

// Residency constraint
deny when air.tags.residency != context.residency
  unless context.approval == true
  reason "data must remain in-region"

// Retention: block long-term access beyond policy
deny when now() - air.tags.createdAt > duration(object.tags.retention)
  reason "retention exceeded"
```

---

## 5  Compilation to the Policy Graph

The compiler transforms DSL → DAG:

1. **Parse**: construct AST nodes for rules, predicates, obligations.
2. **Normalize**: inline role inheritance, resolve constants, canonicalize tags.
3. **Index**: bucket rules by `action` and `object.kind` for O(1) dispatch.
4. **Emit**: per-action evaluators with short-circuit ordering (`deny` before `allow`).
5. **Freeze**: produce a signed, versioned graph artifact: `pol:<hash>`.

**Determinism**: equal input ⇒ equal `pol:<hash>`. Graphs are cached by hash.

---

## 6  Decision Algorithm

```txt
function DECIDE(subject, object, action, context, air):
  evaluator := graph[action][object.kind]
  state := {allow=false, obligations=[], reasons=[]}

  // 1) hard denies
  for rule in evaluator.denies:
    if rule.predicate(subject, object, context, air):
      if rule.unless and rule.unless(subject, object, context, air) == true:
        continue
      state.reasons.append(rule.reason)
      state.obligations.extend(rule.obligations)
      return DENY(state)

  // 2) allows
  for rule in evaluator.allows:
    if rule.predicate(subject, object, context, air):
      state.allow = true
      state.obligations.extend(rule.obligations)

  // 3) requires
  for rule in evaluator.requires:
    if !rule.predicate(subject, object, context, air):
      state.reasons.append(rule.reason)
      return DENY(state)

  if state.allow:
    return ALLOW(state)
  else:
    state.reasons.append("no matching allow")
    return DENY(state)
```

**Complexity**: O(Rₐₖ) per action/object-kind with small constants from indexing.

---

## 7  Obligations — Contract and Enforcement

Obligations become **execution constraints** the Kernel must satisfy or abort.

| Obligation                | Effect               | Kernel Enforcement                 |
| :------------------------ | :------------------- | :--------------------------------- |
| `mask(columns...)`        | redact named columns | projection rewrite / result filter |
| `mask_if(column, tag)`    | redact when tagged   | AIR tag check + projection         |
| `route("readReplica")`    | read-only routing    | UDR route to RO pool               |
| `throttle(qps)`           | limit request rate   | scheduler token bucket             |
| `require_approval(scope)` | gated execution      | approval token in context          |
| `log(topic)`              | structured audit     | TKB event with topic               |

If an obligation cannot be met (e.g., no RO replica), the Kernel **fails closed**.

---

## 8  Runtime API

### 8.1  TypeScript Interface

```ts
export type PolicyDecision = {
  allow: boolean;
  obligations: string[];
  reason?: string;
  policy_id: string;      // pol:<hash>
  rule_id?: string;       // stable rule id
};

export interface PolicyEngine {
  evaluate(ctx: ExecContext, air: AIRNode, obj: ObjectRef, action: Action): PolicyDecision;
  explain(traceId: string): PolicyDecision & { explanation: string };
}
```

`ExecContext` aligns with Kernel spec; `ObjectRef` addresses table/column/schema.

### 8.2  Kernel Integration Points

* **Pre-Resolve Hook**: evaluate policy before planning.
* **Post-Resolve Hook**: ensure obligations are applied (mask/route).
* **Violation Hook**: emit `policy.deny` with explanation.

---

## 9  Telemetry, Explainability, and Audit

Every decision emits ATS-compatible telemetry.

**Decision Event (simplified)**

```json
{
  "traceId": "sqlx-9f43",
  "timestamp": "2025-10-17T09:00:00Z",
  "component": "policy",
  "eventType": "policy",
  "payload": {
    "policy_id": "pol:0x8a4c…",
    "rule_id": "rule:gdpr-egress-01",
    "action": "SELECT",
    "object": "db.public.users.email",
    "allow": false,
    "obligations": ["mask_all"],
    "reason": "cross-region egress blocked"
  },
  "aiMetadata": {
    "decisionType": "enforce",
    "explanation": "PII with residency=eu requested from us-east-1",
    "confidence": 0.99
  },
  "compliance": { "classification": "restricted", "retentionDays": 365 }
}
```

* **Observability**: dashboards show allow/deny rates, obligation types, and hotspots.
* **Audit**: signed ledger entries with `policy_id`, `rule_id`, and diff of policy set per release.

---

## 10  RBAC Sets and Inheritance

### 10.1  Role Graph

* Roles compose via **DAG inheritance**; cyclic definitions rejected.
* **Effective permissions** are computed and cached per subject + workspace.

### 10.2  Default Roles (Recommended)

| Role              | Capabilities                                                |
| :---------------- | :---------------------------------------------------------- |
| `workspace.admin` | All actions; bypass with audit (never mask).                |
| `data.steward`    | Approvals, policy edit, retention management.               |
| `analyst`         | `SELECT` with default PII masking; no `EXPORT`.             |
| `etl`             | `INSERT/UPDATE/DELETE` on whitelisted schemas; no PII read. |
| `viewer`          | Read-only on `internal` sensitivity; masked PII.            |

---

## 11  Compliance Packs

Policy packs provide reusable rules for common frameworks.

| Pack    | Summary                                                                      |
| :------ | :--------------------------------------------------------------------------- |
| `gdpr`  | Residency, purpose limitation, PII masking defaults, right-to-erasure hooks. |
| `hipaa` | PHI classification, access logging, stricter export approvals.               |
| `sox`   | Change control, separation of duties, immutable audit.                       |

Packs are **composable** and can be **overridden** per tenant via delta files.

---

## 12  Security Posture

* **Source of Truth**: policy files are signed; runtime loads only verified artifacts.
* **Immutability**: active `policy_id` pinned per deployment; changes require rollout.
* **Fail-Closed**: on engine error or missing obligations, deny with explanation.
* **Secrets**: approval tokens and subject claims verified via mTLS/JWT with short TTL.
* **Supply Chain**: SBOM and signature verification for policy compiler binary.

---

## 13  Performance Targets

| SLI                  | Target       | Notes                         |
| :------------------- | :----------- | :---------------------------- |
| Decision latency p95 | < 1.5 ms     | in-memory compiled evaluators |
| Throughput per node  | ≥ 50k eval/s | under mixed rulesets          |
| Graph load time      | < 100 ms     | warm cache                    |
| Explain render       | < 10 ms      | human-readable reason strings |

---

## 14  Example End-to-End

**Request**: analyst in `eu-west-2` selects `users.email` (PII) from `eu` residency.
**Policy**: GDPR pack denies cross-region egress; same-region allows with `mask(email)`.
**Outcome**: In-region → ALLOW + `mask(email)`; cross-region → DENY + reason.
**Telemetry**: `policy.decision` with `allow=false/true`, obligations, and explanation.

---

## 15  Configuration and Deployment

```yaml
policy:
  packs: ["gdpr", "sox"]
  files:
    - policies/base.policy
    - policies/overrides/eu.policy
  approve:
    provider: "oidc"
    scope: "sqlx.policy.approve"
  cache:
    ttlSec: 600
```

Hot-reload supported with **graph hash** validation and atomic swap.

---

## 16  Open Questions (RFCs)

1. Should obligations allow **declarative row-level filters** at AIR time for ABAC?
2. How to standardize **approval workflows** (time-boxed vs. one-shot tokens)?
3. Should Copilot generate **policy diffs** from observed access patterns?
4. Cross-tenant **federated policies**: shared pack updates without data sharing?

---

## 17  Related Documents

* `docs/specs/air/SQLx-AIR-Spec-v4.0.md`
* `docs/specs/kernel/SQLx-Kernel-Spec-v4.0.md`
* `docs/specs/telemetry/SQLx-AI-Telemetry-Schema-v4.1.md`
* `docs/specs/observability/SQLx-Observability-and-SLOs-v4.0.md`
* `docs/security/SQLx-Security-Whitepaper-and-ThreatModel-v4.0.md`
* `docs/ai/SQLx-Copilot-Architecture-v1.0.md`

---

**Author:** NuBlox Engineering **Reviewed:** October 2025
**License:** NuBlox SQLx OS — Autonomous Database Framework

```

---