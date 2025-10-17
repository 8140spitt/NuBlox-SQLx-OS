# SQLx API Gateway and Emitter v1.0  
*Unified REST, GraphQL, and Observability Fabric*  
**Version:** 1.0 **Status:** Stable Baseline under `@nublox/sqlx-api`

---

## 1. Executive Summary  
The SQLx API Gateway and Emitter is the external surface of the NuBlox SQLx Operating System.  
It unifies command execution, schema management, telemetry emission, and AI orchestration into a single, zero-dependency framework written entirely in TypeScript.  
Its purpose is to expose every internal capability of SQLx OS — from driver protocols to observability traces — through a coherent programmable interface that remains secure, policy-driven, and dialect-agnostic.

---

## 2. Purpose and Scope  
The Gateway allows any client, service, or AI agent to communicate with the SQLx Core Kernel using standard protocols (HTTP, GraphQL, WebSocket, or gRPC) without external libraries.  
It encapsulates authentication, caching, policy enforcement, and telemetry in one unified runtime process, ensuring that SQLx OS can operate identically in desktop, server, and distributed cluster modes.

The Emitter component extends this by providing continuous event and metric streaming.  
Together, Gateway and Emitter form the public interface layer of the Autonomous SQLx Fabric.

---

## 3. Architectural Intent  
The design philosophy is grounded in five principles:

1. **Zero Dependency:** The Gateway is self-hosted and does not rely on Express, Fastify, or third-party frameworks.  
2. **Dialect Agnosticism:** A universal schema model allows MySQL, PostgreSQL, SQLite, and future dialects to be addressed uniformly.  
3. **AI Orchestration:** SQLx Copilot integrates directly, enabling adaptive query rewriting and intelligent routing.  
4. **Policy Governance:** All access passes through the compiled Policy Graph, ensuring consistent enforcement of RBAC and compliance rules.  
5. **Observability First:** Every interaction generates structured telemetry, metrics, and trace envelopes for real-time introspection.

---

## 4. System Overview  
At runtime the Gateway fabric sits between client applications and the SQLx Kernel.  
Incoming requests are normalised, authenticated, and enriched with workspace context before being evaluated by the Policy Engine.  
Queries may then be optimised or rewritten by the AI Orchestrator before reaching the Kernel for execution.  
Responses are streamed back to the caller with trace metadata and optional cached results.

The Emitter subsystem continuously publishes trace data, audit logs, and event notifications.  
These can be consumed by SQLx Studio, enterprise monitoring stacks, or third-party observability tools.

---

## 5. Primary Interfaces  
**REST API** provides deterministic endpoints for SQL execution, schema diffing, health checks, and cache control.  
**GraphQL API** exposes composable query access where multiple resources can be requested in a single call.  
**WebSocket Emitter** streams live telemetry, log entries, and audit events.  
**gRPC / IPC Channel** serves as the internal binary transport between Gateway and Kernel nodes in clustered deployments.

---

## 6. Request Lifecycle  
When a client issues a request, the lifecycle proceeds as follows:  
1. The Gateway validates the authentication token and establishes workspace scope.  
2. The Policy Engine checks permissions against the compiled Policy Graph.  
3. The AI Rewriter analyses and may transform the SQL statement for optimisation or dialect alignment.  
4. The Core Kernel executes the validated query or command.  
5. The result, along with latency and policy context, is returned to the client and simultaneously emitted as telemetry.

Each request carries a unique `x-sqlx-trace-id` to link execution, metrics, and audit records end-to-end.

---

## 7. Middleware Chain  
The internal middleware pipeline comprises the following layers:

- **Authentication and Authorization:** Validates identity and enforces workspace scope.  
- **Policy Enforcement:** Evaluates the Policy Graph to permit, deny, or modify operations.  
- **Caching Layer:** Applies deterministic caching for repeatable queries and handles invalidation.  
- **Telemetry Tap:** Captures and emits metrics, traces, and log envelopes.  
- **AI Interceptor:** Provides semantic analysis and adaptive optimisation.  
- **Compressor/Serializer:** Negotiates payload formats and transmission framing.

Each layer operates as a composable function within the lightweight SQLx runtime kernel.

---

## 8. Caching and Invalidation  
SQLx employs a dual-tier cache model.  
A memory-tier least-recently-used store accelerates frequent queries within each worker process.  
A storage-tier persistent cache maintains results across restarts using the SQLx Store abstraction.  
Invalidation occurs automatically whenever DDL or DML events modify relevant objects.  
Additionally, AI Copilot can dynamically adjust cache duration based on observed access entropy and workload patterns.

---

## 9. Observability and Telemetry  
Every Gateway operation produces structured telemetry records containing timestamps, latency, status, row counts, and workspace context.  
These records are emitted to the Observability subsystem and available through the `/metrics` endpoint, the GraphQL telemetry resolvers, and live emitter streams.  
The data model aligns with the `SQLx-AI-Telemetry-Schema-v4.0` specification, enabling correlation between performance metrics, policy events, and AI rewrite decisions.

---

## 10. Security Model  
Security is enforced through signed workspace tokens, mTLS communication, and immutable audit logging.  
All queries and responses are trace-linked for forensic audit.  
Sensitive data may be redacted in-flight according to active compliance policies.  
The design aligns with the principles documented in `SQLx-Security-Whitepaper-and-ThreatModel-v4.0.md`.

---

## 11. AI Integration  
The Gateway natively interfaces with the AI Orchestrator component of SQLx Copilot.  
Before execution, each request can be semantically analysed to:  
- Recommend or apply optimisations  
- Predict result-set cardinality and cost  
- Suggest schema or index improvements  
- Route queries to optimal nodes in multi-host configurations  
AI annotations are preserved within telemetry to provide explainable automation.

---

## 12. Deployment Modes  
Four standard topologies are supported:

- **Embedded:** The Gateway runs inside the SQLx Studio desktop runtime for offline use.  
- **Headless:** A standalone Node.js service exposing REST, GraphQL, and Emitter interfaces.  
- **Distributed:** Multiple Gateway nodes front one or more Kernel clusters for horizontal scale.  
- **Multi-Tenant SaaS:** Isolated Gateway instances per workspace, each maintaining its own cache and policy domain.

Configuration is declarative via JSON or environment variables, defining port, SSL, worker count, telemetry sinks, and policy graph location.

---

## 13. Compliance and Audit Integration  
The Compliance Engine attaches to the Gateway to enforce data retention, masking, and policy verification.  
All transactions are recorded with immutable audit hashes.  
Administrators can run compliance queries or simulate enforcement through the `/v1/policy/evaluate` endpoint.  
This ensures that every external request complies with internal governance frameworks such as GDPR, SOX, and HIPAA.

---

## 14. Future Roadmap  
Planned extensions for version 2.0 include:

- Event-driven GraphQL subscriptions for live dataset streaming.  
- AI-generated OpenAPI documentation and self-describing schema endpoints.  
- WebAssembly edge deployment for near-data execution.  
- Adaptive SLA tuning driven by Copilot feedback loops.  
- Integration with external identity providers via federated SSO.

---

## 15. Related Specifications  
- `docs/specs/kernel/SQLx-Kernel-Spec-v4.0.md`  
- `docs/specs/policy/SQLx-Policy-Graph-and-RBAC-v4.0.md`  
- `docs/specs/telemetry/SQLx-AI-Telemetry-Schema-v4.0.md`  
- `docs/ai/SQLx-Copilot-Architecture-v1.0.md`  
- `docs/security/SQLx-Security-Whitepaper-and-ThreatModel-v4.0.md`

---

**Author:** NuBlox Engineering **Reviewed:** October 2025  
**License:** NuBlox SQLx OS — Autonomous Database Framework
