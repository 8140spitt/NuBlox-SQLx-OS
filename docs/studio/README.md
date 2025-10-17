# SQLx Studio Documentation

This directory contains documentation for SQLx Studio - the visual database management and development environment for NuBlox SQLx OS.

## Purpose

SQLx Studio provides a modern, web-based interface for:
- Database schema visualization and exploration
- Query building and execution
- Data browsing and editing
- Migration management
- Performance monitoring
- API testing and documentation

## Planned Components

### User Interface
- [ ] **Dashboard** (`dashboard.md`) - Overview and system health
- [ ] **Schema Explorer** (`schema-explorer.md`) - Visual schema browser
- [ ] **Query Editor** (`query-editor.md`) - SQL and visual query builder
- [ ] **Data Browser** (`data-browser.md`) - Table data viewing and editing
- [ ] **API Inspector** (`api-inspector.md`) - Test generated APIs
- [ ] **Performance Dashboard** (`performance.md`) - Query and system metrics

### Features
- [ ] **Visual Query Builder** - Drag-and-drop query creation
- [ ] **Schema Migrations** - Visual migration designer
- [ ] **Data Relationships** - ER diagram generation
- [ ] **AI Assistant** - Natural language query generation
- [ ] **Collaboration** - Team sharing and permissions
- [ ] **Real-time Updates** - Live data refresh

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              SQLx Studio Frontend                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │Dashboard │ │  Schema  │ │  Query   │           │
│  │          │ │ Explorer │ │  Editor  │           │
│  └──────────┘ └──────────┘ └──────────┘           │
├─────────────────────────────────────────────────────┤
│              Studio API Gateway                     │
│  - Authentication                                   │
│  - WebSocket connections                            │
│  - Query execution                                  │
├─────────────────────────────────────────────────────┤
│              SQLx OS Core                           │
│  - WireVM                                          │
│  - FLO System                                      │
│  - Query Engine                                    │
└─────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend
- **Framework**: React + TypeScript
- **State Management**: Zustand / Redux
- **UI Components**: Tailwind CSS + shadcn/ui
- **Data Visualization**: D3.js / Recharts
- **Code Editor**: Monaco Editor

### Backend
- **API**: Express.js / Fastify
- **Real-time**: Socket.IO / WebSockets
- **Authentication**: JWT / OAuth 2.0

## Getting Started

### Development Setup

```bash
# Clone repository
git clone https://github.com/nublox-io/sqlx-studio

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Open browser
open http://localhost:3000
```

### Configuration

```typescript
// studio.config.ts
export default {
  sqlxConnection: {
    host: 'localhost',
    port: 5432,
    // ... other config
  },
  studio: {
    port: 3000,
    auth: {
      enabled: true,
      providers: ['local', 'github', 'google']
    },
    features: {
      aiAssistant: true,
      collaboration: true,
      realTimeUpdates: true
    }
  }
};
```

## Feature Documentation

### Schema Explorer

Visual representation of database schemas with:
- Table relationships (Foreign keys)
- Column types and constraints
- Indexes and triggers
- Search and filtering

### Query Editor

Advanced SQL editor with:
- Syntax highlighting
- Auto-completion
- Query history
- Saved queries
- Execution plans
- Result visualization

### Data Browser

Browse and edit table data:
- Pagination and filtering
- Inline editing
- Bulk operations
- Export to CSV/JSON
- Import from files

### API Inspector

Test auto-generated APIs:
- REST endpoint testing
- GraphQL playground
- WebSocket testing
- Request/response inspection
- Code generation (cURL, fetch, axios)

## User Guides

- [ ] Getting Started Guide
- [ ] Query Building Tutorial
- [ ] Schema Migration Guide
- [ ] Performance Optimization Tips
- [ ] Collaboration Features
- [ ] Keyboard Shortcuts

## Templates

Use these templates for new documentation:

- `_feature_template.md` - For new feature docs
- `_tutorial_template.md` - For user tutorials
- `_api_template.md` - For API documentation

## Related Documentation

- [API Gateway Spec](../api/SQLx-API-Gateway-and-Emitter-v1.0.md)
- [Copilot Architecture](../ai/SQLx-Copilot-Architecture-v1.0.md)
- [Security Whitepaper](../security/SQLx-Security-Whitepaper-and-ThreatModel-v4.0.md)

## Screenshots

[Coming soon]

## Demo

Try SQLx Studio: https://studio.nublox.io/demo

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## Roadmap

### Q4 2025
- [ ] Basic schema explorer
- [ ] Query editor with syntax highlighting
- [ ] Data browser with CRUD operations

### Q1 2026
- [ ] Visual query builder
- [ ] Migration designer
- [ ] Performance dashboard

### Q2 2026
- [ ] AI query assistant
- [ ] Real-time collaboration
- [ ] Mobile responsive design

## Support

- Documentation: https://docs.nublox.io/studio
- Issues: https://github.com/nublox-io/sqlx-studio/issues
- Discord: https://discord.gg/nublox
