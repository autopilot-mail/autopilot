# Webhooks

Autopilot supports two kinds of webhooks:

1. **Inbound** — SES/SNS sends notifications when email arrives
2. **Outbound** — Autopilot POSTs events to your registered URLs

## Inbound Webhooks (SES → Autopilot)

Mount the SES webhook handler to receive inbound email:

```typescript
import { createExpressWebhookHandler } from '@autopilot-mail/core/webhooks/express';

app.use(express.text({ type: 'text/plain' })); // SNS sends text/plain
app.post('/webhooks/ses', createExpressWebhookHandler(server));
```

Or with Hono:

```typescript
import { createHonoWebhookHandler } from '@autopilot-mail/core/webhooks/hono';

app.post('/webhooks/ses', createHonoWebhookHandler(server));
```

The handler automatically:

- Confirms SNS subscription requests
- Verifies SNS message signatures
- Fetches raw email from S3
- Calls `server.processInboundEmail()` for each recipient

### Standalone server config

```toml
[s3]
region = "us-east-1"
bucket = "my-ses-inbound"

[webhooks]
ses_endpoint = "/webhooks/ses"
verify_sns_signature = true
```

### Direct processing (no webhook)

```typescript
const rawMime = Buffer.from(/* raw email from S3, IMAP, etc. */);
const message = await server.processInboundEmail(rawMime, 'inbox@mail.myapp.com');
```

## Outbound Webhooks (Autopilot → Your App)

Register URLs to receive events:

```typescript
const webhook = await server.webhooks.create({
  url: 'https://myapp.com/hooks/mail',
  eventTypes: ['message.received', 'message.sent'],
});
```

Enable dispatching in the server config:

```typescript
new AutopilotServer({ ..., webhookDispatch: true });
```

### Event Types

| Event                | When                    |
| -------------------- | ----------------------- |
| `message.received`   | Inbound email processed |
| `message.sent`       | Outbound email sent     |
| `message.bounced`    | Delivery bounce         |
| `message.complained` | Spam complaint          |

### Payload

```json
{
  "eventId": "evt_xxx",
  "eventType": "message.received",
  "timestamp": "2026-04-15T00:00:00.000Z",
  "data": {
    "messageId": "msg_xxx",
    "threadId": "thrd_xxx",
    "from": "sender@example.com",
    "subject": "Hello"
  }
}
```

### Signature Verification

Payloads are signed with HMAC-SHA256 using the webhook's `secret`. Verify via the `X-Autopilot-Signature` header:

```typescript
import { createHmac } from 'crypto';

function verifySignature(body: string, secret: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

// In your handler:
const sig = req.headers['x-autopilot-signature'];
const valid = verifySignature(req.body, webhook.secret, sig);
```
