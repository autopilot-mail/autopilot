/**
 * AgentMail SDK Compatibility Test
 *
 * Spins up a real Autopilot HTTP server with InMemory + Noop,
 * then drives it with the official `agentmail` npm package.
 *
 * This proves the REST API is wire-compatible with the hosted AgentMail service.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { serve, type ServerType } from '@hono/node-server';
import { AgentMailClient } from 'agentmail';
import { AutopilotServer } from '../src/server.js';
import { InMemoryStorageAdapter } from '../src/storage/memory.js';
import { NoopTransport } from '../src/transport/noop.js';
import { createRouter } from '../src/bin/router.js';

const PORT = 9876;
const BASE_URL = `http://localhost:${PORT}`;
const API_KEY = 'test-key-123';

describe('AgentMail SDK Compatibility', () => {
  let httpServer: ServerType;
  let autopilot: AutopilotServer;
  let client: AgentMailClient;

  beforeAll(async () => {
    autopilot = new AutopilotServer({
      storage: new InMemoryStorageAdapter(),
      transport: new NoopTransport(),
      defaultDomain: 'test.autopilot.dev',
      podId: 'test-pod',
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    await autopilot.initialize();

    const app = createRouter(autopilot, [API_KEY]);

    httpServer = serve({ fetch: app.fetch, port: PORT });

    // Wait for server to be ready
    for (let i = 0; i < 20; i++) {
      try {
        await fetch(`${BASE_URL}/health`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    client = new AgentMailClient({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
    });
  });

  afterAll(async () => {
    httpServer?.close();
    await autopilot?.close();
  });

  // ── Inboxes ──

  describe('Inboxes', () => {
    it('should create an inbox', async () => {
      const inbox = await client.inboxes.create({
        username: 'sdk-test',
        displayName: 'SDK Test Bot',
      });

      expect(inbox.inboxId).toBeTruthy();
      expect(inbox.email).toBe('sdk-test@test.autopilot.dev');
      expect(inbox.displayName).toBe('SDK Test Bot');
      expect(inbox.podId).toBe('test-pod');
      expect(inbox.createdAt).toBeTruthy();
    });

    it('should create an inbox with no args', async () => {
      const inbox = await client.inboxes.create();
      expect(inbox.inboxId).toBeTruthy();
      expect(inbox.email).toContain('@test.autopilot.dev');
    });

    it('should list inboxes', async () => {
      const result = await client.inboxes.list();
      expect(result.inboxes.length).toBeGreaterThanOrEqual(2);
    });

    it('should get an inbox by ID', async () => {
      const created = await client.inboxes.create({ username: 'sdk-get' });
      const fetched = await client.inboxes.get(created.inboxId);
      expect(fetched.email).toBe(created.email);
      expect(fetched.inboxId).toBe(created.inboxId);
    });

    it('should update an inbox', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-update' });
      const updated = await client.inboxes.update(inbox.inboxId, { displayName: 'Updated via SDK' });
      expect(updated.displayName).toBe('Updated via SDK');
    });

    it('should delete an inbox', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-delete' });
      await client.inboxes.delete(inbox.inboxId);

      try {
        await client.inboxes.get(inbox.inboxId);
        expect(true).toBe(false); // should not reach
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
      }
    });
  });

  // ── Messages ──

  describe('Messages', () => {
    it('should send a message', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-send' });

      const result = await client.inboxes.messages.send(inbox.inboxId, {
        to: 'recipient@example.com',
        subject: 'SDK Send Test',
        text: 'Hello from the agentmail SDK',
        html: '<p>Hello from the agentmail SDK</p>',
      });

      expect(result.messageId).toBeTruthy();
      expect(result.threadId).toBeTruthy();
      expect(result.timestamp).toBeTruthy();
    });

    it('should list messages', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-list-msg' });

      await client.inboxes.messages.send(inbox.inboxId, {
        to: 'a@b.com',
        subject: 'Msg 1',
        text: 'first',
      });
      await client.inboxes.messages.send(inbox.inboxId, {
        to: 'a@b.com',
        subject: 'Msg 2',
        text: 'second',
      });

      const result = await client.inboxes.messages.list(inbox.inboxId);
      expect(result.messages.length).toBe(2);
    });

    it('should get a message by ID', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-get-msg' });
      const sent = await client.inboxes.messages.send(inbox.inboxId, {
        to: 'a@b.com',
        subject: 'Get Me',
        text: 'body text here',
      });

      const msg = await client.inboxes.messages.get(inbox.inboxId, sent.messageId);
      expect(msg.subject).toBe('Get Me');
      expect(msg.text).toBe('body text here');
      expect(msg.from).toBeTruthy();
      expect(msg.labels).toContain('SENT');
    });

    it('should reply to a message', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-reply' });

      const original = await client.inboxes.messages.send(inbox.inboxId, {
        to: 'recipient@example.com',
        subject: 'Original',
        text: 'original body',
      });

      const reply = await client.inboxes.messages.reply(inbox.inboxId, original.messageId, {
        text: 'This is a reply',
      });

      // Reply should be in the same thread
      expect(reply.threadId).toBe(original.threadId);
    });

    it('should reply all', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-replyall' });

      const original = await client.inboxes.messages.send(inbox.inboxId, {
        to: ['alice@example.com', 'bob@example.com'],
        subject: 'Group',
        text: 'hello group',
      });

      const reply = await client.inboxes.messages.replyAll(inbox.inboxId, original.messageId, {
        text: 'Reply to all',
      });

      expect(reply.threadId).toBe(original.threadId);
    });

    it('should forward a message', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-fwd' });

      const original = await client.inboxes.messages.send(inbox.inboxId, {
        to: 'original@example.com',
        subject: 'Forward This',
        text: 'important content',
      });

      const fwd = await client.inboxes.messages.forward(inbox.inboxId, original.messageId, {
        to: 'new@example.com',
      });

      expect(fwd.messageId).toBeTruthy();
      expect(fwd.threadId).toBeTruthy();
    });

    it('should update message labels', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-labels' });
      const sent = await client.inboxes.messages.send(inbox.inboxId, {
        to: 'a@b.com',
        subject: 'Labels',
        text: 'test',
      });

      const updated = await client.inboxes.messages.update(inbox.inboxId, sent.messageId, {
        addLabels: ['important', 'reviewed'],
      });

      expect(updated.labels).toContain('important');
      expect(updated.labels).toContain('reviewed');
      expect(updated.labels).toContain('SENT');
    });

    it('should delete a message', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-del-msg' });
      const sent = await client.inboxes.messages.send(inbox.inboxId, {
        to: 'a@b.com',
        subject: 'Delete Me',
        text: 'test',
      });

      await client.inboxes.messages.delete(inbox.inboxId, sent.messageId);

      try {
        await client.inboxes.messages.get(inbox.inboxId, sent.messageId);
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
      }
    });
  });

  // ── Threads ──

  describe('Threads', () => {
    it('should list threads in inbox', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-threads' });

      await client.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'Thread 1', text: 't1' });
      await client.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'Thread 2', text: 't2' });

      const result = await client.inboxes.threads.list(inbox.inboxId);
      expect(result.threads.length).toBe(2);
    });

    it('should get a thread with messages', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-get-thread' });

      const sent = await client.inboxes.messages.send(inbox.inboxId, {
        to: 'a@b.com',
        subject: 'Full Thread',
        text: 'msg 1',
      });

      await client.inboxes.messages.reply(inbox.inboxId, sent.messageId, { text: 'msg 2' });

      const thread = await client.threads.get(sent.threadId);
      expect(thread.messages.length).toBe(2);
      expect(thread.subject).toBe('Full Thread');
      expect(thread.messageCount).toBe(2);
      expect(thread.senders).toContain('sdk-get-thread@test.autopilot.dev');
    });

    it('should list threads globally', async () => {
      const result = await client.threads.list();
      expect(result.threads.length).toBeGreaterThan(0);
    });

    it('should delete a thread', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-del-thread' });
      const sent = await client.inboxes.messages.send(inbox.inboxId, { to: 'a@b.com', subject: 'Delete Thread', text: 'x' });

      await client.threads.delete(sent.threadId);

      try {
        await client.threads.get(sent.threadId);
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
      }
    });
  });

  // ── Drafts ──

  describe('Drafts', () => {
    it('should create, update, and send a draft', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-draft' });

      const draft = await client.inboxes.drafts.create(inbox.inboxId, {
        to: ['recipient@example.com'],
        subject: 'Draft Subject',
        text: 'Draft body',
      });

      expect(draft.draftId).toBeTruthy();
      expect(draft.subject).toBe('Draft Subject');

      // Update
      const updated = await client.inboxes.drafts.update(inbox.inboxId, draft.draftId, {
        text: 'Updated draft body',
      });
      expect(updated.text).toBe('Updated draft body');

      // Send
      const sendResult = await client.inboxes.drafts.send(inbox.inboxId, draft.draftId, {});
      expect(sendResult.messageId).toBeTruthy();

      // Draft should be gone
      try {
        await client.inboxes.drafts.get(inbox.inboxId, draft.draftId);
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
      }
    });

    it('should list drafts', async () => {
      const inbox = await client.inboxes.create({ username: 'sdk-list-draft' });

      await client.inboxes.drafts.create(inbox.inboxId, { subject: 'Draft A', text: 'a' });
      await client.inboxes.drafts.create(inbox.inboxId, { subject: 'Draft B', text: 'b' });

      const result = await client.inboxes.drafts.list(inbox.inboxId);
      expect(result.drafts.length).toBe(2);
    });

    it('should list drafts globally', async () => {
      const result = await client.drafts.list();
      expect(result.drafts.length).toBeGreaterThan(0);
    });
  });

  // ── Webhooks ──

  describe('Webhooks', () => {
    it('should create and list webhooks', async () => {
      const webhook = await client.webhooks.create({
        url: 'https://example.com/hook',
        eventTypes: ['message.received'],
      });

      expect(webhook.webhookId).toBeTruthy();
      expect(webhook.secret).toBeTruthy();
      expect(webhook.enabled).toBe(true);
      expect(webhook.url).toBe('https://example.com/hook');

      const fetched = await client.webhooks.get(webhook.webhookId);
      expect(fetched.url).toBe('https://example.com/hook');

      const list = await client.webhooks.list();
      expect(list.webhooks.some((w) => w.webhookId === webhook.webhookId)).toBe(true);
    });

    it('should delete a webhook', async () => {
      const webhook = await client.webhooks.create({
        url: 'https://example.com/delete-me',
        eventTypes: ['message.sent'],
      });

      await client.webhooks.delete(webhook.webhookId);

      try {
        await client.webhooks.get(webhook.webhookId);
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
      }
    });
  });

  // ── Domains ──

  describe('Domains', () => {
    it('should add and list domains', async () => {
      const domain = await client.domains.create({
        domain: 'sdk-test.example.com',
        feedbackEnabled: false,
      });

      expect(domain.domainId).toBeTruthy();
      expect(domain.domain).toBe('sdk-test.example.com');
      expect(domain.status).toBe('NOT_STARTED');

      const list = await client.domains.list();
      expect(list.domains.some((d) => d.domainId === domain.domainId)).toBe(true);
    });

    it('should delete a domain', async () => {
      const domain = await client.domains.create({
        domain: 'delete-sdk.example.com',
        feedbackEnabled: false,
      });

      await client.domains.delete(domain.domainId);

      try {
        await client.domains.get(domain.domainId);
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
      }
    });
  });
});
