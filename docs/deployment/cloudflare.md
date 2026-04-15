# Cloudflare Deployment

Deploy Autopilot using Cloudflare D1 (database) + R2 (file storage). Optionally host on Workers.

## Setup

```bash
npm install -g wrangler
wrangler login

# Create D1 database
wrangler d1 create autopilot-db

# Create R2 bucket
wrangler r2 bucket create autopilot-files
```

## TOML Config

```toml
[server]
port = 3100
domain = "mail.myapp.com"
api_keys = ["your-key"]

[storage]
adapter = "d1"
account_id = "your-cf-account-id"
database_id = "your-d1-database-id"
api_token = "your-cf-api-token"

[file_storage]
adapter = "r2"
account_id = "your-cf-account-id"
bucket = "autopilot-files"
access_key_id = "your-r2-key"
secret_access_key = "your-r2-secret"
```

## SDK Usage

```typescript
import { AutopilotServer } from '@autopilot-mail/core';
import { D1StorageAdapter } from '@autopilot-mail/d1';
import { R2FileStorage } from '@autopilot-mail/r2';

const server = new AutopilotServer({
  storage: new D1StorageAdapter({
    accountId: process.env.CF_ACCOUNT_ID!,
    databaseId: process.env.D1_DATABASE_ID!,
    apiToken: process.env.CF_API_TOKEN!,
  }),
  fileStorage: new R2FileStorage({
    accountId: process.env.CF_ACCOUNT_ID!,
    bucket: 'autopilot-files',
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET!,
  }),
  defaultDomain: 'mail.myapp.com',
});
```

## Pricing

Full Cloudflare stack at **$0/month** on free tiers:

| Resource | Free Tier           |
| -------- | ------------------- |
| D1       | 5 GB, 5M reads/day  |
| R2       | 10 GB, 10M reads/mo |
| Workers  | 100K req/day        |

For more details, see the [Cloudflare setup skill](../../skills/autopilot-cloudflare/SKILL.md).
