# Email Transports

Transports handle outbound email delivery. They're **optional** — omit for receive-only or query-only setups.

## Available Transports

| Transport | Package                           | Peer Deps               | Best For        |
| --------- | --------------------------------- | ----------------------- | --------------- |
| AWS SES   | `@autopilot-mail/ses`             | `@aws-sdk/client-sesv2` | Production      |
| SMTP      | `@autopilot-mail/smtp`            | `nodemailer`            | Any SMTP server |
| Noop      | `@autopilot-mail/core` (built-in) | none                    | Testing         |

## AWS SES

```bash
npm install @autopilot-mail/ses @aws-sdk/client-sesv2
```

```typescript
import { SesTransport } from '@autopilot-mail/ses';

const transport = new SesTransport({
  region: 'us-east-1',
  configurationSetName: 'my-config-set', // optional
});
```

Requires a verified domain in SES. Uses raw MIME for attachments and threading headers. See [AWS setup guide](../../skills/autopilot-setup/SKILL.md).

**Cost:** $0.10 per 1,000 emails. 3,000/month free for first 12 months.

## SMTP

```bash
npm install @autopilot-mail/smtp nodemailer
```

```typescript
import { SmtpTransport } from '@autopilot-mail/smtp';

const transport = new SmtpTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'bot@gmail.com',
    pass: 'app-password',
  },
});
```

Works with any SMTP server: Gmail, Outlook, Mailgun, Postmark, SendGrid, self-hosted.

## Noop (Testing)

```typescript
import { NoopTransport } from '@autopilot-mail/core/transport/noop';

const transport = new NoopTransport();

// After sending:
console.log(transport.sent.length); // number of sends
console.log(transport.sent[0].params.to); // ['recipient@example.com']
transport.clear(); // reset
```

Records all sends in memory without delivering. Use for assertions in tests.

## Custom Transport

```typescript
import type { EmailTransport, TransportSendParams, TransportSendResult } from '@autopilot-mail/core';

class ResendTransport implements EmailTransport {
  async send(params: TransportSendParams): Promise<TransportSendResult> {
    // params.from, params.to, params.subject, params.text, params.html, params.attachments
    const result = await resend.emails.send({ ... });
    return { transportMessageId: result.id };
  }
}
```
