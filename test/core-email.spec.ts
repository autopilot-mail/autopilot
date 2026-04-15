import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { AutopilotServer } from '../src/server.js';
import { InMemoryStorageAdapter } from '../src/storage/memory.js';
import { NoopTransport } from '../src/transport/noop.js';

describe('AutopilotServer E2E — Core Email Logic', () => {
  let server: AutopilotServer;
  let storage: InMemoryStorageAdapter;
  let transport: NoopTransport;

  beforeAll(async () => {
    storage = new InMemoryStorageAdapter();
    transport = new NoopTransport();
    server = new AutopilotServer({
      storage,
      transport,
      defaultDomain: 'test.local',
      podId: 'test-pod',
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    await server.initialize();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    transport.clear();
  });

  // ── Inbox CRUD ──

  describe('Inboxes', () => {
    it('should create an inbox with auto-generated username', async () => {
      const inbox = await server.inboxes.create({ displayName: 'Test Bot' });

      expect(inbox.inboxId).toStartWith('inbox_');
      expect(inbox.email).toEndWith('@test.local');
      expect(inbox.displayName).toBe('Test Bot');
      expect(inbox.podId).toBe('test-pod');
      expect(inbox.createdAt).toBeInstanceOf(Date);
    });

    it('should create an inbox with custom username', async () => {
      const inbox = await server.inboxes.create({ username: 'support', displayName: 'Support' });
      expect(inbox.email).toBe('support@test.local');
    });

    it('should reject duplicate email addresses', async () => {
      await server.inboxes.create({ username: 'unique1' });
      await expect(server.inboxes.create({ username: 'unique1' })).rejects.toThrow('already exists');
    });

    it('should get an inbox by ID', async () => {
      const created = await server.inboxes.create({ username: 'get-test' });
      const fetched = await server.inboxes.get(created.inboxId);
      expect(fetched.email).toBe(created.email);
    });

    it('should list inboxes', async () => {
      const result = await server.inboxes.list();
      expect(result.inboxes.length).toBeGreaterThan(0);
      expect(result.count).toBeGreaterThan(0);
    });

    it('should update inbox display name', async () => {
      const inbox = await server.inboxes.create({ username: 'update-test' });
      const updated = await server.inboxes.update(inbox.inboxId, { displayName: 'Updated Name' });
      expect(updated.displayName).toBe('Updated Name');
    });

    it('should delete an inbox', async () => {
      const inbox = await server.inboxes.create({ username: 'delete-test' });
      await server.inboxes.delete(inbox.inboxId);
      await expect(server.inboxes.get(inbox.inboxId)).rejects.toThrow('not found');
    });
  });

  // ── Send + Thread ──

  describe('Sending Messages', () => {
    it('should send a message and create a thread', async () => {
      const inbox = await server.inboxes.create({ username: 'sender1' });

      const result = await server.inboxes.messages.send(inbox.inboxId, {
        to: 'recipient@example.com',
        subject: 'Hello World',
        text: 'This is a test email',
        html: '<p>This is a test email</p>',
      });

      expect(result.messageId).toStartWith('msg_');
      expect(result.threadId).toStartWith('thrd_');
      expect(result.timestamp).toBeInstanceOf(Date);

      // Verify transport was called
      expect(transport.sent).toHaveLength(1);
      expect(transport.sent[0].params.to).toEqual(['recipient@example.com']);
      expect(transport.sent[0].params.subject).toBe('Hello World');
    });

    it('should create message with SENT label', async () => {
      const inbox = await server.inboxes.create({ username: 'sender2' });
      const { messageId } = await server.inboxes.messages.send(inbox.inboxId, {
        to: 'recipient@example.com',
        subject: 'Label Test',
        text: 'body',
      });

      const msg = await server.inboxes.messages.get(inbox.inboxId, messageId);
      expect(msg.labels).toContain('SENT');
    });

    it('should throw when sending without transport', async () => {
      const noTransportServer = new AutopilotServer({
        storage: new InMemoryStorageAdapter(),
        defaultDomain: 'test.local',
        logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      });
      await noTransportServer.initialize();

      const inbox = await noTransportServer.inboxes.create({ username: 'no-transport' });
      await expect(noTransportServer.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'test', text: 'test' })).rejects.toThrow('No email transport configured');
      await noTransportServer.close();
    });

    it('should use display name in from field', async () => {
      const inbox = await server.inboxes.create({ username: 'named-sender', displayName: 'Mr. Bot' });
      await server.inboxes.messages.send(inbox.inboxId, {
        to: 'recipient@example.com',
        subject: 'From Test',
        text: 'test',
      });

      expect(transport.sent[0].params.from).toBe('Mr. Bot <named-sender@test.local>');
    });
  });

  // ── Threading ──

  describe('Threading', () => {
    it('should group replies into the same thread', async () => {
      const inbox = await server.inboxes.create({ username: 'threader' });

      // Send original
      const original = await server.inboxes.messages.send(inbox.inboxId, {
        to: 'recipient@example.com',
        subject: 'Thread Test',
        text: 'Original message',
      });

      // Reply
      const reply = await server.inboxes.messages.reply(inbox.inboxId, original.messageId, {
        text: 'This is a reply',
      });

      // Both should be in the same thread
      expect(reply.threadId).toBe(original.threadId);

      // Thread should have 2 messages
      const thread = await server.threads.get(original.threadId);
      expect(thread.messages).toHaveLength(2);
      expect(thread.messageCount).toBe(2);
    });

    it('should set Re: prefix on reply subject', async () => {
      const inbox = await server.inboxes.create({ username: 'reply-subject' });
      const original = await server.inboxes.messages.send(inbox.inboxId, {
        to: 'r@example.com',
        subject: 'Original Subject',
        text: 'test',
      });

      await server.inboxes.messages.reply(inbox.inboxId, original.messageId, { text: 'reply' });

      // Last sent message should have Re: prefix
      const lastSent = transport.sent[transport.sent.length - 1];
      expect(lastSent.params.subject).toBe('Re: Original Subject');
    });

    it('should not double-prefix Re: on reply to reply', async () => {
      const inbox = await server.inboxes.create({ username: 'no-double-re' });
      const original = await server.inboxes.messages.send(inbox.inboxId, {
        to: 'r@example.com',
        subject: 'Re: Already a Reply',
        text: 'test',
      });

      await server.inboxes.messages.reply(inbox.inboxId, original.messageId, { text: 'reply' });

      const lastSent = transport.sent[transport.sent.length - 1];
      expect(lastSent.params.subject).toBe('Re: Already a Reply');
    });
  });

  // ── Reply All ──

  describe('Reply All', () => {
    it('should reply to all recipients excluding self', async () => {
      const inbox = await server.inboxes.create({ username: 'replyall' });

      const original = await server.inboxes.messages.send(inbox.inboxId, {
        to: ['alice@example.com', 'bob@example.com'],
        cc: 'charlie@example.com',
        subject: 'Group Thread',
        text: 'Hello group',
      });

      await server.inboxes.messages.replyAll(inbox.inboxId, original.messageId, { text: 'Reply to all' });

      const lastSent = transport.sent[transport.sent.length - 1];
      // Should include original recipients minus self
      expect(lastSent.params.to).toContain('alice@example.com');
      expect(lastSent.params.to).toContain('bob@example.com');
      // Self (replyall@test.local) should NOT be in the list
      expect(lastSent.params.to).not.toContain('replyall@test.local');
    });
  });

  // ── Forward ──

  describe('Forward', () => {
    it('should forward a message with Fwd: prefix', async () => {
      const inbox = await server.inboxes.create({ username: 'forwarder' });

      const original = await server.inboxes.messages.send(inbox.inboxId, {
        to: 'original@example.com',
        subject: 'Forward Me',
        text: 'Important content',
      });

      const fwd = await server.inboxes.messages.forward(inbox.inboxId, original.messageId, {
        to: 'new-recipient@example.com',
        text: 'FYI see below',
      });

      expect(fwd.messageId).toStartWith('msg_');

      const lastSent = transport.sent[transport.sent.length - 1];
      expect(lastSent.params.subject).toBe('Fwd: Forward Me');
      expect(lastSent.params.to).toEqual(['new-recipient@example.com']);
      expect(lastSent.params.text).toContain('Forwarded message');
      expect(lastSent.params.text).toContain('Important content');
    });
  });

  // ── Message CRUD ──

  describe('Message CRUD', () => {
    it('should list messages in an inbox', async () => {
      const inbox = await server.inboxes.create({ username: 'list-msgs' });
      await server.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'Msg 1', text: 'test' });
      await server.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'Msg 2', text: 'test' });

      const { messages } = await server.inboxes.messages.list(inbox.inboxId);
      expect(messages.length).toBe(2);
    });

    it('should update message labels', async () => {
      const inbox = await server.inboxes.create({ username: 'label-test' });
      const { messageId } = await server.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'Labels', text: 'test' });

      const updated = await server.inboxes.messages.update(inbox.inboxId, messageId, {
        addLabels: ['important', 'reviewed'],
      });
      expect(updated.labels).toContain('important');
      expect(updated.labels).toContain('reviewed');
      expect(updated.labels).toContain('SENT');

      const removed = await server.inboxes.messages.update(inbox.inboxId, messageId, {
        removeLabels: ['reviewed'],
      });
      expect(removed.labels).not.toContain('reviewed');
      expect(removed.labels).toContain('important');
    });

    it('should delete a message', async () => {
      const inbox = await server.inboxes.create({ username: 'del-msg' });
      const { messageId } = await server.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'Delete Me', text: 'test' });

      await server.inboxes.messages.delete(inbox.inboxId, messageId);
      await expect(server.inboxes.messages.get(inbox.inboxId, messageId)).rejects.toThrow('not found');
    });
  });

  // ── Threads ──

  describe('Thread Operations', () => {
    it('should list threads in inbox', async () => {
      const inbox = await server.inboxes.create({ username: 'thread-list' });
      await server.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'Thread 1', text: 'test' });
      await server.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'Thread 2', text: 'test' });

      const { threads } = await server.inboxes.threads.list(inbox.inboxId);
      expect(threads.length).toBe(2);
    });

    it('should get a thread with all messages', async () => {
      const inbox = await server.inboxes.create({ username: 'full-thread' });
      const original = await server.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'Full Thread', text: 'msg 1' });
      await server.inboxes.messages.reply(inbox.inboxId, original.messageId, { text: 'msg 2' });

      const thread = await server.threads.get(original.threadId);
      expect(thread.messages).toHaveLength(2);
      expect(thread.subject).toBe('Full Thread');
      expect(thread.senders).toContain('full-thread@test.local');
    });

    it('should track thread metadata (senders, recipients, count)', async () => {
      const inbox = await server.inboxes.create({ username: 'meta-thread' });
      const { threadId, messageId } = await server.inboxes.messages.send(inbox.inboxId, {
        to: ['alice@example.com', 'bob@example.com'],
        subject: 'Metadata Test',
        text: 'test',
      });

      const thread = await server.threads.get(threadId);
      expect(thread.messageCount).toBe(1);
      expect(thread.recipients).toContain('alice@example.com');
      expect(thread.recipients).toContain('bob@example.com');

      // Reply adds new sender data
      await server.inboxes.messages.reply(inbox.inboxId, messageId, {
        to: 'charlie@example.com',
        text: 'reply',
      });

      const updated = await server.threads.get(threadId);
      expect(updated.messageCount).toBe(2);
      expect(updated.recipients).toContain('charlie@example.com');
    });
  });

  // ── Drafts ──

  describe('Drafts', () => {
    it('should create, update, and send a draft', async () => {
      const inbox = await server.inboxes.create({ username: 'drafter' });

      const draft = await server.inboxes.drafts.create(inbox.inboxId, {
        to: 'recipient@example.com',
        subject: 'Draft Subject',
        text: 'Draft body',
      });

      expect(draft.draftId).toStartWith('drft_');
      expect(draft.subject).toBe('Draft Subject');

      // Update
      const updated = await server.inboxes.drafts.update(inbox.inboxId, draft.draftId, {
        text: 'Updated body',
      });
      expect(updated.text).toBe('Updated body');

      // Send the draft
      const sendResult = await server.inboxes.drafts.send(inbox.inboxId, draft.draftId);
      expect(sendResult.messageId).toStartWith('msg_');

      // Draft should be deleted after send
      await expect(server.inboxes.drafts.get(inbox.inboxId, draft.draftId)).rejects.toThrow('not found');
    });

    it('should list drafts in inbox', async () => {
      const inbox = await server.inboxes.create({ username: 'draft-list' });
      await server.inboxes.drafts.create(inbox.inboxId, { subject: 'Draft A', text: 'a' });
      await server.inboxes.drafts.create(inbox.inboxId, { subject: 'Draft B', text: 'b' });

      const { drafts } = await server.inboxes.drafts.list(inbox.inboxId);
      expect(drafts).toHaveLength(2);
    });
  });

  // ── Webhooks ──

  describe('Webhooks', () => {
    it('should register and list webhooks', async () => {
      const webhook = await server.webhooks.create({
        url: 'https://example.com/hook',
        eventTypes: ['message.received'],
      });

      expect(webhook.webhookId).toStartWith('whk_');
      expect(webhook.secret).toBeTruthy();
      expect(webhook.enabled).toBe(true);

      const fetched = await server.webhooks.get(webhook.webhookId);
      expect(fetched.url).toBe('https://example.com/hook');

      const { webhooks } = await server.webhooks.list();
      expect(webhooks.some((w) => w.webhookId === webhook.webhookId)).toBe(true);
    });

    it('should delete a webhook', async () => {
      const webhook = await server.webhooks.create({
        url: 'https://example.com/delete-me',
        eventTypes: ['message.sent'],
      });

      await server.webhooks.delete(webhook.webhookId);
      await expect(server.webhooks.get(webhook.webhookId)).rejects.toThrow('not found');
    });
  });

  // ── Domains ──

  describe('Domains', () => {
    it('should add and list domains', async () => {
      const domain = await server.domains.create({ domain: 'custom.example.com' });

      expect(domain.domainId).toStartWith('dom_');
      expect(domain.domain).toBe('custom.example.com');
      expect(domain.status).toBe('NOT_STARTED');

      const { domains } = await server.domains.list();
      expect(domains.some((d) => d.domainId === domain.domainId)).toBe(true);
    });
  });

  // ── Inbound Email Processing ──

  describe('Inbound Email Processing', () => {
    it('should process a raw MIME email and store it', async () => {
      const inbox = await server.inboxes.create({ username: 'inbound' });

      const rawMime = Buffer.from(
        ['From: sender@external.com', `To: inbound@test.local`, 'Subject: Inbound Test', 'Content-Type: text/plain; charset=UTF-8', '', 'Hello from the outside!'].join('\r\n'),
      );

      const message = await server.processInboundEmail(rawMime, 'inbound@test.local');

      expect(message.messageId).toStartWith('msg_');
      expect(message.from).toBe('sender@external.com');
      expect(message.subject).toBe('Inbound Test');
      expect(message.text).toBe('Hello from the outside!');
      expect(message.labels).toContain('INBOX');
      expect(message.inboxId).toBe(inbox.inboxId);

      // Should be in a thread
      const thread = await server.threads.get(message.threadId);
      expect(thread.messages).toHaveLength(1);
      expect(thread.subject).toBe('Inbound Test');

      // Raw message should be stored
      const raw = await server.inboxes.messages.getRaw(inbox.inboxId, message.messageId);
      expect(raw.toString()).toContain('Hello from the outside!');
    });

    it('should thread inbound replies correctly', async () => {
      const inbox = await server.inboxes.create({ username: 'inbound-thread' });

      // Send an outbound message first
      const sent = await server.inboxes.messages.send(inbox.inboxId, {
        to: 'external@example.com',
        subject: 'Outbound First',
        text: 'Starting a conversation',
      });

      // Simulate an inbound reply referencing the sent message
      const replyMime = Buffer.from(
        [
          'From: external@example.com',
          'To: inbound-thread@test.local',
          'Subject: Re: Outbound First',
          `In-Reply-To: ${sent.messageId}`,
          `References: ${sent.messageId}`,
          'Content-Type: text/plain; charset=UTF-8',
          '',
          'Thanks for your message!',
        ].join('\r\n'),
      );

      const reply = await server.processInboundEmail(replyMime, 'inbound-thread@test.local');

      // Should be in the same thread
      expect(reply.threadId).toBe(sent.threadId);

      const thread = await server.threads.get(sent.threadId);
      expect(thread.messages).toHaveLength(2);
      expect(thread.messageCount).toBe(2);
    });

    it('should reject inbound email for unknown recipient', async () => {
      const rawMime = Buffer.from(['From: sender@ext.com', 'To: nobody@test.local', 'Subject: Lost', '', 'Body'].join('\r\n'));

      await expect(server.processInboundEmail(rawMime, 'nobody@test.local')).rejects.toThrow('No inbox found');
    });
  });

  // ── extracted_text reply stripping ──

  describe('extracted_text', () => {
    it('should strip quoted reply history from inbound email', async () => {
      await server.inboxes.create({ username: 'extract-test' });

      const rawMime = Buffer.from(
        [
          'From: customer@example.com',
          'To: extract-test@test.local',
          'Subject: Re: Help',
          'Content-Type: text/plain; charset=UTF-8',
          '',
          'Thanks, that fixed it!',
          '',
          'On Mon, Apr 14, 2026 at 10:00 AM Support <extract-test@test.local> wrote:',
          '> Have you tried restarting?',
          '> Let me know if that helps.',
        ].join('\r\n'),
      );

      const message = await server.processInboundEmail(rawMime, 'extract-test@test.local');

      // Full text includes everything
      expect(message.text).toContain('Thanks, that fixed it!');
      expect(message.text).toContain('Have you tried restarting?');

      // extracted_text should only have the new reply
      expect(message.extractedText).toBe('Thanks, that fixed it!');
      expect(message.extractedText).not.toContain('Have you tried restarting?');
    });

    it('should strip signature blocks', async () => {
      await server.inboxes.create({ username: 'sig-test' });

      const rawMime = Buffer.from(
        ['From: user@example.com', 'To: sig-test@test.local', 'Subject: Meeting', 'Content-Type: text/plain; charset=UTF-8', '', 'See you at 3pm.', '', '-- ', 'John Smith', 'CEO, Acme Corp'].join(
          '\r\n',
        ),
      );

      const message = await server.processInboundEmail(rawMime, 'sig-test@test.local');
      expect(message.extractedText).toBe('See you at 3pm.');
    });
  });

  // ── NoopTransport Assertions ──

  describe('NoopTransport', () => {
    it('should record all sent messages for test assertions', async () => {
      const inbox = await server.inboxes.create({ username: 'noop-test' });

      await server.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'One', text: '1' });
      await server.inboxes.messages.send(inbox.inboxId, { to: 'c@d.com', subject: 'Two', text: '2' });

      expect(transport.sent).toHaveLength(2);
      expect(transport.sent[0].params.subject).toBe('One');
      expect(transport.sent[1].params.subject).toBe('Two');

      transport.clear();
      expect(transport.sent).toHaveLength(0);
    });
  });
});
