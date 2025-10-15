// Security and Governance package for TLS policy, PII classification, compliance, audit chain

// TLS Policy
export interface TLSPolicy {
    requireTLSForRemote: boolean;
    allowPlainLocalhost: boolean;
    trustPolicy: 'system' | 'selfsigned' | 'pin' | 'ca_bundle';
    pinnedCertificates?: string[];
    caBundle?: string;
    minimumTLSVersion?: '1.0' | '1.1' | '1.2' | '1.3';
    cipherSuites?: string[];
    verifyHostname: boolean;
    connectTimeoutSeconds: number;
}

export interface TLSConnectionResult {
    secure: boolean;
    protocol?: string;
    cipher?: string;
    fingerprint?: string;
    certificate?: TLSCertificate;
    verified: boolean;
    errors: string[];
}

export interface TLSCertificate {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    serialNumber: string;
    fingerprint: string;
    publicKey: string;
    extensions: Record<string, string>;
}

// Compliance Modes
export type ComplianceMode = 'SOX' | 'GDPR' | 'HIPAA' | 'PCI' | 'SOC2';

export interface ComplianceConfig {
    mode: ComplianceMode;
    enabled: boolean;
    settings: ComplianceSettings;
}

export interface ComplianceSettings {
    auditLevel: 'minimal' | 'standard' | 'verbose';
    dataRetentionDays: number;
    encryptionRequired: boolean;
    accessLogging: boolean;
    dataMinimization: boolean;
    anonymization: boolean;
    rightToBeErasedSupport: boolean;
    dataPortabilitySupport: boolean;
    consentTracking: boolean;
    breachNotificationRequired: boolean;
    regularAuditsRequired: boolean;
    accessControlsRequired: boolean;
    dataClassificationRequired: boolean;
    backupEncryptionRequired: boolean;
    transmissionEncryptionRequired: boolean;
    keyRotationRequired: boolean;
    segregationOfDutiesRequired: boolean;
    privilegedAccessMonitoring: boolean;
}

// PII Classification
export interface PIIClassifier {
    classifyColumn(columnName: string, dataType: string, sampleData?: string[]): PIIClassification;
    classifyData(data: unknown): PIIDataClassification;
    getRedactionPattern(piiType: PIIType): string;
}

export interface PIIClassification {
    type: PIIType;
    confidence: number;
    reasoning: string;
    suggestedTags: string[];
    maskingRecommendation: MaskingStrategy;
}

export interface PIIDataClassification {
    containsPII: boolean;
    detectedTypes: PIIType[];
    redactedValue: unknown;
    originalLength?: number;
}

export type PIIType =
    | 'email'
    | 'phone'
    | 'ssn'
    | 'credit_card'
    | 'ip_address'
    | 'name'
    | 'address'
    | 'date_of_birth'
    | 'passport'
    | 'driver_license'
    | 'medical_record'
    | 'financial_account'
    | 'biometric'
    | 'government_id';

export type MaskingStrategy =
    | 'full_redaction'
    | 'partial_masking'
    | 'tokenization'
    | 'encryption'
    | 'hashing'
    | 'anonymization';

// Policy DSL
export interface PolicyRule {
    id: string;
    name: string;
    description: string;
    type: 'access' | 'data' | 'operation' | 'temporal';
    condition: PolicyCondition;
    action: PolicyAction;
    priority: number;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}

export interface PolicyCondition {
    type: 'and' | 'or' | 'not' | 'expression';
    conditions?: PolicyCondition[];
    expression?: string;
    field?: string;
    operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'regex';
    value?: unknown;
}

export interface PolicyAction {
    type: 'allow' | 'deny' | 'audit' | 'mask' | 'encrypt' | 'alert' | 'throttle';
    parameters?: Record<string, unknown>;
}

// Audit Chain
export interface AuditEvent {
    id: string;
    timestamp: string;
    eventType: AuditEventType;
    actor: AuditActor;
    target: AuditTarget;
    action: string;
    outcome: 'success' | 'failure' | 'partial';
    metadata: Record<string, unknown>;
    signature?: string;
    previousHash?: string;
    blockHash: string;
}

export type AuditEventType =
    | 'authentication'
    | 'authorization'
    | 'data_access'
    | 'data_modification'
    | 'schema_change'
    | 'policy_change'
    | 'configuration_change'
    | 'backup'
    | 'restore'
    | 'export'
    | 'import'
    | 'system_event';

export interface AuditActor {
    type: 'user' | 'service' | 'system';
    id: string;
    name?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface AuditTarget {
    type: 'database' | 'table' | 'column' | 'row' | 'index' | 'procedure' | 'view' | 'policy' | 'configuration';
    id: string;
    name?: string;
    schema?: string;
    properties?: Record<string, unknown>;
}

export interface ForensicTimeline {
    events: AuditEvent[];
    metadata: TimelineMetadata;
    signature: string;
    verified: boolean;
}

export interface TimelineMetadata {
    startTime: string;
    endTime: string;
    eventCount: number;
    actors: string[];
    targets: string[];
    compliance: ComplianceMode[];
    exportedAt: string;
    exportedBy: string;
}

// Security Kernel Implementation
export class SecurityKernel {
    private policies: Map<string, PolicyRule> = new Map();
    private auditChain: AuditEvent[] = [];
    private compliance: Map<ComplianceMode, ComplianceConfig> = new Map();
    private piiClassifier: DefaultPIIClassifier;

    constructor() {
        this.piiClassifier = new DefaultPIIClassifier();
        this.initializeDefaultCompliance();
    }

    // TLS Policy Management
    validateTLSConnection(result: TLSConnectionResult, policy: TLSPolicy): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (policy.requireTLSForRemote && !result.secure) {
            errors.push('TLS required for remote connections');
        }

        if (result.secure && policy.minimumTLSVersion) {
            const version = result.protocol?.replace('TLSv', '');
            if (version && parseFloat(version) < parseFloat(policy.minimumTLSVersion.replace('.', ''))) {
                errors.push(`TLS version ${version} below minimum ${policy.minimumTLSVersion}`);
            }
        }

        if (policy.trustPolicy === 'pin' && policy.pinnedCertificates && result.fingerprint) {
            if (!policy.pinnedCertificates.includes(result.fingerprint)) {
                errors.push('Certificate fingerprint not in pinned list');
            }
        }

        if (policy.verifyHostname && !result.verified) {
            errors.push('Hostname verification failed');
        }

        return { valid: errors.length === 0, errors };
    }

    // Policy Management
    addPolicy(policy: PolicyRule): void {
        this.policies.set(policy.id, policy);
        this.auditEvent('policy_change', {
            type: 'system',
            id: 'security-kernel',
            name: 'SecurityKernel'
        }, {
            type: 'policy',
            id: policy.id,
            name: policy.name
        }, 'add_policy', 'success', { policy });
    }

    removePolicy(policyId: string): boolean {
        const removed = this.policies.delete(policyId);
        if (removed) {
            this.auditEvent('policy_change', {
                type: 'system',
                id: 'security-kernel',
                name: 'SecurityKernel'
            }, {
                type: 'policy',
                id: policyId
            }, 'remove_policy', 'success', { policyId });
        }
        return removed;
    }

    evaluatePolicy(context: PolicyEvaluationContext): PolicyEvaluationResult {
        const applicablePolicies = Array.from(this.policies.values())
            .filter(p => p.enabled)
            .sort((a, b) => b.priority - a.priority);

        for (const policy of applicablePolicies) {
            const result = this.evaluatePolicyCondition(policy.condition, context);
            if (result) {
                return {
                    decision: policy.action.type === 'allow' ? 'allow' : 'deny',
                    policy: policy,
                    reason: `Policy ${policy.name} matched`,
                    actions: [policy.action]
                };
            }
        }

        return {
            decision: 'allow',
            reason: 'No policies matched - default allow',
            actions: []
        };
    }

    private evaluatePolicyCondition(condition: PolicyCondition, context: PolicyEvaluationContext): boolean {
        switch (condition.type) {
            case 'and':
                return condition.conditions?.every(c => this.evaluatePolicyCondition(c, context)) || false;
            case 'or':
                return condition.conditions?.some(c => this.evaluatePolicyCondition(c, context)) || false;
            case 'not':
                return condition.conditions ? !this.evaluatePolicyCondition(condition.conditions[0], context) : false;
            case 'expression':
                return this.evaluateExpression(condition, context);
            default:
                return false;
        }
    }

    private evaluateExpression(condition: PolicyCondition, context: PolicyEvaluationContext): boolean {
        if (!condition.field || !condition.operator) return false;

        const fieldValue = this.getFieldValue(condition.field, context);

        switch (condition.operator) {
            case 'eq': return fieldValue === condition.value;
            case 'neq': return fieldValue !== condition.value;
            case 'gt': return Number(fieldValue) > Number(condition.value);
            case 'gte': return Number(fieldValue) >= Number(condition.value);
            case 'lt': return Number(fieldValue) < Number(condition.value);
            case 'lte': return Number(fieldValue) <= Number(condition.value);
            case 'in': return Array.isArray(condition.value) && condition.value.includes(fieldValue);
            case 'nin': return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
            case 'contains': return String(fieldValue).includes(String(condition.value));
            case 'regex': return new RegExp(String(condition.value)).test(String(fieldValue));
            default: return false;
        }
    }

    private getFieldValue(field: string, context: PolicyEvaluationContext): unknown {
        const parts = field.split('.');
        let value: any = context;
        for (const part of parts) {
            value = value?.[part];
        }
        return value;
    }

    // Compliance Management
    setComplianceMode(mode: ComplianceMode, enabled: boolean): void {
        const config = this.compliance.get(mode);
        if (config) {
            config.enabled = enabled;
            this.auditEvent('configuration_change', {
                type: 'system',
                id: 'security-kernel'
            }, {
                type: 'configuration',
                id: 'compliance'
            }, 'set_compliance_mode', 'success', { mode, enabled });
        }
    }

    getComplianceSettings(mode: ComplianceMode): ComplianceSettings | undefined {
        return this.compliance.get(mode)?.settings;
    }

    isCompliant(mode: ComplianceMode, operation: string, context: any): boolean {
        const config = this.compliance.get(mode);
        if (!config || !config.enabled) return true;

        // Implement compliance checks based on mode and operation
        switch (mode) {
            case 'GDPR':
                return this.checkGDPRCompliance(operation, context, config.settings);
            case 'HIPAA':
                return this.checkHIPAACompliance(operation, context, config.settings);
            case 'PCI':
                return this.checkPCICompliance(operation, context, config.settings);
            case 'SOX':
                return this.checkSOXCompliance(operation, context, config.settings);
            case 'SOC2':
                return this.checkSOC2Compliance(operation, context, config.settings);
            default:
                return true;
        }
    }

    // PII Classification
    classifyPII(columnName: string, dataType: string, sampleData?: string[]): PIIClassification {
        return this.piiClassifier.classifyColumn(columnName, dataType, sampleData);
    }

    maskPII(data: unknown, piiType: PIIType): unknown {
        return this.piiClassifier.getRedactionPattern(piiType);
    }

    // Audit Chain
    auditEvent(
        eventType: AuditEventType,
        actor: AuditActor,
        target: AuditTarget,
        action: string,
        outcome: 'success' | 'failure' | 'partial',
        metadata: Record<string, unknown> = {}
    ): void {
        const event: AuditEvent = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            eventType,
            actor,
            target,
            action,
            outcome,
            metadata,
            previousHash: this.auditChain.length > 0 ? this.auditChain[this.auditChain.length - 1].blockHash : undefined,
            blockHash: ''
        };

        // Generate block hash
        event.blockHash = this.hashEvent(event);

        this.auditChain.push(event);
    }

    verifyAuditChain(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        for (let i = 1; i < this.auditChain.length; i++) {
            const current = this.auditChain[i];
            const previous = this.auditChain[i - 1];

            if (current.previousHash !== previous.blockHash) {
                errors.push(`Chain break at event ${i}: ${current.id}`);
            }

            const expectedHash = this.hashEvent(current);
            if (current.blockHash !== expectedHash) {
                errors.push(`Hash mismatch at event ${i}: ${current.id}`);
            }
        }

        return { valid: errors.length === 0, errors };
    }

    exportForensicTimeline(startTime?: string, endTime?: string): ForensicTimeline {
        let events = this.auditChain;

        if (startTime) {
            events = events.filter(e => e.timestamp >= startTime);
        }

        if (endTime) {
            events = events.filter(e => e.timestamp <= endTime);
        }

        const actors = [...new Set(events.map(e => e.actor.id))];
        const targets = [...new Set(events.map(e => e.target.id))];
        const complianceModes = Array.from(this.compliance.entries())
            .filter(([_, config]) => config.enabled)
            .map(([mode, _]) => mode);

        const timeline: ForensicTimeline = {
            events,
            metadata: {
                startTime: events[0]?.timestamp || new Date().toISOString(),
                endTime: events[events.length - 1]?.timestamp || new Date().toISOString(),
                eventCount: events.length,
                actors,
                targets,
                compliance: complianceModes,
                exportedAt: new Date().toISOString(),
                exportedBy: 'security-kernel'
            },
            signature: '',
            verified: false
        };

        timeline.signature = this.signTimeline(timeline);
        timeline.verified = this.verifyTimelineSignature(timeline);

        return timeline;
    }

    private hashEvent(event: AuditEvent): string {
        const data = {
            id: event.id,
            timestamp: event.timestamp,
            eventType: event.eventType,
            actor: event.actor,
            target: event.target,
            action: event.action,
            outcome: event.outcome,
            metadata: event.metadata,
            previousHash: event.previousHash
        };

        // Simple hash implementation - in production use cryptographically secure hash
        return Buffer.from(JSON.stringify(data)).toString('base64').substring(0, 32);
    }

    private signTimeline(timeline: ForensicTimeline): string {
        // Simple signature implementation - in production use proper digital signatures
        const data = JSON.stringify(timeline.metadata) + JSON.stringify(timeline.events.map(e => e.blockHash));
        return Buffer.from(data).toString('base64').substring(0, 64);
    }

    private verifyTimelineSignature(timeline: ForensicTimeline): boolean {
        const expectedSignature = this.signTimeline({ ...timeline, signature: '', verified: false });
        return timeline.signature === expectedSignature;
    }

    private initializeDefaultCompliance(): void {
        // GDPR
        this.compliance.set('GDPR', {
            mode: 'GDPR',
            enabled: false,
            settings: {
                auditLevel: 'verbose',
                dataRetentionDays: 2555, // 7 years
                encryptionRequired: true,
                accessLogging: true,
                dataMinimization: true,
                anonymization: true,
                rightToBeErasedSupport: true,
                dataPortabilitySupport: true,
                consentTracking: true,
                breachNotificationRequired: true,
                regularAuditsRequired: true,
                accessControlsRequired: true,
                dataClassificationRequired: true,
                backupEncryptionRequired: true,
                transmissionEncryptionRequired: true,
                keyRotationRequired: false,
                segregationOfDutiesRequired: false,
                privilegedAccessMonitoring: true
            }
        });

        // HIPAA
        this.compliance.set('HIPAA', {
            mode: 'HIPAA',
            enabled: false,
            settings: {
                auditLevel: 'verbose',
                dataRetentionDays: 2190, // 6 years
                encryptionRequired: true,
                accessLogging: true,
                dataMinimization: true,
                anonymization: true,
                rightToBeErasedSupport: false,
                dataPortabilitySupport: true,
                consentTracking: true,
                breachNotificationRequired: true,
                regularAuditsRequired: true,
                accessControlsRequired: true,
                dataClassificationRequired: true,
                backupEncryptionRequired: true,
                transmissionEncryptionRequired: true,
                keyRotationRequired: true,
                segregationOfDutiesRequired: true,
                privilegedAccessMonitoring: true
            }
        });

        // Add other compliance modes...
    }

    private checkGDPRCompliance(operation: string, context: any, settings: ComplianceSettings): boolean {
        if (settings.encryptionRequired && !context.encrypted) return false;
        if (settings.dataMinimization && context.dataScope === 'full') return false;
        return true;
    }

    private checkHIPAACompliance(operation: string, context: any, settings: ComplianceSettings): boolean {
        if (settings.accessControlsRequired && !context.authorized) return false;
        if (settings.encryptionRequired && !context.encrypted) return false;
        return true;
    }

    private checkPCICompliance(operation: string, context: any, settings: ComplianceSettings): boolean {
        if (settings.encryptionRequired && !context.encrypted) return false;
        return true;
    }

    private checkSOXCompliance(operation: string, context: any, settings: ComplianceSettings): boolean {
        if (settings.segregationOfDutiesRequired && context.sameUser) return false;
        return true;
    }

    private checkSOC2Compliance(operation: string, context: any, settings: ComplianceSettings): boolean {
        if (settings.accessControlsRequired && !context.authorized) return false;
        return true;
    }
}

// Default PII Classifier Implementation
class DefaultPIIClassifier implements PIIClassifier {
    private patterns: Map<PIIType, RegExp> = new Map([
        ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/],
        ['phone', /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/],
        ['ssn', /\b\d{3}-?\d{2}-?\d{4}\b/],
        ['credit_card', /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/],
        ['ip_address', /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/]
    ]);

    classifyColumn(columnName: string, dataType: string, sampleData?: string[]): PIIClassification {
        const name = columnName.toLowerCase();

        // Name-based classification
        if (name.includes('email')) {
            return {
                type: 'email',
                confidence: 0.9,
                reasoning: 'Column name contains "email"',
                suggestedTags: ['pii:email'],
                maskingRecommendation: 'partial_masking'
            };
        }

        if (name.includes('phone')) {
            return {
                type: 'phone',
                confidence: 0.8,
                reasoning: 'Column name contains "phone"',
                suggestedTags: ['pii:phone'],
                maskingRecommendation: 'partial_masking'
            };
        }

        // Data-based classification
        if (sampleData) {
            for (const [piiType, pattern] of this.patterns.entries()) {
                const matches = sampleData.filter(val => pattern.test(String(val))).length;
                const ratio = matches / sampleData.length;

                if (ratio > 0.7) {
                    return {
                        type: piiType,
                        confidence: 0.95,
                        reasoning: `${Math.round(ratio * 100)}% of samples match ${piiType} pattern`,
                        suggestedTags: [`pii:${piiType}`],
                        maskingRecommendation: this.getMaskingRecommendation(piiType)
                    };
                }
            }
        }

        // Default - no PII detected
        return {
            type: 'email', // fallback
            confidence: 0.0,
            reasoning: 'No PII patterns detected',
            suggestedTags: [],
            maskingRecommendation: 'full_redaction'
        };
    }

    classifyData(data: unknown): PIIDataClassification {
        const str = String(data);
        const detectedTypes: PIIType[] = [];

        for (const [piiType, pattern] of this.patterns.entries()) {
            if (pattern.test(str)) {
                detectedTypes.push(piiType);
            }
        }

        return {
            containsPII: detectedTypes.length > 0,
            detectedTypes,
            redactedValue: detectedTypes.length > 0 ? '[REDACTED]' : data,
            originalLength: str.length
        };
    }

    getRedactionPattern(piiType: PIIType): string {
        const patterns: Record<PIIType, string> = {
            'email': '*****@*****.***',
            'phone': '***-***-****',
            'ssn': '***-**-****',
            'credit_card': '****-****-****-****',
            'ip_address': '***.***.***.***',
            'name': '[NAME REDACTED]',
            'address': '[ADDRESS REDACTED]',
            'date_of_birth': '[DOB REDACTED]',
            'passport': '[PASSPORT REDACTED]',
            'driver_license': '[LICENSE REDACTED]',
            'medical_record': '[MEDICAL REDACTED]',
            'financial_account': '[ACCOUNT REDACTED]',
            'biometric': '[BIOMETRIC REDACTED]',
            'government_id': '[ID REDACTED]'
        };

        return patterns[piiType] || '[REDACTED]';
    }

    private getMaskingRecommendation(piiType: PIIType): MaskingStrategy {
        const recommendations: Record<PIIType, MaskingStrategy> = {
            'email': 'partial_masking',
            'phone': 'partial_masking',
            'ssn': 'full_redaction',
            'credit_card': 'tokenization',
            'ip_address': 'anonymization',
            'name': 'partial_masking',
            'address': 'anonymization',
            'date_of_birth': 'anonymization',
            'passport': 'full_redaction',
            'driver_license': 'tokenization',
            'medical_record': 'encryption',
            'financial_account': 'tokenization',
            'biometric': 'hashing',
            'government_id': 'tokenization'
        };

        return recommendations[piiType] || 'full_redaction';
    }
}

// Supporting interfaces
export interface PolicyEvaluationContext {
    user?: { id: string; roles: string[] };
    session?: { id: string; ip: string };
    operation?: { type: string; target: string };
    data?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface PolicyEvaluationResult {
    decision: 'allow' | 'deny';
    policy?: PolicyRule;
    reason: string;
    actions: PolicyAction[];
}

export { SecurityKernel as default };