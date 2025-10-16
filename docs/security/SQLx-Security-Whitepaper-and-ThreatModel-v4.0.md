---
title: "NuBlox SQLx OS — Security Architecture & Threat Model v4.0 (Draft)"
status: Draft
version: 4.0.0-draft.1
owners:
  - Stephen Spittal (@8140spitt)
  - NuBlox Labs — Security & Compliance
reviewers:
  - Kernel Team
  - Policy (π) Team
  - SRE & AI Fabric
created: 2025-10-16
updated: 2025-10-16
---

> **Purpose** — Define the **security model, threat landscape, mitigations, and assurance controls** for the SQLx Operating System.  
> This document integrates privacy, compliance, and AI governance to deliver an enterprise-grade, verifiable secure data platform.

---

# 1. Security Objectives

| Objective | Description |
|:--|:--|
| **Confidentiality** | Protect data in transit, at rest, and during AI processing |
| **Integrity** | Ensure correctness and tamper-resistance of code, configuration, and data |
| **Availability** | Maintain operational continuity under failure or attack |
| **Auditability** | Produce immutable evidence for every critical event |
| **Governance** | Enforce policy-driven control with explainable decisions |
| **Privacy** | Minimize exposure and apply least-privilege + data minimization |

---

# 2. Security Architecture (High-Level)

```mermaid
flowchart LR
    CLI[Client / Studio] --> API[SQLx Control Plane]
    API --> KRN[Kernel]
    KRN --> UDR[Universal Dialect Runtime]
    UDR --> DRV[Dialect Drivers]
    DRV --> DB[(Database Engines)]
    KRN --> PI[Policy π]
    KRN --> ATS[Telemetry Bus (ATS)]
    KRN --> AUD[Audit Ledger]
    ATS --> OBS[Observability Stack]
    PI --> PAP[Policy Admin]
    AI[AI Fabric] --> KRN
```

Security layers:
- Network (TLS, mTLS)
- Identity (OIDC/JWT/MFA)
- Policy (π engine)
- Data (encryption & masking)
- AI (model governance)
- Audit (signed ledger)

---

# 3. Threat Model (STRIDE Framework)

| Category | Threat | Mitigation |
|:--|:--|:--|
| **Spoofing** | Impersonation of users/services | OIDC + short-lived JWT + mTLS mutual auth |
| **Tampering** | Altered migration scripts, ledger entries | Signed artifacts, immutability checks, content hashes |
| **Repudiation** | Users deny actions | Ledger append-only, PKI signatures, non-repudiation logs |
| **Information Disclosure** | PII leakage via queries or telemetry | Masking obligations, redaction, encryption, DLP |
| **Denial of Service** | Flooding, protocol abuse | Rate limiting, query guards, autoscaling |
| **Elevation of Privilege** | Bypassing roles or approvals | RBAC/ABAC/π enforcement, least privilege, MFA on break-glass |

---

# 4. Identity & Access Management (IAM)

- **AuthN**: OIDC (Google, AzureAD, GitHub, SAML), service accounts via signed JWT.  
- **AuthZ**: Policy Graph π + RBAC Matrix.  
- **MFA enforcement** for break-glass, DDL, export.  
- **Key rotation** every 90 days; automated via vault API.  
- **Session isolation** per workspace; token scope includes tenant, region, version.

Example token claim:
```json
{
  "sub": "user:8140spitt",
  "tenant": "acme",
  "workspace": "prod-eu",
  "roles": ["analyst"],
  "mfa": true,
  "exp": 1760412345
}
```

---

# 5. Data Protection

| Layer | Control |
|:--|:--|
| **Transit** | TLS 1.3+ mandatory; HSTS for HTTP endpoints; OCSP stapling |
| **At Rest** | AES-256-GCM or ChaCha20-Poly1305 via storage backend |
| **Column Level** | Transparent data encryption + masking policy |
| **Backups** | Encrypted object store + key separation |
| **AI Artifacts** | Encrypted model weights & embeddings |
| **Key Mgmt** | HSM integration; keys never leave module |

**PII classification tags** flow from AIR → ATS → Policy → Audit.

---

# 6. Secure Development Lifecycle (SDL)

1. **Design Review** — threat modeling per module (kernel, driver, AI).  
2. **Code Scanning** — SAST (Semgrep, CodeQL), dependency check (OSV).  
3. **Runtime Scanning** — container image CVE scanning (Trivy).  
4. **Secrets Detection** — pre-commit hooks + CI scanning.  
5. **Pen Tests** — quarterly, external, covering drivers, kernel, studio.  
6. **SBOM Generation** — every release via CycloneDX.  
7. **Supply-Chain Signing** — sigstore (cosign) for all artifacts.

---

# 7. Network Security & Segmentation

- **Zero-Trust topology**: every connection authenticated, encrypted.  
- **Control Plane Isolation**: API and data planes separated.  
- **Mesh Mode**: workspace-scoped service identities (SPIFFE/SPIRE).  
- **Ingress**: WAF + rate limits.  
- **Egress**: policy-controlled, logged via π obligations.  

---

# 8. AI Governance & Model Safety

- **Explainability**: all AI actions (plan rewrites, recommendations) include rationale metadata.  
- **Safety Filters**: prevent model from generating unsafe SQL.  
- **Privacy**: training on federated, anonymized data with DP guarantees.  
- **Versioning**: model weights tracked via ledger with signatures.  
- **Rollback**: any AI agent can be disabled via feature flag.  

```json
{
  "agent": "optimizer-v2",
  "version": "2.3.1",
  "sha256": "ab12...",
  "policy": {"sandbox": true, "human_review": true}
}
```

---

# 9. Policy Enforcement (π Integration)

- Policy evaluation precedes every query execution.  
- Obligations include masking, routing, approval.  
- Policy violations logged in ATS + ledger.  
- Default stance: **deny-by-default** for undefined actions.

---

# 10. Audit Ledger

Immutable, append-only record of all sensitive operations.

| Field | Description |
|:--|:--|
| `id` | UUIDv7 |
| `ts` | ISO8601 timestamp |
| `actor` | user/service |
| `action` | SQLx operation |
| `decision` | permit/deny |
| `obligations` | mask, route, approval |
| `signature` | PKI signature |
| `prev_hash` | chain of custody |

Ledger export → Parquet (analytics) + signed JSON (compliance).

---

# 11. Incident Response

**Detection Sources:** ATS alerts, anomaly detection, IDS, SOC feeds.  
**Workflow:** triage → containment → mitigation → evidence → lessons learned.  
**Automation:** auto-isolation of compromised tenants, token revocation, and trace replay for forensics.  
**Retention:** 1 year min.  
**Integration:** Slack/PagerDuty webhooks; evidence stored in immutable object store.

---

# 12. Compliance Mapping

| Framework | Coverage |
|:--|:--|
| **GDPR** | Residency, masking, DPO roles, audit export |
| **ISO 27001** | A.12, A.18 (logging, compliance) |
| **SOC 2 Type II** | CC6–CC9 (security, availability, confidentiality) |
| **HIPAA** | PHI masking, audit logging, access controls |
| **PCI DSS** | PAN encryption, masking obligations |
| **NIST 800-53** | AC, AU, SC, SI controls mapped to modules |

---

# 13. Security Telemetry (ATS)

All security events emit to ATS `sec.*` category:

| Event | Description |
|:--|:--|
| `sec.auth.success|failure` | login outcome |
| `sec.tls.established` | handshake complete |
| `sec.key.rotate` | key rotation completed |
| `sec.policy.violation` | π deny event |
| `sec.breakglass.used` | emergency override invoked |

---

# 14. Residual Risks & Future Enhancements

| Area | Risk | Mitigation |
|:--|:--|:--|
| **Third-party libraries** | Potential CVEs | SBOM + auto patch pipeline |
| **LLM mis-suggestions** | Incorrect rewrites | Policy guardrail & sandbox |
| **Operator error** | Policy misconfig | Dual approval, dry-run default |
| **Zero-day exploit** | Unforeseen vuln | Bug bounty, 24h patch SLA |

Future: confidential computing (TEE) for kernel execution; post-quantum crypto for key exchange.

---

# 15. Open Questions

1. Adopt FIPS 140-3 certified crypto modules?  
2. Integrate with enterprise SIEM (Splunk, Sentinel)?  
3. Add automatic privacy-budget enforcement in policy engine?  
4. Support hardware attestation for Studio clients?  

---
