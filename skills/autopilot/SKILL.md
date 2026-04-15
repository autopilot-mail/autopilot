---
name: autopilot
description: Self-host agentmail with pluggable storage and transports. Use when building a self-hosted email backend for AI agents, integrating SES/SMTP email into existing apps, or needing full control over email data storage. Provides the same SDK surface as hosted agentmail but runs in your infrastructure with your choice of PostgreSQL, MongoDB, SQLite, or custom storage.
license: MIT
metadata:
  author: autopilot-mail
  version: '1.0'
---

# autopilot

Self-hosted agentmail server SDK. This is a **library, not a server** — mount webhook handlers into your existing app and use the ServerSDK programmatically. Compatible with the hosted `agentmail` client SDK.

## Installation

```bash
npm install @autopilot-mail/core

# Pick a storage adapter:
npm install @autopilot-mail/postgres    # PostgreSQL (production)
npm install @autopilot-mail/mongodb     # MongoDB (production)
npm install @autopilot-mail/sqlite      # SQLite (local dev)
# In-memory adapter included in @autopilot-mail/core — no extra install needed

# Pick a transport:
npm install @autopilot-mail/ses         # AWS SES
npm install @autopilot-mail/smtp        # SMTP
# NoopTransport included in @autopilot-mail/core — no extra install needed

# For SES inbound webhooks (optional):
npm install @aws-sdk/client-s3
```

## Setup

```typescript
import { AutopilotServer } from '@autopilot-mail/core';
import { PostgresStorageAdapter } from '@autopilot-mail/postgres';
import { SesTransport } from '@autopilot-mail/ses';

const server = new AutopilotServer({
  storage: new PostgresStorageAdapter({
    connectionString: process.env.DATABASE_URL!,
  }),
  transport: new SesTransport({ region: 'us-east-1' }),
  defaultDomain: 'mail.myapp.com',
});
await server.initialize();
```

Transport is **optional** — omit for receive-only or query-only setups:

```typescript
import { AutopilotServer } from '@autopilot-mail/core';
import { MongoStorageAdapter } from '@autopilot-mail/mongodb';

const server = new AutopilotServer({
  storage: new MongoStorageAdapter({ uri: 'mongodb://localhost:27017' }),
  defaultDomain: 'mail.myapp.com',
  // No transport — read-only mode
});
```

## Inboxes

```typescript
// Create inbox (auto-generated or custom username)
const inbox = await server.inboxes.create({
  username: 'support',
  displayName: 'Support Agent',
});
// inbox.email === 'support@mail.myapp.com'

// List, get, update, delete
const { inboxes } = await server.inboxes.list();
const fetched = await server.inboxes.get(inbox.inboxId);
await server.inboxes.update(inbox.inboxId, { displayName: 'New Name' });
await server.inboxes.delete(inbox.inboxId);
```

## Messages

```typescript
// Send message
const { messageId, threadId } = await server.inboxes.messages.send(inbox.inboxId, {
  to: 'customer@example.com',
  subject: 'Order shipped',
  text: 'Your order has shipped!',
  html: '<p>Your order has shipped!</p>',
  labels: ['outreach'],
});

// Reply
await server.inboxes.messages.reply(inbox.inboxId, messageId, {
  text: 'Tracking number: XYZ123',
});

// Reply all (includes all original recipients minus self)
await server.inboxes.messages.replyAll(inbox.inboxId, messageId, {
  text: 'Updated everyone',
});

// Forward
await server.inboxes.messages.forward(inbox.inboxId, messageId, {
  to: 'manager@example.com',
  text: 'FYI',
});

// List, get, update labels, delete
const { messages } = await server.inboxes.messages.list(inbox.inboxId, { limit: 20 });
const msg = await server.inboxes.messages.get(inbox.inboxId, messageId);
await server.inboxes.messages.update(inbox.inboxId, messageId, {
  addLabels: ['reviewed'],
  removeLabels: ['new'],
});
await server.inboxes.messages.delete(inbox.inboxId, messageId);

// Get raw MIME and attachments
const raw = await server.inboxes.messages.getRaw(inbox.inboxId, messageId);
const attachment = await server.inboxes.messages.getAttachment(inbox.inboxId, messageId, 'att_123');
```

## Threads

```typescript
// List threads in inbox
const { threads } = await server.inboxes.threads.list(inbox.inboxId);

// List all threads (across all inboxes)
const allThreads = await server.threads.list();

// Get thread with all messages
const thread = await server.threads.get(threadId);
console.log(thread.messages.length);
console.log(thread.subject);
console.log(thread.senders);
console.log(thread.messageCount);
```

## Drafts

```typescript
// Create draft
const draft = await server.inboxes.drafts.create(inbox.inboxId, {
  to: 'recipient@example.com',
  subject: 'Needs approval',
  text: 'Draft content for review',
});

// Update draft
await server.inboxes.drafts.update(inbox.inboxId, draft.draftId, {
  text: 'Updated content',
});

// Send draft (converts to message, deletes draft)
const result = await server.inboxes.drafts.send(inbox.inboxId, draft.draftId);
```

## Webhooks (outbound notifications)

Register URLs to receive events when messages arrive or are sent:

```typescript
// Register webhook
const webhook = await server.webhooks.create({
  url: 'https://myapp.com/hooks/mail',
  eventTypes: ['message.received', 'message.sent'],
});

// Requires webhookDispatch: true in server config
const server = new AutopilotServer({
  storage,
  transport,
  defaultDomain: 'mail.myapp.com',
  webhookDispatch: true, // enables outbound event dispatch
});
```

Events are signed with HMAC-SHA256. Verify via the `X-Autopilot-Signature` header using the webhook's `secret`.

## Inbound Webhook Handler (SES/SNS)

Mount a handler to receive inbound emails from AWS SES via SNS:

```typescript
import express from 'express';
import { createExpressWebhookHandler } from '@autopilot-mail/core/webhooks/express';

const app = express();
app.use(express.text({ type: 'text/plain' })); // SNS sends text/plain
app.post('/webhooks/ses', createExpressWebhookHandler(server));
```

For Hono:

```typescript
import { createHonoWebhookHandler } from '@autopilot-mail/core/webhooks/hono';
app.post('/webhooks/ses', createHonoWebhookHandler(server));
```

Requires `s3` config for fetching raw emails:

```typescript
const server = new AutopilotServer({
  storage,
  transport,
  defaultDomain: 'mail.myapp.com',
  s3: { region: 'us-east-1', bucket: 'my-ses-inbound' },
});
```

## Direct Inbound Processing

Process raw MIME emails without webhooks (e.g., from S3, IMAP, or any source):

```typescript
const rawMime = Buffer.from(/* raw email content */);
const message = await server.processInboundEmail(rawMime, 'inbox@mail.myapp.com');
// message is automatically threaded, stored, and indexed
```

## Domains

```typescript
const domain = await server.domains.create({ domain: 'custom.example.com' });
const { domains } = await server.domains.list();
```

## Storage Adapters

| Adapter    | Import Path                  | Install          | Use Case   |
| ---------- | ---------------------------- | ---------------- | ---------- |
| In-Memory  | `@autopilot-mail/core`     | (built-in)               | Testing    |
| PostgreSQL | `@autopilot-mail/postgres` | `@autopilot-mail/postgres` | Production |
| MongoDB    | `@autopilot-mail/mongodb`  | `@autopilot-mail/mongodb`  | Production |
| SQLite     | `@autopilot-mail/sqlite`   | `@autopilot-mail/sqlite`   | Local dev  |

Custom adapters: implement the `StorageAdapter` interface from `@autopilot-mail/core`.

## Email Transports

| Transport | Import Path                | Install                 |
| --------- | -------------------------- | ----------------------- |
| AWS SES   | `@autopilot-mail/ses`  | `@autopilot-mail/ses`  |
| SMTP      | `@autopilot-mail/smtp` | `@autopilot-mail/smtp` |
| Noop      | `@autopilot-mail/core` | (built-in)             |

## Testing Pattern

```typescript
import { AutopilotServer, InMemoryStorageAdapter, NoopTransport } from '@autopilot-mail/core';

const transport = new NoopTransport();
const server = new AutopilotServer({
  storage: new InMemoryStorageAdapter(),
  transport,
  defaultDomain: 'test.local',
});
await server.initialize();

// Send a message
const inbox = await server.inboxes.create({ username: 'bot' });
await server.inboxes.messages.send(inbox.inboxId, {
  to: 'user@example.com',
  subject: 'Test',
  text: 'Hello',
});

// Assert on transport
console.log(transport.sent.length); // 1
console.log(transport.sent[0].params.to); // ['user@example.com']
transport.clear(); // reset for next test
```

## Using with the hosted agentmail client SDK

If you expose REST endpoints wrapping the ServerSDK, the official `agentmail` npm package works unchanged:

```typescript
import { AgentMailClient } from 'agentmail';

const client = new AgentMailClient({
  baseUrl: 'https://my-selfhosted.example.com',
  apiKey: 'my-local-key',
});

// Same API as hosted agentmail
const inbox = await client.inboxes.create({ displayName: 'Agent' });
```
