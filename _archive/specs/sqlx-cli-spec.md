# SQLx CLI Build Specification  
**Subsystem:** @nublox/sqlx-cli  
**Version:** 1.0  
**Status:** Design-Approved (Q4 2025 Target)  
**© 2025 NuBlox Technologies Ltd.**

---

## 1. Purpose & Scope

`@nublox/sqlx-cli` provides developer and operator workflows over SQLx OS: probing, learning, ORM sync, API emission, advising, benchmarking, and healing.

---

## 2. Command Surface

```
sqlx ping        --url <uri>
sqlx learn       --url <uri> [--json]
sqlx orm sync    --url <uri> [--emit-types]
sqlx api emit    --url <uri> [--base /api] [--policy <id>]
sqlx advise      --url <uri> [--sql <q>] [--explain]
sqlx bench run   --profile <small|medium|large> [--json]
sqlx heal        --url <uri> [--deep]
```

---

## 3. Architecture

```
CLI → Command Router → Module Facades (core/orm/api) → Telemetry
```

---

## 4. Example Command (TypeScript)

```ts
program
  .command('ping')
  .description('Probe database fingerprint')
  .option('--url <string>')
  .option('--json', 'json output')
  .action(async (opts) => {
    const profile = await learnDialect(opts.url);
    console.log(opts.json ? JSON.stringify(profile) : profile);
  });
```

---

## 5. Implementation Tasks (Phased)

| Phase | Goal | Deliverables |
|--------|------|--------------|
| **P1** | CLI skeleton | `src/index.ts` + commander setup |
| **P2** | ping/learn | core integration |
| **P3** | orm sync | orm integration |
| **P4** | api emit | api integration |
| **P5** | advise/bench | core simulate + advisor hooks |
| **P6** | heal | diagnostics bundle |
| **P7** | Docs/man pages | `/docs/cli/index.md` |

---

## 6. Testing Strategy

- Unit: command parsing & options.  
- Integration: command → module calls (mocked).  
- E2E: docker DBs for live `ping/learn/orm/api`.  
- Snapshot: CLI outputs for `--json` modes.

---

## 7. Integration Points

| Module | Usage |
|--------|-------|
| `@nublox/sqlx-core` | ping/learn/advise/bench/heal |
| `@nublox/sqlx-orm` | orm sync |
| `@nublox/sqlx-api` | api emit |
| `@nublox/sqlx-observe` | telemetry for command runs |
| `@nublox/sqlx-control` | policy ids & publish endpoints |

---


© 2025 NuBlox Technologies Ltd. All Rights Reserved.
