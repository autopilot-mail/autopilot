<p align="center">
  <img src="static/header.jpeg" alt="autopilot mail" width="100%" />
</p>

<p align="center">
  Self-hosted email infrastructure for AI agents. Drop in replacement for AgentMail. Unlimited inboxes. Your storage. Your transport.
</p>

## Install

```bash
npm install @autopilot-mail/core                # core SDK (required)
```

Pick your stack:

```bash
# Database
npm install @autopilot-mail/postgres             # PostgreSQL
npm install @autopilot-mail/mongodb              # MongoDB
npm install @autopilot-mail/sqlite               # SQLite
npm install @autopilot-mail/d1                   # Cloudflare D1

# Email transport
npm install @autopilot-mail/ses                  # AWS SES
npm install @autopilot-mail/smtp                 # SMTP (nodemailer)

# File storage (attachments)
npm install @autopilot-mail/s3                   # AWS S3
npm install @autopilot-mail/r2                   # Cloudflare R2
npm install @autopilot-mail/archil               # Archil

# Standalone server (REST API + CLI)
npm install @autopilot-mail/server               # npx autopilot
```

## Quick Start

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

// Create inbox
const inbox = await server.inboxes.create({ username: 'support' });

// Send
await server.inboxes.messages.send(inbox.inboxId, {
  to: 'customer@gmail.com',
  subject: 'Order shipped',
  text: 'Your order #1234 has shipped!',
});

// Reply, forward, list threads — same API as agentmail
const { threads } = await server.inboxes.threads.list(inbox.inboxId);
```

## Standalone Server

Run as a standalone REST API with a TOML config:

```bash
npx autopilot --config ./autopilot.toml
```

```bash
curl http://localhost:3100/health
curl -X POST http://localhost:3100/v0/inboxes \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"username": "agent", "display_name": "My Agent"}'
```

The REST API is compatible with the official [AgentMail SDK](https://www.npmjs.com/package/agentmail) — just change the `baseUrl`.

## Why not hosted AgentMail?

|                | AgentMail $20/mo | Autopilot                     |
| -------------- | ---------------- | ----------------------------- |
| Inboxes        | 10               | **Unlimited**                 |
| Custom domains | 10               | **Unlimited**                 |
| Emails/month   | 10,000           | **Unlimited** (SES: $0.10/1k) |
| Storage        | 10 GB            | **Your DB**                   |
| Vendor lock-in | Yes              | **No**                        |

## Packages

| Package                    | What                                                     |
| -------------------------- | -------------------------------------------------------- |
| `@autopilot-mail/core`     | Server, types, in-memory adapters, email utils, webhooks |
| `@autopilot-mail/postgres` | PostgreSQL storage                                       |
| `@autopilot-mail/mongodb`  | MongoDB storage                                          |
| `@autopilot-mail/sqlite`   | SQLite storage                                           |
| `@autopilot-mail/d1`       | Cloudflare D1 storage                                    |
| `@autopilot-mail/ses`      | AWS SES transport                                        |
| `@autopilot-mail/smtp`     | SMTP transport                                           |
| `@autopilot-mail/s3`       | AWS S3 file storage                                      |
| `@autopilot-mail/r2`       | Cloudflare R2 file storage                               |
| `@autopilot-mail/archil`   | Archil file storage                                      |
| `@autopilot-mail/server`   | Standalone REST server + CLI                             |

## Documentation

**Getting started**

- [Getting Started](docs/getting-started.md) — first install to first email
- [Configuration](docs/configuration.md) — TOML config reference, env vars
- [Server SDK API](docs/server-sdk-api.md) — full method reference

**Adapters**

- [Storage Adapters](docs/adapters/storage.md) — Postgres, MongoDB, SQLite, D1, custom
- [Email Transports](docs/adapters/transports.md) — SES, SMTP, custom
- [File Storage](docs/adapters/file-storage.md) — S3, R2, Archil, local, custom

**Deployment**

- [Standalone Server](docs/deployment/standalone-server.md) — REST API + CLI
- [Docker](docs/deployment/docker.md) — Dockerfile, Docker Compose
- [Cloudflare](docs/deployment/cloudflare.md) — D1 + R2 + Workers

**Guides**

- [Webhooks](docs/guides/webhooks.md) — inbound SES + outbound event dispatch
- [Testing](docs/guides/testing.md) — in-memory adapters, NoopTransport, assertions
- [Examples](examples/) — runnable code samples

**Skills** (step-by-step setup guides for AI coding assistants)

```bash
npx skills add autopilot-mail/autopilot          # core SDK skill
npx skills add autopilot-mail/autopilot-setup     # AWS SES, S3, DNS, Postgres
npx skills add autopilot-mail/autopilot-cloudflare # D1, R2, Workers
npx skills add autopilot-mail/autopilot-migrate   # migrate from AgentMail
```

- [AWS Setup](skills/autopilot-setup/SKILL.md) — SES, S3, SNS, DNS, Postgres
- [Cloudflare Setup](skills/autopilot-cloudflare/SKILL.md) — D1, R2, Workers, Email Routing
- [Migrate from AgentMail](skills/autopilot-migrate/SKILL.md) — data export, DNS cutover, SDK swap

## License

MIT
