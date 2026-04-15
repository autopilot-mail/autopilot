# API Endpoint Mapping

Autopilot implements the same v0 REST API as hosted AgentMail. The official `agentmail` SDK works with both — just change the `baseUrl`.

## Base URLs

| Service               | Base URL                      |
| --------------------- | ----------------------------- |
| Hosted AgentMail      | `https://api.agentmail.to/v0` |
| Self-hosted Autopilot | `https://your-server.com/v0`  |

## Endpoint Compatibility

| Endpoint                                             | AgentMail | Autopilot | Notes          |
| ---------------------------------------------------- | --------- | --------- | -------------- |
| `POST /v0/inboxes`                                   | Yes       | Yes       |                |
| `GET /v0/inboxes`                                    | Yes       | Yes       |                |
| `GET /v0/inboxes/:id`                                | Yes       | Yes       |                |
| `PATCH /v0/inboxes/:id`                              | Yes       | Yes       |                |
| `DELETE /v0/inboxes/:id`                             | Yes       | Yes       |                |
| `POST /v0/inboxes/:id/messages/send`                 | Yes       | Yes       |                |
| `GET /v0/inboxes/:id/messages`                       | Yes       | Yes       |                |
| `GET /v0/inboxes/:id/messages/:mid`                  | Yes       | Yes       |                |
| `POST /v0/inboxes/:id/messages/:mid/reply`           | Yes       | Yes       |                |
| `POST /v0/inboxes/:id/messages/:mid/reply-all`       | Yes       | Yes       |                |
| `POST /v0/inboxes/:id/messages/:mid/forward`         | Yes       | Yes       |                |
| `PATCH /v0/inboxes/:id/messages/:mid`                | Yes       | Yes       | Labels         |
| `DELETE /v0/inboxes/:id/messages/:mid`               | Yes       | Yes       |                |
| `GET /v0/inboxes/:id/messages/:mid/raw`              | Yes       | Yes       |                |
| `GET /v0/inboxes/:id/messages/:mid/attachments/:aid` | Yes       | Yes       |                |
| `GET /v0/inboxes/:id/threads`                        | Yes       | Yes       |                |
| `GET /v0/threads`                                    | Yes       | Yes       |                |
| `GET /v0/threads/:id`                                | Yes       | Yes       |                |
| `DELETE /v0/threads/:id`                             | Yes       | Yes       |                |
| `POST /v0/inboxes/:id/drafts`                        | Yes       | Yes       |                |
| `GET /v0/inboxes/:id/drafts`                         | Yes       | Yes       |                |
| `GET /v0/inboxes/:id/drafts/:did`                    | Yes       | Yes       |                |
| `PATCH /v0/inboxes/:id/drafts/:did`                  | Yes       | Yes       |                |
| `DELETE /v0/inboxes/:id/drafts/:did`                 | Yes       | Yes       |                |
| `POST /v0/inboxes/:id/drafts/:did/send`              | Yes       | Yes       |                |
| `GET /v0/drafts`                                     | Yes       | Yes       |                |
| `GET /v0/drafts/:id`                                 | Yes       | Yes       |                |
| `POST /v0/webhooks`                                  | Yes       | Yes       |                |
| `GET /v0/webhooks`                                   | Yes       | Yes       |                |
| `GET /v0/webhooks/:id`                               | Yes       | Yes       |                |
| `PATCH /v0/webhooks/:id`                             | Yes       | Yes       |                |
| `DELETE /v0/webhooks/:id`                            | Yes       | Yes       |                |
| `POST /v0/domains`                                   | Yes       | Yes       |                |
| `GET /v0/domains`                                    | Yes       | Yes       |                |
| `GET /v0/domains/:id`                                | Yes       | Yes       |                |
| `DELETE /v0/domains/:id`                             | Yes       | Yes       |                |
| `GET /health`                                        | N/A       | Yes       | Autopilot only |

## Not Yet Implemented in Autopilot

| Endpoint                     | Notes                      |
| ---------------------------- | -------------------------- |
| `POST /v0/agent/sign-up`     | Use your own auth          |
| `POST /v0/agent/verify`      | Use your own auth          |
| `POST /v0/pods`              | Use `podId` config instead |
| `GET /v0/pods`               |                            |
| `POST /v0/inboxes/:id/lists` | Allow/block lists          |
| `GET /v0/inboxes/:id/lists`  |                            |
| `POST /v0/api-keys`          | Use TOML config `api_keys` |
| `GET /v0/metrics/query`      |                            |
| `GET /v0/organizations`      |                            |
| WebSocket (`wss://`)         | Use webhooks instead       |

## Wire Format

Both services use the same snake_case JSON wire format:

```json
{
  "inbox_id": "inbox_xxx",
  "email": "support@mail.myapp.com",
  "display_name": "Support Agent",
  "created_at": "2026-04-15T00:00:00.000Z"
}
```

The `agentmail` SDK handles camelCase/snake_case conversion automatically.

## Authentication

| Service               | Header                           | Format                            |
| --------------------- | -------------------------------- | --------------------------------- |
| Hosted AgentMail      | `Authorization: Bearer am_xxx`   | AgentMail API key                 |
| Self-hosted Autopilot | `Authorization: Bearer your-key` | Any string from `api_keys` config |

Both use the same `Authorization: Bearer` scheme.
