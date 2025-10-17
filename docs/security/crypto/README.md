# Security - Cryptography

This directory contains cryptographic standards, key management, and encryption documentation for NuBlox SQLx OS.

## Purpose

Comprehensive cryptography documentation ensures secure data protection through proper encryption, key management, and cryptographic operations.

## Contents

### Planned Documentation

- [ ] **Encryption Standards** (`encryption.md`)
  - Algorithms and key sizes
  - Data at rest encryption
  - Data in transit encryption
  - End-to-end encryption

- [ ] **Key Management** (`key-management.md`)
  - Key generation
  - Key rotation
  - Key storage
  - Key recovery

- [ ] **Certificate Management** (`certificates.md`)
  - Certificate lifecycle
  - Certificate authorities
  - Certificate rotation
  - Revocation handling

- [ ] **Cryptographic Operations** (`operations.md`)
  - Signing and verification
  - Hashing
  - Random number generation
  - Secure comparison

## Encryption Standards

### Data at Rest

**Database Encryption:**
- Algorithm: AES-256-GCM
- Key derivation: PBKDF2 (100,000 iterations)
- Unique IV per encryption operation
- Authentication tags verified

**File System Encryption:**
- Algorithm: AES-256-XTS
- Full disk encryption recommended
- Separate keys per volume

**Backup Encryption:**
- Algorithm: AES-256-CBC
- HMAC-SHA256 for integrity
- Encrypted before leaving system

### Data in Transit

**TLS Configuration:**
- Minimum version: TLS 1.3
- Fallback: TLS 1.2 (with restrictions)
- Cipher suites:
  ```
  TLS_AES_256_GCM_SHA384
  TLS_CHACHA20_POLY1305_SHA256
  TLS_AES_128_GCM_SHA256
  ```

**Database Connections:**
- Enforce SSL/TLS for all connections
- Mutual TLS (mTLS) for service-to-service
- Certificate pinning for critical connections

### Sensitive Data in Memory

- Secure memory allocation
- Memory zeroing after use
- Protection against memory dumps
- Limited cleartext lifetime

## Key Management

### Key Hierarchy

```
┌─────────────────────────────────────┐
│     Master Encryption Key (MEK)     │
│         (HSM or KMS)                │
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼────────┐   ┌────────▼────┐
│Data Keys   │   │ Key          │
│(DEKs)      │   │ Encryption   │
│            │   │ Keys (KEKs)  │
└────────────┘   └──────────────┘
```

### Key Generation

```typescript
// Key generation example
const keyPair = await crypto.generateKeyPair('rsa', {
  modulusLength: 4096,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase: securePassphrase
  }
});
```

### Key Storage

**Options:**
1. **Hardware Security Module (HSM)**
   - FIPS 140-2 Level 3 compliant
   - Recommended for production

2. **Cloud Key Management Service**
   - AWS KMS
   - Google Cloud KMS
   - Azure Key Vault

3. **Software Key Store**
   - Encrypted key files
   - Secure memory storage
   - For development only

### Key Rotation

**Schedule:**
- Master keys: Annual rotation
- Data encryption keys: Quarterly rotation
- API keys: 90-day rotation
- Session keys: Per-session

**Process:**
1. Generate new key
2. Re-encrypt data with new key
3. Deprecate old key
4. Archive old key (for recovery)
5. Destroy after retention period

## Hashing & Signing

### Password Hashing
- Algorithm: Argon2id
- Memory: 64 MB
- Iterations: 3
- Parallelism: 4
- Salt: 16 bytes (cryptographically random)

```typescript
const hashedPassword = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32
});
```

### Message Authentication
- Algorithm: HMAC-SHA256
- Key size: 256 bits
- Constant-time comparison

### Digital Signatures
- Algorithm: RSA-PSS with SHA-256
- Key size: 4096 bits
- Or: Ed25519 (preferred for performance)

## Certificate Management

### Certificate Lifecycle

```
Generation → Issuance → Deployment → Renewal → Revocation
```

### Certificate Types

1. **Server Certificates**
   - TLS/SSL for HTTPS
   - Validity: 90 days (automated renewal)
   - Let's Encrypt or internal CA

2. **Client Certificates**
   - Mutual TLS authentication
   - Validity: 365 days
   - Issued by internal CA

3. **Code Signing**
   - Sign releases and updates
   - Validity: 3 years
   - Extended validation

### Certificate Validation

```typescript
// Certificate validation
const validation = {
  checkRevocation: true,
  validateChain: true,
  checkHostname: true,
  requireStapling: true,  // OCSP stapling
  minKeyLength: 2048,
  allowedCAs: trustedCAs
};
```

## Cryptographic Best Practices

### DO

✅ Use established, peer-reviewed algorithms  
✅ Generate cryptographically secure random numbers  
✅ Use authenticated encryption (AEAD modes)  
✅ Implement proper key rotation  
✅ Protect keys with hardware security  
✅ Use constant-time operations for secrets  
✅ Validate all inputs  
✅ Log cryptographic operations (not keys!)  

### DON'T

❌ Implement custom cryptography  
❌ Reuse IVs/nonces  
❌ Store keys in code or configuration  
❌ Use deprecated algorithms (MD5, SHA1, DES)  
❌ Use weak key sizes  
❌ Log sensitive cryptographic material  
❌ Trust user-provided cryptographic parameters  

## Quantum-Safe Cryptography

### Future-Proofing

Preparing for post-quantum era:

1. **Hybrid Approaches**
   - Combine classical + post-quantum algorithms
   - Gradual migration path

2. **Target Algorithms** (NIST approved)
   - **Key Exchange**: CRYSTALS-Kyber
   - **Signatures**: CRYSTALS-Dilithium, FALCON
   - **Fallback**: SPHINCS+

3. **Migration Timeline**
   - 2025-2026: Testing and validation
   - 2026-2027: Hybrid deployment
   - 2027+: Full quantum-safe

## Random Number Generation

### Cryptographic RNG

```typescript
// Secure random bytes
const randomBytes = crypto.getRandomValues(new Uint8Array(32));

// Random integers
const randomInt = crypto.getRandomValues(new Uint32Array(1))[0];

// UUID generation
const uuid = crypto.randomUUID();
```

### Sources of Entropy
- `/dev/urandom` (Linux)
- `CryptGenRandom` (Windows)
- Hardware RNG (if available)
- No weak sources (timestamps, PIDs)

## Compliance

### Standards Compliance
- FIPS 140-2 Level 2+ for key storage
- NIST SP 800-series guidelines
- PCI DSS encryption requirements
- HIPAA encryption standards
- GDPR encryption recommendations

### Audit Requirements
- Annual cryptographic review
- Key management audit
- Algorithm strength assessment
- Compliance validation

## Related Documentation

- [Security Whitepaper](../SQLx-Security-Whitepaper-and-ThreatModel-v4.0.md)
- [Access Control](../access/README.md)
- [Academic Whitepaper - Quantum Cryptography](../../NuBlox_SQLx_OS_Academic_Whitepaper_v6.0.md#quantum-safe-cryptographic-integration)

## Tools & Libraries

### Recommended Libraries
- **Node.js**: `crypto` (built-in), `sodium-native`
- **Python**: `cryptography`, `pynacl`
- **Go**: `crypto/*` (stdlib)
- **Rust**: `ring`, `sodiumoxide`

### Key Management Services
- AWS KMS
- Google Cloud KMS
- Azure Key Vault
- HashiCorp Vault

### HSM Vendors
- Thales Luna
- Gemalto SafeNet
- Utimaco SecurityServer
- AWS CloudHSM

## Emergency Procedures

### Key Compromise
1. Immediately revoke compromised key
2. Generate new key pair
3. Update all systems
4. Notify affected parties
5. Investigate breach source
6. Document incident

### Data Breach
1. Identify scope of exposure
2. Assess encryption status
3. Rotate potentially compromised keys
4. Re-encrypt affected data
5. Notify authorities (if required)
6. Document and review
