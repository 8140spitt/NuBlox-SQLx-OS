
# NuBlox SQLx OS — The World's First Database Operating System

**The database that thinks.** A revolutionary, dialect-agnostic, AI-supported database operating system that doesn't just store and query data—it understands, learns, and thinks about it.

## 🧠 What Makes NuBlox SQLx OS Special

- **🌍 Dialect Agnostic**: One interface for MySQL, PostgreSQL, SQLite, MariaDB, and more
- **🤖 AI-Powered**: Learns from every interaction and makes intelligent decisions
- **🔮 Predictive**: Anticipates issues and optimizes performance automatically  
- **🛡️ Safe**: AI-driven migration planning with intelligent rollback strategies
- **⚡ Fast**: 3-4× development velocity with 90% downtime reduction target

## Architecture

This monorepo contains the core components of the NuBlox SQLx OS:

- **`@nublox/sqlx-transport`** - Intelligent transport layer with capability discovery
- **`@nublox/sqlx-flo`** - Database flow and learning engine  
- **`@nublox/sqlx-planner`** - AI-powered migration and optimization planner
- **`@nublox/sqlx`** - Unified orchestration API
- **`@nublox/sqlx-cli`** - Command-line interface for database operations

## Quickstart
```bash
pnpm i
pnpm -r build

export DATABASE_URL="mysql://root:pass@localhost:3306/platform"

node packages/@nublox/sqlx-cli/dist/index.js ping
node packages/@nublox/sqlx-cli/dist/index.js capabilities
node packages/@nublox/sqlx-cli/dist/index.js learn
```
