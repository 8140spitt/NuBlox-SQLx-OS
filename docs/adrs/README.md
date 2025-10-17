# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records documenting significant architectural decisions made in the NuBlox SQLx OS project.

## Purpose

ADRs capture important architectural decisions along with their context and consequences. Each ADR describes a single decision and follows a standard template.

## Format

Each ADR should follow this naming convention:
```
NNNN-title-with-dashes.md
```

Example: `0001-use-wirevm-protocol-virtualization.md`

## Template

Use the template in `_template.md` to create new ADRs.

## Index

| Number | Title | Status | Date |
|--------|-------|--------|------|
| 0001 | Use WireVM Protocol Virtualization | Proposed | 2025-10-17 |
| 0002 | Implement FLO Learning System | Proposed | 2025-10-17 |
| 0003 | Adopt Multi-Level Caching Strategy | Proposed | 2025-10-17 |

## Guidelines

1. **When to write an ADR**: Create an ADR when making a significant architectural decision that:
   - Affects multiple components
   - Has long-term implications
   - Involves trade-offs between alternatives
   - Requires team consensus

2. **ADR Lifecycle**:
   - **Proposed**: Under discussion
   - **Accepted**: Decision approved and being implemented
   - **Deprecated**: Superseded by another ADR
   - **Rejected**: Decision not adopted

3. **Keep ADRs immutable**: Once accepted, don't modify ADRs. Create a new ADR to supersede an old one.

## Resources

- [ADR GitHub Organization](https://adr.github.io/)
- [Architectural Decision Records by Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
