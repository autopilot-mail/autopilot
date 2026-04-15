# Standalone Server

The `@autopilot-mail/server` package provides a standalone REST API server with TOML configuration.

## Install & Run

```bash
npm install @autopilot-mail/server
npx autopilot --config ./autopilot.toml
```

## CLI Options

```
autopilot [options]

  -c, --config <path>   Path to autopilot.toml
  -h, --help            Show help
```

Config file search order: `./autopilot.toml` → `./config.toml` → `/etc/autopilot/config.toml`

## REST API

The server exposes the agentmail-compatible v0 REST API:

```bash
# Health check
curl http://localhost:3100/health

# Create inbox
curl -X POST http://localhost:3100/v0/inboxes \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"username": "agent"}'

# Send message
curl -X POST http://localhost:3100/v0/inboxes/$INBOX_ID/messages/send \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"to": "user@example.com", "subject": "Hello", "text": "Hi!"}'

# List threads
curl http://localhost:3100/v0/inboxes/$INBOX_ID/threads \
  -H "Authorization: Bearer your-key"
```

All endpoints use snake_case JSON. The official `agentmail` SDK works by setting `baseUrl`:

```typescript
import { AgentMailClient } from 'agentmail';
const client = new AgentMailClient({
  baseUrl: 'http://localhost:3100',
  apiKey: 'your-key',
});
```

## Auth

Set `api_keys` in your TOML config. Requests must include `Authorization: Bearer <key>`. If `api_keys` is omitted, the server runs unauthenticated.

## Full Config Reference

See [Configuration](../configuration.md) for all TOML options.
