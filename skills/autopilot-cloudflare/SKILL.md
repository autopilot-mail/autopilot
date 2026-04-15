---
name: autopilot-cloudflare
description: Deploy Autopilot on the Cloudflare stack — D1 for database, R2 for file storage, Workers for hosting, and Email Routing for inbound email. Use when you want a fully serverless Autopilot deployment without AWS, or when you want zero-cold-start email infrastructure on Cloudflare's edge network.
license: MIT
metadata:
  author: autopilot-mail
  version: '0.1'
---

# Autopilot on Cloudflare

Deploy Autopilot using the full Cloudflare stack: D1 (database), R2 (file storage), Workers (compute), and Email Routing (inbound email). No AWS required.

## Stack Overview

| Component     | Cloudflare Service | Purpose                       |
| ------------- | ------------------ | ----------------------------- |
| Database      | D1                 | SQLite-compatible, serverless |
| File storage  | R2                 | S3-compatible object storage  |
| Compute       | Workers            | Serverless edge hosting       |
| Inbound email | Email Routing      | Receive email at your domain  |
| DNS           | Cloudflare DNS     | Domain management             |

## Prerequisites

```bash
# Install wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Verify
wrangler whoami
```

## 1. Create D1 Database

```bash
# Create the database
wrangler d1 create autopilot-db

# Output:
# ✅ Successfully created DB 'autopilot-db'
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
# Save the database_id — you'll need it for wrangler.toml
```

## 2. Create R2 Bucket

```bash
# Create bucket for attachments and raw messages
wrangler r2 bucket create autopilot-files

# Create R2 API token for S3-compatible access:
# Dashboard → Storage & Databases → R2 → Manage API Tokens
# Permissions: Object Read & Write
# Save the Access Key ID and Secret Access Key
```

## 3. Deploy as Standalone Server (non-Workers)

If you're running Autopilot on a VPS, Docker, or any Node.js environment (not Workers), use the D1 REST API and R2 S3-compatible API:

### TOML config

```toml
[server]
port = 3100
host = "0.0.0.0"
domain = "mail.myapp.com"
api_keys = ["your-secret-key"]

[storage]
adapter = "d1"
account_id = "your-cloudflare-account-id"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
api_token = "your-cloudflare-api-token"

[transport]
adapter = "smtp"
host = "smtp.mailchannels.net"
port = 465
secure = true

[file_storage]
adapter = "r2"
account_id = "your-cloudflare-account-id"
bucket = "autopilot-files"
access_key_id = "your-r2-access-key"
secret_access_key = "your-r2-secret-key"

[logging]
level = "info"
```

```bash
npx autopilot --config ./autopilot.toml
```

### SDK usage

```typescript
import { AutopilotServer } from '@autopilot-mail/core';
import { D1StorageAdapter } from '@autopilot-mail/d1';
import { R2FileStorage } from '@autopilot-mail/r2';
import { SmtpTransport } from '@autopilot-mail/smtp';

const server = new AutopilotServer({
  storage: new D1StorageAdapter({
    accountId: process.env.CF_ACCOUNT_ID!,
    databaseId: process.env.D1_DATABASE_ID!,
    apiToken: process.env.CF_API_TOKEN!,
  }),
  fileStorage: new R2FileStorage({
    accountId: process.env.CF_ACCOUNT_ID!,
    bucket: 'autopilot-files',
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  }),
  transport: new SmtpTransport({
    host: 'smtp.mailchannels.net',
    port: 465,
    secure: true,
  }),
  defaultDomain: 'mail.myapp.com',
});

await server.initialize();

const inbox = await server.inboxes.create({ username: 'support' });
await server.inboxes.messages.send(inbox.inboxId, {
  to: 'customer@example.com',
  subject: 'Hello from Cloudflare!',
  text: 'Powered by D1 + R2',
});
```

## 4. Deploy on Cloudflare Workers

For a fully serverless deployment on the edge:

### Create the Worker project

```bash
mkdir autopilot-worker && cd autopilot-worker
npm init -y
npm install @autopilot-mail/core hono
```

### wrangler.toml

```toml
name = "autopilot-worker"
main = "src/index.ts"
compatibility_date = "2026-04-14"

[[d1_databases]]
binding = "DB"
database_name = "autopilot-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "autopilot-files"

[vars]
DOMAIN = "mail.myapp.com"
```

### Set secrets

```bash
wrangler secret put API_KEY
# Enter your API key when prompted
```

### Worker entrypoint (src/index.ts)

```typescript
import { Hono } from 'hono';
import { AutopilotServer, InMemoryStorageAdapter, NoopTransport } from '@autopilot-mail/core';

// Note: In a full Workers deployment, you'd use D1/R2 bindings directly.
// The D1StorageAdapter REST client also works from Workers but adds latency.
// For production, implement a thin D1BindingAdapter that wraps env.DB directly.

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  API_KEY: string;
  DOMAIN: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok' }));

// Initialize server per request (Workers are stateless)
// In production, use a D1 binding adapter instead of InMemoryStorageAdapter
app.all('/v0/*', async (c) => {
  // Auth
  const auth = c.req.header('Authorization');
  if (!auth || auth.replace(/^Bearer\s+/i, '') !== c.env.API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // For a full implementation, create a D1BindingAdapter that wraps c.env.DB
  // and an R2BindingAdapter that wraps c.env.BUCKET
  return c.json({ error: 'Use the standalone server or implement D1 binding adapter' }, 501);
});

export default app;
```

### Deploy

```bash
# Local dev
wrangler dev

# Deploy to production
wrangler deploy
```

## 5. Email Routing (Inbound Email)

Cloudflare Email Routing can forward inbound email to a Worker or an external address.

### Option A: Forward to Autopilot webhook

```bash
# In Cloudflare Dashboard:
# 1. Go to your domain → Email → Email Routing
# 2. Enable Email Routing
# 3. Add a "Catch-all" rule that forwards to your Autopilot server
# 4. Or use a Worker to process emails
```

### Option B: Email Worker (process in-line)

Create an Email Worker that receives mail and forwards to Autopilot:

```typescript
// email-worker/src/index.ts
export default {
  async email(message: EmailMessage, env: Env) {
    // Forward the raw email to Autopilot's processInboundEmail endpoint
    const raw = await new Response(message.raw).arrayBuffer();

    await fetch(`${env.AUTOPILOT_URL}/webhooks/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'message/rfc822',
        'X-Envelope-To': message.to,
        Authorization: `Bearer ${env.API_KEY}`,
      },
      body: raw,
    });
  },
};
```

## 6. DNS Setup

If your domain is on Cloudflare DNS:

```bash
# MX record for inbound email (if using Email Routing)
# Cloudflare adds these automatically when you enable Email Routing

# SPF record for outbound (if using MailChannels via Workers)
# Type: TXT
# Name: mail.myapp.com
# Value: v=spf1 include:relay.mailchannels.net ~all

# DKIM — configure via your email transport provider
```

## Pricing Comparison

| Resource      | Cloudflare Free     | Cloudflare Paid        | AWS Equivalent |
| ------------- | ------------------- | ---------------------- | -------------- |
| D1 database   | 5 GB, 5M reads/day  | $0.75/M reads          | RDS ~$140/mo   |
| R2 storage    | 10 GB, 10M reads/mo | $0.015/GB              | S3 $0.023/GB   |
| Workers       | 100K req/day        | $5/mo + $0.50/M req    | Lambda ~$20/mo |
| Email Routing | 25 addresses free   | Unlimited with Workers | SES $0.10/1K   |

**Full Cloudflare stack: $0/mo** on free tiers (5M D1 reads, 10 GB R2, 100K Worker requests per day).

## Troubleshooting

### D1 REST API rate limits

The Cloudflare API has global rate limits. For high-throughput use cases, deploy on Workers and use the D1 binding directly (no rate limits).

### R2 presigned URLs

R2 supports S3-compatible presigned URLs via `@aws-sdk/s3-request-presigner`. The endpoint must be `https://{accountId}.r2.cloudflarestorage.com`.

### Workers cold starts

Workers have near-zero cold starts. The Autopilot server initializes quickly since D1 and R2 bindings are injected by the runtime.

### MailChannels (free email sending from Workers)

Cloudflare Workers can send email via MailChannels for free (no SMTP credentials needed). This requires a DNS TXT record for authentication. See the MailChannels documentation for setup.
