# Security - Audit & Compliance

This directory contains audit logging, compliance monitoring, and forensic documentation for NuBlox SQLx OS.

## Purpose

Comprehensive audit trails and compliance documentation ensure accountability, support investigations, and demonstrate regulatory compliance.

## Contents

### Planned Documentation

- [ ] **Audit Logging** (`logging.md`)
  - Event types logged
  - Log format and structure
  - Retention policies
  - Log analysis tools

- [ ] **Forensic Analysis** (`forensics.md`)
  - Investigation procedures
  - Log correlation
  - Timeline reconstruction
  - Evidence preservation

- [ ] **Compliance Monitoring** (`compliance.md`)
  - Automated compliance checks
  - Control effectiveness
  - Gap analysis
  - Remediation tracking

- [ ] **Audit Reports** (`reports.md`)
  - Report templates
  - Scheduled reports
  - On-demand reporting
  - Executive summaries

## Audit Events

### Authentication Events
- User login (success/failure)
- Logout
- Password changes
- MFA enrollment/usage
- API key creation/deletion

### Authorization Events
- Permission grants/revocations
- Role assignments
- Policy changes
- Access denials

### Data Access Events
- Query execution
- Data reads
- Data modifications (INSERT/UPDATE/DELETE)
- Schema changes
- Bulk operations

### Administrative Events
- Configuration changes
- System settings modifications
- User provisioning/deprovisioning
- Service restarts
- Emergency access usage

### Security Events
- Failed authentication attempts
- Suspicious activity detected
- Security policy violations
- Certificate operations
- Encryption key usage

## Audit Log Format

```json
{
  "timestamp": "2025-10-17T10:30:00.000Z",
  "event_id": "evt_abc123",
  "event_type": "data.query.execute",
  "severity": "INFO",
  "actor": {
    "user_id": "usr_xyz789",
    "email": "alice@company.com",
    "ip_address": "192.168.1.100",
    "user_agent": "SQLx-Client/1.0"
  },
  "resource": {
    "type": "database",
    "id": "db_prod_001",
    "name": "production_users"
  },
  "action": {
    "operation": "SELECT",
    "query": "SELECT * FROM users WHERE id = ?",
    "parameters": ["[REDACTED]"],
    "affected_rows": 1
  },
  "result": {
    "status": "success",
    "duration_ms": 45,
    "error": null
  },
  "context": {
    "request_id": "req_456def",
    "session_id": "ses_789ghi",
    "application": "api-server",
    "environment": "production"
  },
  "compliance": {
    "pii_accessed": true,
    "phi_accessed": false,
    "sensitive_data": ["email", "name"]
  }
}
```

## Audit Trail Integrity

### Tamper-Proof Logging

1. **Hash Chaining**
   ```
   Log Entry N = {
     data: event_data,
     hash: SHA256(event_data + previous_hash)
   }
   ```

2. **Immutable Storage**
   - Write-once storage
   - No modification allowed
   - Deletion logged and tracked

3. **External Verification**
   - Periodic blockchain anchoring
   - Third-party audit service integration

### Log Retention

| Log Type | Retention Period | Storage Location |
|----------|------------------|------------------|
| Security events | 7 years | Hot + Cold |
| Data access | 3 years | Hot + Archive |
| Administrative | 5 years | Hot + Archive |
| System logs | 1 year | Hot |
| Debug logs | 30 days | Hot |

## Compliance Requirements

### SOX (Sarbanes-Oxley)
- [ ] All financial data access logged
- [ ] User actions traceable
- [ ] Change management tracked
- [ ] Segregation of duties enforced

### GDPR (General Data Protection Regulation)
- [ ] PII access logged
- [ ] Data subject requests tracked
- [ ] Consent changes recorded
- [ ] Data deletion verified

### HIPAA (Health Insurance Portability)
- [ ] PHI access logged
- [ ] Emergency access tracked
- [ ] Audit logs protected
- [ ] Breach detection enabled

### PCI DSS (Payment Card Industry)
- [ ] Cardholder data access logged
- [ ] Failed access attempts tracked
- [ ] Admin actions recorded
- [ ] Log review process documented

## Audit Queries

### Recent Failed Logins
```sql
SELECT * FROM audit_logs
WHERE event_type = 'auth.login.failed'
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;
```

### Data Access by User
```sql
SELECT 
  actor.email,
  resource.name,
  COUNT(*) as access_count
FROM audit_logs
WHERE event_type LIKE 'data.%'
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY actor.email, resource.name
ORDER BY access_count DESC;
```

### Privilege Changes
```sql
SELECT * FROM audit_logs
WHERE event_type IN (
  'auth.role.assigned',
  'auth.permission.granted'
)
AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;
```

## Alerting Rules

### Critical Alerts (Immediate)
- Multiple failed authentication attempts (>5 in 5 minutes)
- Privilege escalation detected
- Unauthorized data export
- Emergency access used
- Audit log tampering attempt

### Warning Alerts (15 minutes)
- Unusual access patterns
- After-hours access
- Access from new location
- Bulk data operations
- Configuration changes

### Info Alerts (Daily Summary)
- Access statistics
- User activity summary
- Compliance status
- Log volume metrics

## Forensic Procedures

### Incident Investigation

1. **Preserve Evidence**
   - Export relevant logs
   - Create immutable snapshots
   - Document chain of custody

2. **Analyze Timeline**
   - Correlate events
   - Identify attack vectors
   - Determine scope of impact

3. **Report Findings**
   - Executive summary
   - Technical details
   - Remediation recommendations

### Tools

- **Log Analysis**: Elasticsearch, Splunk
- **SIEM Integration**: Datadog, Sumo Logic
- **Compliance Tools**: Vanta, Drata
- **Visualization**: Kibana, Grafana

## Audit Dashboard

Key metrics to display:
- Total events logged (24h)
- Failed authentication rate
- Privileged operations count
- PII/PHI access events
- Compliance violations
- Top users by activity
- Top accessed resources

## Related Documentation

- [Security Whitepaper](../SQLx-Security-Whitepaper-and-ThreatModel-v4.0.md)
- [Access Control](../access/README.md)
- [Compliance Framework](../../compliance/SQLx-Compliance-Policy-Framework-v4.0.md)

## Best Practices

1. **Log Everything Sensitive**
   - Authentication events
   - Authorization decisions
   - Data access
   - Configuration changes

2. **Protect Audit Logs**
   - Separate storage
   - Encrypted at rest
   - Limited access
   - Tamper detection

3. **Regular Reviews**
   - Daily automated analysis
   - Weekly manual review
   - Monthly compliance check
   - Quarterly audit

4. **Incident Response**
   - Defined escalation paths
   - Playbooks for common scenarios
   - Contact list maintained
   - Practice drills conducted
