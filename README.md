
# NuBlox SQLx OS — Starter Monorepo

Minimal, buildable scaffold to match the proposed architecture.

## Quickstart
```bash
pnpm i
pnpm -r build

export DATABASE_URL="mysql://root:pass@localhost:3306/platform"

node packages/@nublox/sqlx-cli/dist/index.js ping
node packages/@nublox/sqlx-cli/dist/index.js capabilities
node packages/@nublox/sqlx-cli/dist/index.js learn
```
