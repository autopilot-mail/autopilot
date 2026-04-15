# Storage Adapters

Storage adapters handle all structured data: inboxes, messages, threads, drafts, webhooks, and domains.

## Available Adapters

| Adapter       | Package                           | Peer Deps        | Best For   |
| ------------- | --------------------------------- | ---------------- | ---------- |
| In-Memory     | `@autopilot-mail/core` (built-in) | none             | Testing    |
| PostgreSQL    | `@autopilot-mail/postgres`        | `pg`             | Production |
| MongoDB       | `@autopilot-mail/mongodb`         | `mongodb`        | Production |
| SQLite        | `@autopilot-mail/sqlite`          | `better-sqlite3` | Local dev  |
| Cloudflare D1 | `@autopilot-mail/d1`              | none             | Serverless |

## PostgreSQL

```bash
npm install @autopilot-mail/postgres pg
```

```typescript
import { PostgresStorageAdapter } from '@autopilot-mail/postgres';

const storage = new PostgresStorageAdapter({
  connectionString: 'postgresql://user:pass@localhost:5432/autopilot',
  schema: 'autopilot', // default
  pool: { min: 2, max: 10 },
});
```

Auto-creates all tables and indexes in the configured schema on `initialize()`.

**Hosting options:** [Neon](https://neon.tech) (free tier), [Supabase](https://supabase.com) (free tier), AWS RDS, self-hosted.

## MongoDB

```bash
npm install @autopilot-mail/mongodb mongodb
```

```typescript
import { MongoStorageAdapter } from '@autopilot-mail/mongodb';

const storage = new MongoStorageAdapter({
  uri: 'mongodb://localhost:27017',
  database: 'autopilot', // default
});
```

Auto-creates collections and indexes on `initialize()`.

**Hosting options:** [MongoDB Atlas](https://www.mongodb.com/atlas) (512 MB free forever).

## SQLite

```bash
npm install @autopilot-mail/sqlite better-sqlite3
```

```typescript
import { SqliteStorageAdapter } from '@autopilot-mail/sqlite';

const storage = new SqliteStorageAdapter({
  filename: './autopilot.db', // or ':memory:'
});
```

Uses WAL mode for concurrent reads. Good for single-process deployments.

## Cloudflare D1

```bash
npm install @autopilot-mail/d1
```

```typescript
import { D1StorageAdapter } from '@autopilot-mail/d1';

const storage = new D1StorageAdapter({
  accountId: 'your-cloudflare-account-id',
  databaseId: 'your-d1-database-id',
  apiToken: 'your-cloudflare-api-token',
});
```

Uses the D1 REST API. SQLite-compatible SQL. See [Cloudflare deployment guide](../deployment/cloudflare.md).

## In-Memory

```typescript
import { InMemoryStorageAdapter } from '@autopilot-mail/core/storage/memory';

const storage = new InMemoryStorageAdapter();
```

Data lost on restart. Use for testing only.

## Custom Adapter

Implement the `StorageAdapter` interface:

```typescript
import type { StorageAdapter } from '@autopilot-mail/core';

class TursoAdapter implements StorageAdapter {
  async initialize() {
    /* create tables */
  }
  async close() {
    /* cleanup */
  }

  async createInbox(params) {
    /* ... */
  }
  async getInbox(inboxId) {
    /* ... */
  }
  // ... all methods from the interface
}
```

See [`src/storage/adapter.ts`](../../src/storage/adapter.ts) for the full interface.
