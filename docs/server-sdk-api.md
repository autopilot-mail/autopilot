# Server SDK API

The `AutopilotServer` class provides the same resource-accessor pattern as the hosted agentmail SDK.

## Inboxes

```typescript
// Create inbox (auto-generated or custom username)
const inbox = await server.inboxes.create({
  username?: string,       // local part of email
  domain?: string,         // overrides defaultDomain
  displayName?: string,
  clientId?: string,       // idempotency key
});

await server.inboxes.get(inboxId);
await server.inboxes.list({ limit?, pageToken?, ascending? });
await server.inboxes.update(inboxId, { displayName });
await server.inboxes.delete(inboxId);
```

## Messages

```typescript
// Send
const { messageId, threadId, timestamp } = await server.inboxes.messages.send(inboxId, {
  to: string | string[],
  subject?: string,
  text?: string,
  html?: string,
  cc?: string | string[],
  bcc?: string | string[],
  replyTo?: string | string[],
  labels?: string[],
  attachments?: Array<{ filename?, contentType?, content? /* base64 */ }>,
  headers?: Record<string, string>,
});

// Reply (threads automatically via In-Reply-To/References)
await server.inboxes.messages.reply(inboxId, messageId, { text, html? });

// Reply all (all original recipients minus self)
await server.inboxes.messages.replyAll(inboxId, messageId, { text, html? });

// Forward
await server.inboxes.messages.forward(inboxId, messageId, { to, text?, html? });

// Read
await server.inboxes.messages.get(inboxId, messageId);
await server.inboxes.messages.list(inboxId, { limit?, pageToken?, labels?, before?, after? });
await server.inboxes.messages.getRaw(inboxId, messageId);         // Buffer (RFC 5322 MIME)
await server.inboxes.messages.getAttachment(inboxId, messageId, attachmentId);

// Update labels
await server.inboxes.messages.update(inboxId, messageId, {
  addLabels?: string[],
  removeLabels?: string[],
});

// Delete
await server.inboxes.messages.delete(inboxId, messageId);
```

## Threads

```typescript
// List threads in an inbox
await server.inboxes.threads.list(inboxId, { limit?, pageToken? });

// List all threads (across all inboxes)
await server.threads.list({ limit?, pageToken? });

// Get thread with all messages (ordered by timestamp)
const thread = await server.threads.get(threadId);
// thread.messages, thread.messageCount, thread.senders, thread.recipients

// Update / delete
await server.threads.update(threadId, { addLabels?, removeLabels? });
await server.threads.delete(threadId);
```

## Drafts

```typescript
// Create
const draft = await server.inboxes.drafts.create(inboxId, {
  to?, cc?, bcc?, subject?, text?, html?, replyTo?, labels?, inReplyTo?, sendAt?, clientId?,
});

// Read / list
await server.inboxes.drafts.get(inboxId, draftId);
await server.inboxes.drafts.list(inboxId, { limit? });
await server.drafts.list({ limit? });   // global
await server.drafts.get(draftId);        // global

// Update
await server.inboxes.drafts.update(inboxId, draftId, { to?, subject?, text?, html? });

// Send (converts to message, deletes draft)
await server.inboxes.drafts.send(inboxId, draftId);

// Delete
await server.inboxes.drafts.delete(inboxId, draftId);
```

## Webhooks

```typescript
// Register a webhook
const webhook = await server.webhooks.create({
  url: string,
  eventTypes: Array<'message.received' | 'message.sent' | 'message.bounced' | 'message.complained'>,
  inboxIds?: string[],
  podIds?: string[],
});
// webhook.secret — use to verify HMAC signatures

await server.webhooks.get(webhookId);
await server.webhooks.list({ limit? });
await server.webhooks.update(webhookId, { addInboxIds?, removeInboxIds?, enabled? });
await server.webhooks.delete(webhookId);
```

## Domains

```typescript
await server.domains.create({ domain: 'custom.example.com', feedbackEnabled?: boolean });
await server.domains.get(domainId);
await server.domains.list({ limit? });
await server.domains.update(domainId, { feedbackEnabled? });
await server.domains.delete(domainId);
```

## Inbound Processing

```typescript
// Process raw MIME email directly (no webhook needed)
const message = await server.processInboundEmail(rawMimeBuffer, recipientEmail);
// Automatically: parses MIME, resolves/creates thread, stores message + attachments
```

## Lifecycle

```typescript
await server.initialize(); // creates tables, connects to services
await server.close(); // graceful shutdown
```
