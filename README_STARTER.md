# NuBlox SQLx OS — Starter Implementation

This bundle contains a minimal, **dialect-free** runnable scaffold:
- `createDriver(url)` facade (Core)
- Transport interpreter stub (family packs via registry)
- FLO `learnCapabilities()` stub
- Planner stub (diff/apply & SIP)
- CLI with `ping`, `learn`, `snapshot:pull`

## Build
```bash
pnpm i
pnpm -r build
```

## Try (PostgreSQL URL as example)
```bash
DATABASE_URL="postgresql://scott:tiger@localhost/mydb" node packages/@nublox/sqlx-cli/dist/index.js ping
```
