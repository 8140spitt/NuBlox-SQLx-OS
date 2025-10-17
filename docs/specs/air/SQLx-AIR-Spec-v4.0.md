Got it — that’s an excellent draft and a strong foundation.
Here’s a **clean, world-class rewrite** of your *Abstract Intermediate Representation (AIR) Specification v4.0* as a single copy-and-paste Markdown file.
It keeps every table, code block, and technical example you’ve authored, but applies uniform styling, consistent heading hierarchy, tightened language, and cross-link references to the rest of SQLx OS.

You can drop this directly into:
`docs/specs/air/SQLx-AIR-Spec-v4.0.md`

---

````markdown
# NuBlox SQLx OS — Abstract Intermediate Representation (AIR) Specification v4.0  
*Canonical, Dialect-Neutral SQL Model for AI Reasoning and Optimization*  
**Version:** 4.0 **Status:** Stable **Owner:** NuBlox Labs — SQLx Core Team  

---

## 1  Purpose  
The **Abstract Intermediate Representation (AIR)** defines the canonical, dialect-neutral graph model that encodes SQL semantics for parsing, optimisation, translation, policy analysis, and AI reasoning.  
AIR provides a **lossless bridge** between vendor dialects and forms the foundation of the SQLx AI Fabric’s learning and introspection systems.

---

## 2  Overview  
AIR functions as the **lingua franca** between SQL dialects, the AI Fabric, and the Policy and Observability engines.  
It is a structured, typed, semantically rich intermediate graph with the following key properties:

| Property | Description |
|:--|:--|
| **Dialect-Agnostic** | Abstracts syntax differences while preserving intent and semantics. |
| **Lossless** | Round-trips precisely back to the originating dialect. |
| **Composable** | Supports incremental build, merge, and transformation. |
| **Traceable** | Every node has a stable, globally unique ID for lineage. |
| **Serializable** | Exports as JSON or binary for storage and transport. |
| **AI-Friendly** | Flattened, vector-ready graph form for machine learning. |

---

## 3  Core Concepts  

| Concept | Description |
|:--|:--|
| **AIRNode** | Atomic element — statement, clause, expression, literal, function, identifier. |
| **AIRGraph** | Directed Acyclic Graph (DAG) of AIRNodes representing semantic relationships. |
| **AIRContext** | Dialect, engine, and capability metadata. |
| **AIRPlan** | Logical, dialect-free execution plan derived from an AIRGraph. |
| **AIRCaps** | Declares dialect features, limits, and functions. |
| **AIRTrace** | Trace metadata linking nodes to source spans and observability IDs. |

---

## 4  Grammar Definition (BNF-Lite)

```bnf
<statement> ::= <select> | <insert> | <update> | <delete> | <create> | <alter> | <drop> | <transaction>

<select> ::= SELECT <projection> FROM <source> [WHERE <predicate>] [GROUP BY <expr>] [ORDER BY <expr>] [LIMIT <num>]
<insert> ::= INSERT INTO <table> (<columns>) VALUES (<values>)
<update> ::= UPDATE <table> SET <assignments> [WHERE <predicate>]
<delete> ::= DELETE FROM <table> [WHERE <predicate>]

<projection> ::= <expr> {, <expr>}
<source> ::= <table> | <join> | <subquery>
<join> ::= <source> JOIN <source> [ON <predicate>]
<predicate> ::= <expr> <op> <expr>
<expr> ::= <literal> | <column> | <func> | <subquery>
<literal> ::= STRING | NUMBER | BOOLEAN | NULL
````

Vendor constructs such as `LIMIT`, `TOP`, or `ROWNUM` are normalised into uniform AIR nodes.

---

## 5  Node Model

```ts
export interface AIRNode {
  id: string;                        // globally unique e.g. "air:stmt:Q-9f3a"
  type: "statement"|"clause"|"expr"|"literal"|"function"|"identifier";
  kind: string;                      // e.g. SELECT, WHERE, EQ, SUM
  children?: AIRNode[];
  value?: string|number|boolean|null;
  alias?: string;
  tags?: Record<string,string>;      // e.g. sensitivity="pii"
  span?: { start:number; end:number };
  lineage?: string[];                // parent→child lineage IDs
}
```

---

## 6  Canonical Normalisation Rules

Normalisation converts vendor SQL into canonical AIR form.

| Dialect Example        | Canonical AIR                  |
| :--------------------- | :----------------------------- |
| MySQL `LIMIT 10`       | `LIMIT count=10 offset=0`      |
| PostgreSQL `ILIKE`     | `LIKE (case_insensitive=true)` |
| SQL Server `TOP 10`    | `LIMIT count=10`               |
| Oracle `ROWNUM <= 10`  | `LIMIT count=10`               |
| JSON function variants | Canonical `JSON_EXTRACT` node  |

**Process**

1. Parse vendor syntax → vendor AST.
2. Transform → normalised AIR nodes (resolving synonyms).
3. Annotate dialect origin and capabilities.
4. Persist node UUIDs for deterministic lineage.

---

## 7  Logical AIRPlan Construction

```ts
export interface AIRPlan {
  id: string;
  root: AIRNode;
  steps: AirStep[];
  cost?: number;
  hints?: string[];
}

export interface AirStep {
  id: string;
  op: "scan"|"filter"|"join"|"aggregate"|"sort"|"limit"|"output";
  inputs?: string[];
  outputs?: string[];
  predicates?: AIRNode[];
  cost?: number;
}
```

**Derivation Rules**

1. Traverse AIRGraph topologically.
2. Infer logical operation sequence.
3. Estimate cost via capability model.
4. Emit plan to UDR (lowering stage).

---

## 8  Encoding and Serialisation

### JSON Representation

```json
{
  "version": "4.0",
  "root": "air:stmt:Q-9f3a",
  "nodes": [
    {"id":"air:stmt:Q-9f3a","type":"statement","kind":"SELECT"},
    {"id":"air:expr:C1","type":"expr","kind":"COLUMN","value":"name"},
    {"id":"air:expr:C2","type":"expr","kind":"COLUMN","value":"age"},
    {"id":"air:clause:WHERE1","type":"clause","kind":"WHERE","children":["air:expr:P1"]},
    {"id":"air:expr:P1","type":"expr","kind":"GT","children":["air:expr:C2",{"type":"literal","value":30}]}
  ]
}
```

### Binary Encoding

Optional Protocol Buffers or Cap’n Proto for low-latency pipelines.
Node ordering is deterministic; each graph receives a stable 64-bit hash.

---

## 9  Validation Rules

| Check                          | Description                                      |
| :----------------------------- | :----------------------------------------------- |
| **Unique IDs**                 | No duplicate node identifiers.                   |
| **Type Safety**                | Expression operands must share compatible types. |
| **Referential Integrity**      | All child IDs must exist.                        |
| **Normalisation Completeness** | No vendor tokens remain.                         |
| **Deterministic Hash**         | Graph hash remains stable across runs.           |

Violations yield structured diagnostics containing `severity`, `node`, and `hint`.

---

## 10  AI Integration (Vectorisation Schema)

```ts
export interface AirEmbedding {
  id: string;
  vector: number[];
  meta: { type:string; kind:string; dialect?:string; sensitivity?:string };
}
```

* AIRGraphs are flattened into token sequences for transformer models.
* Embeddings are cached with model version IDs.
* Reinforcement signals attach to AIR IDs (`reward:number`).

---

## 11  Policy and Compliance Hooks

AIR nodes carry semantic tags consumed by the Policy Graph (π):

| Tag               | Meaning                              |
| :---------------- | :----------------------------------- |
| `sensitivity=pii` | Personally identifiable information. |
| `region=eu`       | Data residency scope.                |
| `retention=365d`  | Lifecycle rule.                      |
| `mask=true`       | Requires runtime redaction.          |

Policy runtime evaluates these tags to enforce masking or deny egress.

---

## 12  Observability Integration

AIR operations emit telemetry through the Telemetry Kernel Bus (TKB):

| Event                | Description                           |        |                          |
| :------------------- | :------------------------------------ | ------ | ------------------------ |
| `air.parse.start     | ok                                    | error` | SQL parsing phase.       |
| `air.normalize.start | ok                                    | error` | Canonicalisation.        |
| `air.plan.start      | ok                                    | error` | Logical plan generation. |
| `air.hash.mismatch`  | Non-deterministic structure detected. |        |                          |

Each event includes `trace_id` and `air_id` for cross-system correlation.

---

## 13  Open Questions (RFC References)

1. Should AIR extend to non-relational operations (JSON, vector, graph)?
2. Can AIR reduce to a minimal “Algebra Core” for LLM reasoning?
3. How should node versioning evolve with dialects?
4. Optimal binary encoding for GPU inference?

---

## 14  Appendix — Round-Trip Example

**Source (MySQL)**

```sql
SELECT name, age FROM users WHERE age > 30 LIMIT 10;
```

**AIR (normalised)**

```json
{
  "root": "air:stmt:Q-9f3a",
  "nodes": [
    {"id":"air:stmt:Q-9f3a","type":"statement","kind":"SELECT",
     "children":["air:expr:C1","air:expr:C2","air:clause:WHERE1","air:clause:LIMIT1"]},
    {"id":"air:expr:C1","type":"expr","kind":"COLUMN","value":"name"},
    {"id":"air:expr:C2","type":"expr","kind":"COLUMN","value":"age"},
    {"id":"air:clause:WHERE1","type":"clause","kind":"WHERE","children":["air:expr:P1"]},
    {"id":"air:expr:P1","type":"expr","kind":"GT","children":["air:expr:C2",{"type":"literal","value":30}]},
    {"id":"air:clause:LIMIT1","type":"clause","kind":"LIMIT","value":10}
  ]
}
```

**Re-emitted (PostgreSQL)**

```sql
SELECT name, age FROM users WHERE age > 30 LIMIT 10;
```

✅ Lossless, semantically identical, dialect-neutral.

---

## 15  Related Documents

* `docs/specs/kernel/SQLx-Kernel-Spec-v4.0.md`
* `docs/specs/policy/SQLx-Policy-Graph-and-RBAC-v4.0.md`
* `docs/specs/telemetry/SQLx-AI-Telemetry-Schema-v4.1.md`
* `docs/ai/SQLx-Copilot-Architecture-v1.0.md`

---

**Author:** NuBlox Engineering **Reviewed:** October 2025
**License:** NuBlox SQLx OS — Autonomous Database Framework

```

---

✅ **Result**
- All sections merged into one continuous, fully formatted canvas.  
- Markdown tables and code fences preserved exactly.  
- Heading order fixed and cross-links added for kernel/policy/AI consistency.  

Would you like me to proceed next with rewriting  
`docs/specs/kernel/SQLx-Kernel-Spec-v4.0.md`  
in the same single-canvas, publication-ready style?
```
