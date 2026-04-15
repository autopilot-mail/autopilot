# Testing

Autopilot ships with in-memory adapters and a `NoopTransport` for easy testing.

## Setup

```typescript
import { AutopilotServer } from '@autopilot-mail/core';
import { InMemoryStorageAdapter } from '@autopilot-mail/core/storage/memory';
import { NoopTransport } from '@autopilot-mail/core/transport/noop';

const transport = new NoopTransport();
const server = new AutopilotServer({
  storage: new InMemoryStorageAdapter(),
  transport,
  defaultDomain: 'test.local',
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
});
await server.initialize();
```

## Assert on Sends

`NoopTransport` records every send call:

```typescript
await server.inboxes.messages.send(inbox.inboxId, {
  to: 'user@example.com',
  subject: 'Test',
  text: 'Hello',
});

expect(transport.sent).toHaveLength(1);
expect(transport.sent[0].params.to).toEqual(['user@example.com']);
expect(transport.sent[0].params.subject).toBe('Test');

transport.clear(); // reset between tests
```

## Test Inbound Email

```typescript
const rawMime = Buffer.from(['From: sender@ext.com', 'To: bot@test.local', 'Subject: Hi', '', 'Body text'].join('\r\n'));

const message = await server.processInboundEmail(rawMime, 'bot@test.local');

expect(message.from).toBe('sender@ext.com');
expect(message.subject).toBe('Hi');
expect(message.labels).toContain('INBOX');
```

## Test Threading

```typescript
const sent = await server.inboxes.messages.send(inbox.inboxId, {
  to: 'user@example.com',
  subject: 'Thread test',
  text: 'Original',
});

const reply = await server.inboxes.messages.reply(inbox.inboxId, sent.messageId, {
  text: 'Reply',
});

expect(reply.threadId).toBe(sent.threadId);

const thread = await server.threads.get(sent.threadId);
expect(thread.messages).toHaveLength(2);
```

## Running Tests

```bash
bun test          # run all tests
bun test test/    # run test directory
```

See [`test/core-email.spec.ts`](../../test/core-email.spec.ts) for 31 comprehensive E2E tests.
