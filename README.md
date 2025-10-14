# NuBlox SQLx OS — Starter (Workspace Fixed)

## Setup
```bash
pnpm i
pnpm -r build
```

## Run
```bash
export DATABASE_URL="postgresql://scott:tiger@localhost/mydb"
node packages/@nublox/sqlx-cli/dist/index.js learn
node packages/@nublox/sqlx-cli/dist/index.js ping
```
```
