---
name: autopilot-migrate
description: Migrate from hosted AgentMail to self-hosted Autopilot. Use when switching from agentmail.to to your own infrastructure, migrating existing inboxes and message history, setting up DNS cutover, redirecting the agentmail client SDK to a self-hosted endpoint, or running both in parallel during transition.
license: MIT
metadata:
  author: autopilot-mail
  version: '0.1'
---

# Migrate from AgentMail to Autopilot

This guide covers migrating from the hosted AgentMail service (`api.agentmail.to`) to a self-hosted Autopilot instance. Autopilot implements the same v0 API, so the official `agentmail` client SDK works unchanged — you just change the `baseUrl`.

## Migration Overview

| What             | AgentMail (hosted)         | Autopilot (self-hosted)                    |
| ---------------- | -------------------------- | ------------------------------------------ |
| API endpoint     | `https://api.agentmail.to` | `https://your-server.com`                  |
| Auth             | `am_xxx` API key           | Your own API keys                          |
| Email transport  | Managed by AgentMail       | AWS SES / SMTP (you manage)                |
| Storage          | Managed by AgentMail       | PostgreSQL / MongoDB / SQLite (you manage) |
| Domain           | `@agentmail.to` or custom  | Your domain (SES verified)                 |
| Inbound webhooks | AgentMail → your app       | SES → SNS → Autopilot → your app           |

## Step 1: Set Up Autopilot Infrastructure

Follow the [autopilot-setup skill](../autopilot-setup/SKILL.md) to provision:

1. AWS SES — verify your domain
2. S3 bucket — for inbound email storage
3. SNS topic — for webhook delivery
4. SES receipt rule — route inbound to S3 + SNS
5. Database — PostgreSQL, MongoDB, or SQLite
6. DNS records — SPF, DKIM, DMARC, MX

## Step 2: Run Autopilot Server

```bash
npx autopilot --config ./autopilot.toml
```

Or with Docker:

```bash
docker build -t autopilot .
docker run -p 3100:3100 \
  -v ./autopilot.toml:/etc/autopilot/config.toml \
  autopilot
```

Verify it's running:

```bash
curl http://localhost:3100/health
# {"status":"ok"}
```

## Step 3: Migrate Data

### Option A: Fresh start (recommended for most cases)

Skip data migration — create new inboxes on Autopilot and update your application to use the new inbox IDs. This is simplest and avoids any data format mismatches.

```typescript
// Old code (hosted AgentMail)
import { AgentMailClient } from 'agentmail';
const client = new AgentMailClient({ apiKey: 'am_xxx' });
const inbox = await client.inboxes.create({ username: 'support' });
// inbox.email = support@agentmail.to

// New code (self-hosted Autopilot)
const client = new AgentMailClient({
  baseUrl: 'https://your-server.com',
  apiKey: 'your-autopilot-key',
});
const inbox = await client.inboxes.create({ username: 'support' });
// inbox.email = support@mail.myapp.com
```

### Option B: Export and import history

Use the migration script to pull data from hosted AgentMail and push it into Autopilot:

```typescript
import { AgentMailClient } from 'agentmail';
import { AutopilotServer } from '@autopilot-mail/core';
import { PostgresStorageAdapter } from '@autopilot-mail/postgres';
import { SesTransport } from '@autopilot-mail/ses';

// Source: hosted AgentMail
const source = new AgentMailClient({ apiKey: 'am_xxx' });

// Destination: self-hosted Autopilot
const dest = new AutopilotServer({
  storage: new PostgresStorageAdapter({ connectionString: process.env.DATABASE_URL! }),
  transport: new SesTransport({ region: 'us-east-1' }),
  defaultDomain: 'mail.myapp.com',
});
await dest.initialize();

// Migrate inboxes
const { inboxes } = await source.inboxes.list({ limit: 100 });
for (const inbox of inboxes) {
  const newInbox = await dest.inboxes.create({
    username: inbox.email.split('@')[0],
    displayName: inbox.displayName,
  });
  console.log(`Migrated inbox: ${inbox.email} → ${newInbox.email}`);

  // Migrate threads and messages for this inbox
  let pageToken: string | undefined;
  do {
    const result = await source.inboxes.messages.list(inbox.inboxId, {
      limit: 50,
      pageToken,
    });

    for (const msg of result.messages) {
      // Fetch full message with body
      const full = await source.inboxes.messages.get(inbox.inboxId, msg.messageId);

      // Get raw MIME if available
      try {
        const raw = await source.inboxes.messages.getRaw(inbox.inboxId, msg.messageId);
        await dest.processInboundEmail(Buffer.from(await raw.arrayBuffer()), newInbox.email);
      } catch {
        // Raw not available — create message from structured data
        console.log(`  Skipped raw for ${msg.messageId} (not available)`);
      }
    }

    pageToken = result.nextPageToken;
  } while (pageToken);
}

console.log('Migration complete');
await dest.close();
```

## Step 4: Update Your Application

The only code change is the `baseUrl` and API key:

### Before (hosted AgentMail)

```typescript
import { AgentMailClient } from 'agentmail';

const client = new AgentMailClient({
  apiKey: process.env.AGENTMAIL_API_KEY,
});
```

### After (self-hosted Autopilot)

```typescript
import { AgentMailClient } from 'agentmail';

const client = new AgentMailClient({
  baseUrl: process.env.AUTOPILOT_URL, // https://your-server.com
  apiKey: process.env.AUTOPILOT_API_KEY,
});
```

Every SDK method works unchanged: `client.inboxes.create()`, `client.inboxes.messages.send()`, `client.threads.get()`, etc.

### Or use the ServerSDK directly (no HTTP overhead)

If Autopilot runs in the same process as your app:

```typescript
import { AutopilotServer } from '@autopilot-mail/core';
import { PostgresStorageAdapter } from '@autopilot-mail/postgres';
import { SesTransport } from '@autopilot-mail/ses';

const server = new AutopilotServer({
  storage: new PostgresStorageAdapter({ connectionString: process.env.DATABASE_URL! }),
  transport: new SesTransport({ region: 'us-east-1' }),
  defaultDomain: 'mail.myapp.com',
});
await server.initialize();

// Same API surface — no HTTP, no latency
const inbox = await server.inboxes.create({ username: 'support' });
await server.inboxes.messages.send(inbox.inboxId, {
  to: 'customer@example.com',
  subject: 'Hello',
  text: 'Sent from Autopilot',
});
```

## Step 5: DNS Cutover

If you were using a custom domain on hosted AgentMail, update your DNS:

1. **Remove** the old MX record pointing to AgentMail
2. **Add** a new MX record pointing to SES inbound:

| Type | Name             | Priority | Value                                  |
| ---- | ---------------- | -------- | -------------------------------------- |
| MX   | `mail.myapp.com` | 10       | `inbound-smtp.us-east-1.amazonaws.com` |

3. Update SPF to reference `amazonses.com` instead of AgentMail's SPF

DNS propagation takes up to 48 hours. During this window, some emails may still route to AgentMail.

## Step 6: Migrate Webhooks

### AgentMail webhooks → Autopilot webhooks

If you had webhooks registered on hosted AgentMail for events like `message.received`:

```typescript
// Register the same webhooks on Autopilot
const server = new AutopilotServer({
  /* ... */
});
await server.webhooks.create({
  url: 'https://myapp.com/hooks/mail',
  eventTypes: ['message.received', 'message.sent'],
});
```

### Inbound webhook (SES → Autopilot)

This replaces AgentMail's internal inbound processing. Configure in `autopilot.toml`:

```toml
[webhooks]
dispatch = true
ses_endpoint = "/webhooks/ses"
verify_sns_signature = true
```

Then subscribe your SNS topic to Autopilot's webhook endpoint:

```bash
aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol https \
  --notification-endpoint "https://your-server.com/webhooks/ses" \
  --region us-east-1
```

## Parallel Running (Blue-Green)

You can run both hosted AgentMail and Autopilot simultaneously during the transition:

1. Keep your existing AgentMail setup running
2. Start Autopilot with a different domain (e.g., `mail2.myapp.com`)
3. Test sending and receiving on the new domain
4. Once confident, update DNS to point the primary domain at SES
5. Decommission hosted AgentMail

This avoids any downtime — if something goes wrong, you can revert DNS back to AgentMail.

## Rollback

If you need to roll back:

1. Revert DNS MX record to point at AgentMail's servers
2. Revert SPF TXT record
3. Change your app's `baseUrl` back to `https://api.agentmail.to`
4. No data loss — hosted AgentMail retains your data

## Feature Comparison

| Feature                            | AgentMail (hosted) | Autopilot (self-hosted)    |
| ---------------------------------- | ------------------ | -------------------------- |
| Inboxes                            | Yes                | Yes                        |
| Messages (send/reply/forward)      | Yes                | Yes                        |
| Threads                            | Yes                | Yes                        |
| Drafts                             | Yes                | Yes                        |
| Labels                             | Yes                | Yes                        |
| Attachments                        | Yes                | Yes                        |
| Webhooks (outbound events)         | Yes                | Yes                        |
| Custom domains                     | Paid plans         | Unlimited (you manage DNS) |
| WebSockets                         | Yes                | Not yet                    |
| Pods (multi-tenant)                | Yes                | Pod ID config only         |
| Allow/block lists                  | Yes                | Not yet                    |
| `extracted_text` (reply stripping) | Yes (Talon)        | Not yet                    |
| Agent sign-up API                  | Yes                | N/A (you manage auth)      |
| IMAP/SMTP access                   | Yes                | N/A                        |
| Dashboard UI                       | Yes                | N/A (API only)             |

## Reference files

- `references/api-mapping.md` — endpoint-by-endpoint mapping between hosted AgentMail and Autopilot
