# Philosophy

## The problem with hosted email-for-agents

Services like AgentMail solve a real problem — giving AI agents their own email inboxes is hard. But they solve it by becoming a middleman that sits between your agents and the email infrastructure, and they charge you rent for the privilege.

Here's what that looks like:

**You pay per inbox.** AgentMail's Developer plan gives you 10 inboxes for $20/month. Need 100 agents? That's $200/month. Need 1,000? Call sales. The unit economics of email infrastructure don't justify this — an inbox is a row in a database and a DNS record. It costs nothing to create.

**You pay per email.** 10,000 emails/month on the $20 plan. AWS SES charges $0.10 per 1,000 — so those 10,000 emails cost $1 on SES, but $20 through AgentMail. That's a 20x markup on commodity infrastructure.

**You don't own your data.** Your messages, threads, and attachments live on their servers. If they go down, raise prices, change their API, or shut down — you lose access to your agents' entire email history.

**You're locked into their stack.** Want to store attachments in your own S3? Use your own Postgres? Deploy on Cloudflare instead of AWS? Switch to a different SMTP provider? You can't. Their architecture is their architecture.

**You hit artificial limits.** 3 inboxes on free. 10 on Developer. 150 on Startup. These aren't technical constraints — they're pricing levers. There's no technical reason an inbox should be a scarce resource.

## What Autopilot does differently

Autopilot gives you the same SDK surface as AgentMail but inverts the ownership model.

**You own the infrastructure.** Pick your database (Postgres, MongoDB, SQLite, Cloudflare D1). Pick your email transport (SES, SMTP, any provider). Pick your file storage (S3, R2, Archil, local disk). Swap any of them without changing your application code.

**Unlimited everything.** Inboxes, domains, threads, messages — as many as your database can hold. There's no artificial cap because there's no one to charge you for lifting it.

**You own your data.** Messages are in your database. Attachments are in your object store. Raw MIME is in your S3 bucket. If you stop using Autopilot tomorrow, your data is still there in your infrastructure, in standard formats.

**No vendor lock-in.** The `StorageAdapter`, `EmailTransport`, and `FileStorageProvider` interfaces are simple and documented. You can implement your own adapter for any service in an afternoon. The core library has zero opinions about where your data lives or how your email gets sent.

**Same API, no middleman.** The REST API is wire-compatible with AgentMail. The official `agentmail` SDK works by changing one line — the `baseUrl`. Your application code doesn't change. You just stop paying rent.

## The cost math

| What you need                 | AgentMail     | Autopilot + SES + Neon |
| ----------------------------- | ------------- | ---------------------- |
| 10 inboxes, 10K emails/mo     | $20/mo        | ~$1/mo                 |
| 100 inboxes, 100K emails/mo   | $200/mo       | ~$10/mo                |
| 1,000 inboxes, 1M emails/mo   | Call sales    | ~$100/mo               |
| 10,000 inboxes, 10M emails/mo | Not available | ~$1,000/mo             |

The difference comes down to one thing: AgentMail charges for the _abstraction_. Autopilot gives you the abstraction for free and lets the underlying infrastructure providers compete on price.

SES costs $0.10 per 1,000 emails regardless of whether you send them through AgentMail or Autopilot. Neon's free tier gives you 0.5 GB of Postgres — enough for tens of thousands of messages. An S3 bucket costs $0.023/GB/month. These are commodity prices for commodity infrastructure.

## When to use hosted AgentMail instead

Hosted AgentMail is the right choice when:

- You want zero infrastructure to manage
- You want a dashboard UI
- Your volume is small enough that $20/month is noise

Autopilot is the right choice when:

- You need more than 10 inboxes
- You're cost-sensitive at scale
- You need to own your data (compliance, sovereignty, audit)
- You want to use your own infrastructure (Cloudflare, AWS, self-hosted)
- You need to customize storage, transport, or file handling
- You're building a platform where email is a core feature, not a side channel

## Bring your own everything

```
┌─────────────────────────────────────────────────────┐
│                   Your Application                  │
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │              AutopilotServer                │   │
│   │                                             │   │
│   │   Same API as AgentMail. No lock-in.        │   │
│   │   Unlimited inboxes. Your data.             │   │
│   └──────┬──────────┬──────────┬────────────────┘   │
│          │          │          │                     │
│   ┌──────▼──┐ ┌─────▼────┐ ┌──▼───────────┐        │
│   │ Storage │ │Transport │ │ File Storage │        │
│   │         │ │          │ │              │        │
│   │ Postgres│ │ SES      │ │ S3           │        │
│   │ MongoDB │ │ SMTP     │ │ R2           │        │
│   │ SQLite  │ │ Resend*  │ │ Archil       │        │
│   │ D1      │ │ Custom   │ │ Local        │        │
│   │ Custom  │ │          │ │ Custom       │        │
│   └─────────┘ └──────────┘ └──────────────┘        │
│                                                     │
│   * implement the EmailTransport interface          │
└─────────────────────────────────────────────────────┘
```

Every box in that diagram is yours. Swap any of them. Own all of them.
