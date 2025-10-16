---
title: "NuBlox SQLx OS — Abstract Intermediate Representation (AIR) Specification v4.0 (Draft)"
status: Draft
version: 4.0.0-draft.1
owners:
  - Stephen Spittal (@8140spitt)
  - NuBlox Labs — SQLx Core Team
reviewers:
  - AI Fabric Team
  - Driver Fabric Team
  - Policy Engine Team
created: 2025-10-16
updated: 2025-10-16
---

> **Purpose** — The AIR (Abstract Intermediate Representation) defines the canonical, dialect-neutral model that represents SQL semantics for parsing, optimization, dialect translation, policy analysis, and AI reasoning.  
> It enables lossless round-trip transformation between vendor dialects and provides the foundation for the AI Fabric’s learning models.

---

# 1. Overview

AIR acts as the **lingua franca** between SQL dialects, the AI Fabric, and policy/observability engines.  
It is a structured, typed, semantically rich intermediate graph with the following properties:

| Property | Description |
|:--|:--|
| **Dialect-Agnostic** | Abstracts syntax differences while preserving semantics |
| **Lossless** | Every construct can be emitted back to its original dialect |
| **Composable** | Supports incremental build and transformation |
| **Traceable** | Each node has a unique, stable ID for lineage |
| **Serializable** | JSON and binary encodings for storage and transport |
| **AI-Friendly** | Flattened graph form suitable for vectorization and embedding |

---

# 2. Core Concepts

| Concept | Description |
|:--|:--|
| **AIRNode** | Fundamental unit (statement, clause, expression, literal, function) |
| **AIRGraph** | DAG of AIRNodes linked by edges (semantic relationships) |
| **AIRContext** | Metadata about dialect, engine capabilities, and runtime |
| **AIRPlan** | Logical execution plan derived from an AIRGraph |
| **AIRCaps** | Dialect capabilities (features, limits, functions) |
| **AIRTrace** | Trace metadata linking nodes to source spans and observability IDs |

---

# 3. Grammar Definition (BNF-Lite)

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
```

The canonical parser expands vendor-specific syntax (e.g., `LIMIT`, `TOP`, `ROWNUM`) into uniform nodes.

---

# 4. Node Model

```ts
export interface AIRNode {
  id: string;                        // globally unique (e.g., air:stmt:Q-9f3a)
  type: "statement"|"clause"|"expr"|"literal"|"function"|"identifier";
  kind: string;                      // e.g., SELECT, WHERE, EQ, SUM
  children?: AIRNode[];
  value?: string|number|boolean|null;
  alias?: string;
  tags?: Record<string,string>;      // e.g., sensitivity="pii"
  span?: {start:number; end:number}; // original SQL offsets
  lineage?: string[];                // parent→child lineage ids
}
```

---

# 5. Canonical Normalization Rules

Normalization converts raw SQL into the canonical AIR form.  
Examples:

| Dialect Example | Canonical AIR |
|:--|:--|
| MySQL: `LIMIT 10` | `LIMIT count=10 offset=0` |
| PostgreSQL: `ILIKE` | `LIKE (case_insensitive=true)` |
| SQL Server: `TOP 10` | `LIMIT count=10` |
| Oracle: `ROWNUM <= 10` | `LIMIT count=10` |
| JSON function variants | Canonical `JSON_EXTRACT` node |

**Normalization steps**
1. Parse vendor syntax → vendor AST  
2. Transform → normalized AIR nodes (resolving synonyms)  
3. Annotate dialect origin and capabilities  
4. Persist node UUIDs for lineage tracking  

---

# 6. Logical AIRPlan Construction

AIRPlan = deterministic, dialect-free logical plan.

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

Plan derivation rules:
1. Walk AIRGraph topologically  
2. Infer operation sequence  
3. Estimate cost via feature/cap model  
4. Emit to UDR for lowering  

---

# 7. Encoding & Serialization

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
- Protocol Buffers or Cap’n Proto optional for low-latency pipelines.  
- Node ordering deterministic; stable 64-bit hash for integrity.

---

# 8. Validation Rules

| Check | Description |
|:--|:--|
| **Unique IDs** | No duplicate node IDs in a graph |
| **Type Safety** | Expression operands must share compatible types |
| **Referential Integrity** | All child IDs must exist |
| **Normalization Completeness** | No vendor tokens remain |
| **Deterministic Hash** | Graph hash stable across runs |

Violations result in structured diagnostics with `severity`, `node`, and `hint`.

---

# 9. AI Integration (Vectorization Schema)

AI agents consume vectorized AIR graphs.  
Each node is embedded using structural + semantic tokens.

```ts
export interface AirEmbedding {
  id: string;
  vector: number[];         // dense representation
  meta: {type:string; kind:string; dialect?:string; sensitivity?:string};
}
```

- Graphs are flattened into sequences for transformer models.  
- Embeddings are cached with versioned model IDs.  
- Reinforcement signals attach to AIR IDs (`reward: float`).

---

# 10. Policy & Compliance Hooks

AIR nodes carry **tags** for compliance classification.  
These tags flow into the Policy Graph (π):

| Tag | Meaning |
|:--|:--|
| `sensitivity=pii` | Personally identifiable data |
| `region=eu` | Data residency scope |
| `retention=365d` | Lifecycle rule |
| `mask=true` | Requires runtime redaction |

Policy runtime inspects tags to enforce masking, deny egress, or request approval.

---

# 11. Observability

AIR node lifecycle events emit telemetry via TKB:

| Event | Description |
|:--|:--|
| `air.parse.start|ok|error` | SQL parsing |
| `air.normalize.start|ok|error` | Canonicalization |
| `air.plan.start|ok|error` | Logical plan generation |
| `air.hash.mismatch` | Non-deterministic structure detected |

All events correlate with `trace_id` and `air_id`.

---

# 12. Open Questions (RFC Links)

1. Should AIR support non-relational extensions (JSON, vector, graph ops)?  
2. Can AIR be reduced to a minimal “Algebra Core” for LLM reasoning?  
3. How to version AIR nodes when dialects evolve?  
4. What’s the optimum binary encoding for GPU inference?

---

# 13. Appendix — Example AIR Round-Trip

**Source (MySQL)**  
```sql
SELECT name, age FROM users WHERE age > 30 LIMIT 10;
```

**AIR (normalized)**  
```json
{
  "root": "air:stmt:Q-9f3a",
  "nodes": [
    {"id":"air:stmt:Q-9f3a","type":"statement","kind":"SELECT","children":["air:expr:C1","air:expr:C2","air:clause:WHERE1","air:clause:LIMIT1"]},
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

✅ *Lossless, semantically identical, dialect-neutral.*

---
