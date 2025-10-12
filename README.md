# NuBlox SQLx — Phase 1


## Quickstart
```sh
pnpm i
pnpm build
# dev run (alias)
pnpm -F @nublox/sqlx-cli run dev -- ping --url "mysql://127.0.0.1:3306/test?ssl=0"
# install brand binary
pnpm -F @nublox/sqlx-cli link --global
nublox-sqlx ping --url "postgres://127.0.0.1:5432/postgres"