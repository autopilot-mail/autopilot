# Getting Started

## Install

```bash
npm install @autopilot-mail/core
```

Then pick your adapters:

```bash
npm install @autopilot-mail/postgres    # or mongodb, sqlite, d1
npm install @autopilot-mail/ses         # or smtp
```

## Minimal Example

```typescript
import { AutopilotServer } from '@autopilot-mail/core';
import { InMemoryStorageAdapter } from '@autopilot-mail/core/storage/memory';
import { NoopTransport } from '@autopilot-mail/core/transport/noop';

const server = new AutopilotServer({
  storage: new InMemoryStorageAdapter(),
  transport: new NoopTransport(),
  defaultDomain: 'test.local',
});
await server.initialize();

const inbox = await server.inboxes.create({ username: 'bot' });
console.log(inbox.email); // bot@test.local

await server.inboxes.messages.send(inbox.inboxId, {
  to: 'user@example.com',
  subject: 'Hello',
  text: 'Sent from Autopilot',
});
```

## Production Example

```typescript
import { AutopilotServer } from '@autopilot-mail/core';
import { PostgresStorageAdapter } from '@autopilot-mail/postgres';
import { SesTransport } from '@autopilot-mail/ses';
import { S3FileStorage } from '@autopilot-mail/s3';

const server = new AutopilotServer({
  storage: new PostgresStorageAdapter({
    connectionString: process.env.DATABASE_URL!,
  }),
  transport: new SesTransport({ region: 'us-east-1' }),
  fileStorage: new S3FileStorage({
    region: 'us-east-1',
    bucket: 'my-autopilot-files',
  }),
  defaultDomain: 'mail.myapp.com',
  webhookDispatch: true,
});
await server.initialize();
```

## Config Options

```typescript
new AutopilotServer({
  storage: StorageAdapter,          // required
  transport?: EmailTransport,       // optional — omit for read-only
  fileStorage?: FileStorageProvider, // optional — omit to store files in DB
  defaultDomain: string,            // required — domain for new inboxes
  podId?: string,                   // default: 'default'
  s3?: { region, bucket },          // for SES inbound webhook handler
  webhookDispatch?: boolean,        // POST events to registered webhook URLs
  logger?: Logger,                  // custom logger
});
```

## Next Steps

- [Server SDK API](./server-sdk-api.md) — full method reference
- [Configuration](./configuration.md) — TOML config for standalone server
- [Storage Adapters](./adapters/storage.md) — Postgres, MongoDB, SQLite, D1
- [Transports](./adapters/transports.md) — SES, SMTP
- [Webhooks](./guides/webhooks.md) — inbound + outbound webhook setup
