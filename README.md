<p align="center">
  <img src="static/header.jpeg" alt="autopilot mail" width="100%" />
</p>

# autopilot

Self-hosted email server SDK for AI agents. Pluggable storage, email transports, and webhook handlers for agent email inboxes.

**This is a library, not a server.** You mount webhook handlers into your existing app and/or use the ServerSDK programmatically. Same API surface as the hosted [agentmail](https://www.npmjs.com/package/agentmail) SDK — but you own the infrastructure.

## Why self-host?

Hosted AgentMail charges per inbox and per email. At scale, this adds up fast:

### Hosted AgentMail pricing

|                | Free  | Developer | Startup |
| -------------- | ----- | --------- | ------- |
| **Price**      | $0/mo | $20/mo    | $200/mo |
| Inboxes        | 3     | 10        | 150     |
| Emails/month   | 3,000 | 10,000    | 150,000 |
| Storage        | 3 GB  | 10 GB     | 150 GB  |
| Custom domains | -     | 10        | 150     |
| Dedicated IPs  | -     | -         | Yes     |

### Self-hosted with `autopilot`

|                | SES + Neon (free)        | SES + Supabase           | SES + RDS (prod) | SMTP + SQLite            |
| -------------- | ------------------------ | ------------------------ | ---------------- | ------------------------ |
| **Price**      | ~$0/mo                   | ~$0/mo                   | ~$145/mo         | $0/mo                    |
| Inboxes        | **Unlimited**            | **Unlimited**            | **Unlimited**    | **Unlimited**            |
| Emails/month   | 3,000 free then $0.10/1k | 3,000 free then $0.10/1k | $0.10/1k         | Depends on SMTP provider |
| Storage        | 0.5 GB free              | 500 MB free              | $0.115/GB        | Local disk               |
| Custom domains | **Unlimited**            | **Unlimited**            | **Unlimited**    | **Unlimited**            |
| Dedicated IPs  | $24.95/mo each           | $24.95/mo each           | $24.95/mo each   | N/A                      |

### Cost at scale: 100 agents sending 1,000 emails/month each

| Setup                                   | Monthly cost                         |
| --------------------------------------- | ------------------------------------ |
| Hosted AgentMail (Startup, 150 inboxes) | **$200/mo**                          |
| autopilot + SES + Supabase Pro          | **~$35/mo** ($10 SES + $25 Supabase) |
| autopilot + SES + Neon paid             | **~$15/mo** ($10 SES + ~$5 Neon)     |
| autopilot + SES + self-hosted Postgres  | **~$10/mo** (SES only)               |

### Email transport comparison

| Transport            | Cost per 1,000 emails | Free tier            | Best for                            |
| -------------------- | --------------------- | -------------------- | ----------------------------------- |
| **AWS SES**          | $0.10                 | 3,000/mo (12 months) | Production — cheapest at scale      |
| **Resend**           | $0.40 (Pro plan)      | 3,000/mo (forever)   | Simple setup, good DX               |
| **Postmark**         | $1.50                 | 100/mo               | Transactional — best deliverability |
| **Mailgun**          | $0.70 (Foundation)    | 100/day              | SMTP relay with tracking            |
| **SendGrid**         | $0.40 (Essentials)    | 100/day (60 days)    | Marketing + transactional           |
| **Self-hosted SMTP** | $0                    | Unlimited            | Dev/testing only                    |

### Database hosting comparison

| Database                | Free tier                    | Paid starts at       | Best for                        |
| ----------------------- | ---------------------------- | -------------------- | ------------------------------- |
| **Neon** (Postgres)     | 0.5 GB, 100 compute-hours/mo | Usage-based (~$5/mo) | Serverless, scales to zero      |
| **Supabase** (Postgres) | 500 MB, 2 projects           | $25/mo/project       | Auth + Postgres bundle          |
| **MongoDB Atlas**       | 512 MB (forever)             | $8/mo (Flex)         | Document store, flexible schema |
| **AWS RDS** (Postgres)  | 750 hrs/mo (12 months)       | ~$140/mo             | Production, managed backups     |
| **SQLite** (local)      | Unlimited                    | $0                   | Single-process, local dev       |

**Bottom line:** With SES ($0.10/1k emails) + Neon free tier, you get unlimited inboxes and 3,000 emails/month for **$0/mo** — vs. $20/mo for 10 inboxes on hosted AgentMail.

---

## Install

```bash
npm install autopilot

# Pick a storage adapter (one):
npm install pg                    # PostgreSQL
npm install mongodb               # MongoDB
npm install better-sqlite3        # SQLite

# Pick a transport (one):
npm install @aws-sdk/client-sesv2 # AWS SES
npm install nodemailer            # SMTP

# For SES inbound webhooks (optional):
npm install @aws-sdk/client-s3
```

## Quick Start

### Full setup: Express + PostgreSQL + SES

```typescript
import { AutopilotServer } from 'autopilot';
import { PostgresStorageAdapter } from 'autopilot/storage/postgres';
import { SesTransport } from 'autopilot/transport/ses';
import { createExpressWebhookHandler } from 'autopilot/webhooks/express';
import express from 'express';

const server = new AutopilotServer({
  storage: new PostgresStorageAdapter({
    connectionString: process.env.DATABASE_URL!,
  }),
  transport: new SesTransport({ region: 'us-east-1' }),
  defaultDomain: 'mail.myapp.com',
  s3: { region: 'us-east-1', bucket: 'my-ses-inbound' },
  webhookDispatch: true,
});

await server.initialize();

const app = express();
app.use(express.text({ type: 'text/plain' }));
app.post('/webhooks/ses', createExpressWebhookHandler(server));

// Create an agent inbox
const inbox = await server.inboxes.create({
  username: 'support',
  displayName: 'Support Bot',
});
// => support@mail.myapp.com

// Send mail
const { messageId, threadId } = await server.inboxes.messages.send(inbox.inboxId, {
  to: 'customer@gmail.com',
  subject: 'Your order shipped',
  text: 'Hi, your order #1234 has shipped!',
  html: '<p>Your order <b>#1234</b> has shipped!</p>',
});

// List threads
const { threads } = await server.inboxes.threads.list(inbox.inboxId);

// Register a webhook for new messages
await server.webhooks.create({
  url: 'https://myapp.com/hooks/mail',
  eventTypes: ['message.received'],
});

app.listen(3000);
```

### Query-only: MongoDB, no sending

```typescript
import { AutopilotServer } from 'autopilot';
import { MongoStorageAdapter } from 'autopilot/storage/mongodb';

const server = new AutopilotServer({
  storage: new MongoStorageAdapter({
    uri: 'mongodb://localhost:27017',
    database: 'autopilot',
  }),
  defaultDomain: 'mail.myapp.com',
  // No transport — read-only
});

await server.initialize();

const inbox = await server.inboxes.get('inbox_abc123');
const { messages } = await server.inboxes.messages.list(inbox.inboxId, { limit: 20 });
```

### Testing with in-memory storage

```typescript
import { AutopilotServer } from 'autopilot';
import { InMemoryStorageAdapter } from 'autopilot/storage/memory';
import { NoopTransport } from 'autopilot/transport/noop';

const transport = new NoopTransport();
const server = new AutopilotServer({
  storage: new InMemoryStorageAdapter(),
  transport,
  defaultDomain: 'test.local',
});
await server.initialize();

const inbox = await server.inboxes.create({ username: 'bot' });
await server.inboxes.messages.send(inbox.inboxId, {
  to: 'user@example.com',
  subject: 'Test',
  text: 'Hello',
});

// NoopTransport records all sends
console.log(transport.sent.length); // 1
console.log(transport.sent[0].params.to); // ['user@example.com']
```

### SQLite + SMTP for local dev

```typescript
import { AutopilotServer } from 'autopilot';
import { SqliteStorageAdapter } from 'autopilot/storage/sqlite';
import { SmtpTransport } from 'autopilot/transport/smtp';

const server = new AutopilotServer({
  storage: new SqliteStorageAdapter({ filename: './autopilot.db' }),
  transport: new SmtpTransport({
    host: 'smtp.gmail.com',
    port: 587,
    auth: { user: 'bot@gmail.com', pass: 'app-password' },
  }),
  defaultDomain: 'myapp.com',
});
await server.initialize();
```

### Using the official agentmail client SDK

If you wrap the ServerSDK with REST routes, the official `agentmail` package works as-is:

```typescript
import { AgentMailClient } from 'agentmail';

const client = new AgentMailClient({
  baseUrl: 'https://my-autopilot.example.com',
  apiKey: 'my-local-key',
});

const inbox = await client.inboxes.create({ displayName: 'Agent' });
```

---

## Architecture

```
┌──────────────────────────────────────────┐
│            Your Application              │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │         AutopilotServer             │ │
│  │                                     │ │
│  │  .inboxes     →  CRUD + nested:     │ │
│  │    .messages   →  send/reply/list   │ │
│  │    .threads    →  list              │ │
│  │    .drafts     →  CRUD + send       │ │
│  │  .threads      →  list/get          │ │
│  │  .drafts       →  list/get          │ │
│  │  .webhooks     →  CRUD              │ │
│  │  .domains      →  CRUD              │ │
│  │                                     │ │
│  │  .processInboundEmail(raw, to)      │ │
│  └───────────┬──────────┬──────────────┘ │
│              │          │                │
│  ┌───────────▼──┐  ┌────▼─────────────┐  │
│  │   Storage    │  │    Transport     │  │
│  │   Adapter    │  │    Adapter       │  │
│  │              │  │                  │  │
│  │ • Postgres   │  │ • SES           │  │
│  │ • MongoDB    │  │ • SMTP          │  │
│  │ • SQLite     │  │ • Noop (test)   │  │
│  │ • Memory     │  │                  │  │
│  └──────────────┘  └──────────────────┘  │
│                                          │
│  ┌──────────────────────────────────────┐ │
│  │        Webhook Handler (optional)    │ │
│  │   Express / Hono / Generic          │ │
│  │   Receives SES/SNS notifications    │ │
│  └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

## Storage Adapters

| Adapter    | Import                       | Peer Deps        | Best For   |
| ---------- | ---------------------------- | ---------------- | ---------- |
| In-Memory  | `autopilot/storage/memory`   | none             | Testing    |
| PostgreSQL | `autopilot/storage/postgres` | `pg`             | Production |
| MongoDB    | `autopilot/storage/mongodb`  | `mongodb`        | Production |
| SQLite     | `autopilot/storage/sqlite`   | `better-sqlite3` | Local dev  |

### Custom Storage

Implement the `StorageAdapter` interface:

```typescript
import type { StorageAdapter } from 'autopilot';

class MyCustomAdapter implements StorageAdapter {
  async initialize() {
    /* create tables/indexes */
  }
  async close() {
    /* cleanup */
  }
  async createInbox(params) {
    /* ... */
  }
  // ... implement all methods
}
```

## Email Transports

| Transport | Import                     | Peer Deps               |
| --------- | -------------------------- | ----------------------- |
| AWS SES   | `autopilot/transport/ses`  | `@aws-sdk/client-sesv2` |
| SMTP      | `autopilot/transport/smtp` | `nodemailer`            |
| Noop      | `autopilot/transport/noop` | none                    |

Transport is **optional** — omit for receive-only or query-only setups.

## Webhook Handlers

For receiving inbound emails via AWS SES:

1. Configure SES to store incoming emails in S3
2. Set up an SNS topic that triggers on email receipt
3. Point the SNS subscription at your webhook endpoint

The handler automatically:

- Confirms SNS subscriptions
- Verifies SNS message signatures
- Fetches raw email from S3
- Parses MIME and stores the message
- Dispatches events to registered webhook URLs

## Outbound Webhook Events

When `webhookDispatch: true`, the server POSTs events to registered webhook URLs:

- `message.received` — new inbound email
- `message.sent` — outbound email sent
- `message.bounced` — delivery bounce
- `message.complained` — spam complaint

Payloads are signed with HMAC-SHA256 using the webhook's secret. Verify via the `X-Autopilot-Signature` header.

## ServerSDK API

```typescript
// Inboxes
server.inboxes.create(params?)
server.inboxes.get(inboxId)
server.inboxes.list(params?)
server.inboxes.update(inboxId, params)
server.inboxes.delete(inboxId)

// Messages (scoped to inbox)
server.inboxes.messages.send(inboxId, params)
server.inboxes.messages.reply(inboxId, messageId, params)
server.inboxes.messages.replyAll(inboxId, messageId, params)
server.inboxes.messages.forward(inboxId, messageId, params)
server.inboxes.messages.list(inboxId, params?)
server.inboxes.messages.get(inboxId, messageId)
server.inboxes.messages.update(inboxId, messageId, params)
server.inboxes.messages.delete(inboxId, messageId)
server.inboxes.messages.getRaw(inboxId, messageId)
server.inboxes.messages.getAttachment(inboxId, messageId, attachmentId)

// Threads
server.inboxes.threads.list(inboxId, params?)
server.threads.list(params?)
server.threads.get(threadId)

// Drafts
server.inboxes.drafts.create(inboxId, params)
server.inboxes.drafts.get(inboxId, draftId)
server.inboxes.drafts.list(inboxId, params?)
server.inboxes.drafts.update(inboxId, draftId, params)
server.inboxes.drafts.delete(inboxId, draftId)
server.inboxes.drafts.send(inboxId, draftId)

// Webhooks
server.webhooks.create(params)
server.webhooks.get(webhookId)
server.webhooks.list(params?)
server.webhooks.update(webhookId, params)
server.webhooks.delete(webhookId)

// Domains
server.domains.create(params)
server.domains.get(domainId)
server.domains.list(params?)
server.domains.update(domainId, params)
server.domains.delete(domainId)

// Direct inbound processing
server.processInboundEmail(rawMimeBuffer, recipientEmail)
```

## Examples

See the [`examples/`](examples/) directory:

| Example                                                         | Description                                    |
| --------------------------------------------------------------- | ---------------------------------------------- |
| [`01-basic-send.ts`](examples/01-basic-send.ts)                 | InMemory + NoopTransport — send, reply, thread |
| [`02-express-webhooks.ts`](examples/02-express-webhooks.ts)     | Express + PostgreSQL + SES — full production   |
| [`03-query-only-mongo.ts`](examples/03-query-only-mongo.ts)     | MongoDB — read-only, no transport              |
| [`04-sqlite-smtp.ts`](examples/04-sqlite-smtp.ts)               | SQLite + SMTP — local development              |
| [`05-inbound-processing.ts`](examples/05-inbound-processing.ts) | Direct MIME processing with threading          |

## Testing

```bash
bun test
```

31 E2E tests covering inbox CRUD, sending, threading, reply/reply-all/forward, drafts, webhooks, domains, and inbound MIME processing.

## License

MIT
