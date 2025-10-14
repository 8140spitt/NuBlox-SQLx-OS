# NuBlox SQLx OS

NuBlox SQLx OS is a **self‑learning Database Operating System (DBOS)**. It learns any SQL engine, plans zero‑downtime changes, enforces compliance, and powers an AI‑assisted Database Studio.

## Quickstart
```bash
cp .env.example .env
pnpm i
pnpm -F @nublox/sqlx-cli build
DATABASE_URL="postgresql://scott:tiger@localhost/mydb" sqlx ping
```
