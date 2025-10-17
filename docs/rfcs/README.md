# RFCs (Request for Comments)

This directory contains Request for Comments (RFC) documents for proposed changes, features, and architectural improvements to NuBlox SQLx OS.

## Purpose

RFCs provide a structured way to:
- Propose significant changes or new features
- Gather feedback from the team and community
- Document design decisions before implementation
- Create a historical record of proposals

## When to Write an RFC

Create an RFC when:
- Adding a major new feature
- Making breaking API changes
- Proposing significant architectural changes
- Introducing new dependencies or technologies
- Changing public interfaces or contracts

**Small changes** (bug fixes, minor improvements) don't need an RFC.

## RFC Process

### 1. Draft
- Copy `_template.md` to `NNNN-title.md`
- Fill in all sections
- Mark status as "Draft"

### 2. Discussion
- Create a pull request
- Share with relevant stakeholders
- Iterate based on feedback
- Update status to "In Discussion"

### 3. Decision
- After discussion period (typically 1-2 weeks)
- Status changes to "Accepted" or "Rejected"
- Document final decision and rationale

### 4. Implementation
- Create implementation issues/tickets
- Reference RFC in commits/PRs
- Update RFC with implementation notes

## RFC Lifecycle

```
Draft → In Discussion → Accepted/Rejected → Implemented/Withdrawn
```

## Naming Convention

```
NNNN-short-descriptive-title.md
```

Examples:
- `0001-add-graphql-api-generation.md`
- `0002-implement-query-result-streaming.md`
- `0003-support-mongodb-driver.md`

## RFC Index

| Number | Title | Status | Author | Date |
|--------|-------|--------|--------|------|
| 0001 | Example RFC | Draft | Team | 2025-10-17 |

## Template

Use `_template.md` to create new RFCs. The template includes:
- Summary and motivation
- Detailed design
- Alternatives considered
- Implementation plan
- Open questions

## Review Guidelines

When reviewing an RFC:

1. **Clarity**: Is the proposal clear and understandable?
2. **Completeness**: Are all aspects covered?
3. **Alternatives**: Have alternatives been considered?
4. **Impact**: What's the impact on existing systems?
5. **Feasibility**: Is the proposal technically feasible?
6. **Maintainability**: Can we maintain this long-term?

## Related Documentation

- [Architecture Decision Records](../adrs/README.md)
- [Specifications](../specs/README.md)
- [Development Process](../../CONTRIBUTING.md)

## Resources

- [Rust RFC Process](https://github.com/rust-lang/rfcs)
- [Python PEPs](https://www.python.org/dev/peps/)
- [IETF RFCs](https://www.ietf.org/standards/rfcs/)
