# RFC-NNNN: [Title]

**Status**: [Draft | In Discussion | Accepted | Rejected | Implemented | Withdrawn]  
**Author**: [Name] (@username)  
**Created**: YYYY-MM-DD  
**Updated**: YYYY-MM-DD  
**Tracking Issue**: [Link to issue]

## Summary

[One paragraph explanation of the proposal]

## Motivation

### Problem Statement

[Clearly describe the problem this RFC solves]

### Use Cases

1. **Use Case 1**: [Description]
2. **Use Case 2**: [Description]
3. **Use Case 3**: [Description]

### Goals

- Goal 1
- Goal 2
- Goal 3

### Non-Goals

- Non-goal 1: [Why this is out of scope]
- Non-goal 2: [Why this is out of scope]

## Detailed Design

### Overview

[High-level overview of the proposed solution]

### Architecture

[Describe the architectural changes]

```
┌─────────────────────────────────────────┐
│         Component Diagram               │
│                                         │
│  ┌───────────┐      ┌───────────┐     │
│  │Component A│─────▶│Component B│     │
│  └───────────┘      └───────────┘     │
└─────────────────────────────────────────┘
```

### API Design

[Describe any API changes]

```typescript
// Example API
interface NewFeature {
  method1(param: Type): Promise<Result>;
  method2(param: Type): Result;
}
```

### Data Model

[Describe any data model changes]

```typescript
interface DataStructure {
  field1: Type;
  field2: Type;
}
```

### Implementation Details

#### Phase 1: [Name]
[Description of first implementation phase]

#### Phase 2: [Name]
[Description of second implementation phase]

#### Phase 3: [Name]
[Description of third implementation phase]

### Error Handling

[Describe error scenarios and handling]

### Performance Considerations

- **Impact on existing operations**: [Analysis]
- **Expected performance**: [Benchmarks or estimates]
- **Optimization strategies**: [If applicable]

### Security Considerations

- **Authentication/Authorization**: [Impact]
- **Data privacy**: [Impact]
- **Attack vectors**: [Analysis]
- **Mitigation strategies**: [If applicable]

## Alternatives Considered

### Alternative 1: [Name]

**Description**: [Brief description]

**Pros**:
- ✅ Advantage 1
- ✅ Advantage 2

**Cons**:
- ❌ Disadvantage 1
- ❌ Disadvantage 2

**Why not chosen**: [Explanation]

### Alternative 2: [Name]

**Description**: [Brief description]

**Pros**:
- ✅ Advantage 1

**Cons**:
- ❌ Disadvantage 1

**Why not chosen**: [Explanation]

### Alternative 3: Do Nothing

**Impact of not implementing**: [Analysis]

## Implementation Plan

### Prerequisites

- [ ] Prerequisite 1
- [ ] Prerequisite 2

### Tasks

- [ ] Task 1: [Description] - Estimated: X days
- [ ] Task 2: [Description] - Estimated: X days
- [ ] Task 3: [Description] - Estimated: X days

### Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | X weeks | Deliverable 1 |
| Phase 2 | X weeks | Deliverable 2 |
| Phase 3 | X weeks | Deliverable 3 |

### Success Metrics

- Metric 1: [Target value]
- Metric 2: [Target value]
- Metric 3: [Target value]

## Migration Strategy

### Backward Compatibility

[Describe backward compatibility considerations]

### Migration Steps

1. Step 1: [Description]
2. Step 2: [Description]
3. Step 3: [Description]

### Deprecation Plan

[If applicable, describe deprecation of old features]

## Testing Strategy

### Unit Tests

- [ ] Test scenario 1
- [ ] Test scenario 2
- [ ] Test scenario 3

### Integration Tests

- [ ] Integration scenario 1
- [ ] Integration scenario 2

### Performance Tests

- [ ] Benchmark 1
- [ ] Benchmark 2

### User Acceptance Testing

[Describe UAT approach]

## Documentation Plan

### Updates Required

- [ ] API documentation
- [ ] User guides
- [ ] Migration guide
- [ ] Release notes
- [ ] Examples

### Communication Plan

- [ ] Internal announcement
- [ ] Blog post
- [ ] Community update
- [ ] Documentation updates

## Open Questions

1. **Question 1**: [Description]
   - Possible answers: A, B, C
   - Current thinking: [Answer X because...]

2. **Question 2**: [Description]
   - Requires input from: [Team/Person]
   - Timeline: [When decision needed]

## Dependencies

### Internal Dependencies

- Depends on: [Other RFC, feature, or component]
- Blocks: [What is waiting on this]

### External Dependencies

- Third-party library: [Name and version]
- Standard/Protocol: [Name and version]

## Risks and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Risk 1 | High/Medium/Low | High/Medium/Low | Mitigation strategy |
| Risk 2 | High/Medium/Low | High/Medium/Low | Mitigation strategy |

## Prior Art

- [Similar feature in Project A](https://example.com)
- [Approach used by Project B](https://example.com)
- [Research paper or article](https://example.com)

## Related Work

- [RFC-XXXX]: Related RFC
- [ADR-XXXX]: Related ADR
- [Issue #XXX]: Related issue

## Unresolved Questions

- Question 1
- Question 2

## Future Possibilities

[Features or improvements that could build on this proposal]

---

## Decision

**Status**: [Accepted/Rejected]  
**Decided**: YYYY-MM-DD  
**Decision Makers**: [Names]

**Rationale**: [Why this decision was made]

## Implementation Status

**Started**: YYYY-MM-DD  
**Completed**: YYYY-MM-DD  
**Implemented By**: [Names]

**Notable Changes During Implementation**:
- Change 1: [Description]
- Change 2: [Description]

## Feedback and Discussion

[Summary of key feedback received]

---

**Questions?** Contact [@author] or comment on [tracking issue]
