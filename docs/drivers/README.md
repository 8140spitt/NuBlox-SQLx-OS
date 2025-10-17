# Database Drivers

This directory contains documentation for database-specific driver implementations in NuBlox SQLx OS.

## Purpose

Driver documentation covers the implementation details, wire protocol specifications, and integration guides for each supported database system.

## Supported Databases

### Relational Databases
- [ ] PostgreSQL (9.6+)
- [ ] MySQL (5.7+)
- [ ] MariaDB (10.2+)
- [ ] SQLite (3.35+)
- [ ] Microsoft SQL Server (2017+)
- [ ] Oracle Database (19c+)
- [ ] CockroachDB (21.1+)

### NoSQL Databases
- [ ] MongoDB (4.4+)
- [ ] Cassandra (3.11+)
- [ ] DynamoDB
- [ ] Redis (6.0+)

### Cloud Native
- [ ] Amazon Aurora
- [ ] Google Cloud Spanner
- [ ] Azure Cosmos DB

## Directory Structure

```
drivers/
├── README.md (this file)
├── _template.md (driver documentation template)
├── postgresql/
│   ├── driver-spec.md
│   ├── wire-protocol.md
│   ├── type-mappings.md
│   └── performance-tuning.md
├── mysql/
│   ├── driver-spec.md
│   ├── wire-protocol.md
│   ├── type-mappings.md
│   └── performance-tuning.md
└── [other databases]/
```

## Template Usage

Use `_template.md` to create documentation for new database drivers.

## Documentation Standards

Each driver should include:

1. **Driver Specification**
   - Connection parameters
   - Authentication methods
   - Protocol version support

2. **Wire Protocol Details**
   - Message formats
   - State machine
   - Binary protocol specification

3. **Type Mappings**
   - Database types → SQLx universal types
   - Serialization/deserialization rules
   - Edge cases and limitations

4. **Performance Tuning**
   - Connection pooling configuration
   - Query optimization tips
   - Caching strategies

5. **Testing & Validation**
   - Compatibility test suite
   - Performance benchmarks
   - Known issues and workarounds

## Contributing

When adding support for a new database:

1. Copy `_template.md` to `[database-name]/driver-spec.md`
2. Fill in all required sections
3. Implement wire pack JSON specification
4. Add integration tests
5. Update this README with the new database

## Related Documentation

- [Wire Protocol Specification](../specs/drivers/SQLx-Driver-WireProtocol-Spec-v4.0.md)
- [WireVM Architecture](../specs/kernel/SQLx-Kernel-Spec-v4.0.md)
- [Type System](../NuBlox_SQLx_OS_Academic_Whitepaper_v6.0.md#type-system)
