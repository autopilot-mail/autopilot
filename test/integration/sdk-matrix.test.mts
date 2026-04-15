/**
 * Integration test matrix — AgentMail SDK against multiple storage/file-storage permutations.
 *
 * Permutations tested:
 *   1. InMemory storage + MemoryFileStorage
 *   2. PostgreSQL storage + MemoryFileStorage
 *   3. MongoDB storage + MemoryFileStorage
 *   4. InMemory storage + MinIO S3FileStorage
 *   5. PostgreSQL storage + MinIO S3FileStorage
 *
 * Run with: npm run test:integration
 * Requires Docker running locally.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, type ServerType } from '@hono/node-server';
import { AgentMailClient } from 'agentmail';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { MinioContainer, type StartedMinioContainer } from '@testcontainers/minio';
import * as Minio from 'minio';
import { AutopilotServer } from '../../src/server.js';
import { InMemoryStorageAdapter } from '../../src/storage/memory.js';
import { PostgresStorageAdapter } from '../../src/storage/postgres.js';
import { MongoStorageAdapter } from '../../src/storage/mongodb.js';
import { NoopTransport } from '../../src/transport/noop.js';
import { MemoryFileStorage } from '../../src/file-storage/memory.js';
import { S3FileStorage } from '../../src/file-storage/s3.js';
import { createRouter } from '../../src/bin/router.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import type { FileStorageProvider } from '../../src/file-storage/adapter.js';

const SILENT_LOGGER = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const API_KEY = 'integration-test-key';

// ── Container management ──

let pgContainer: StartedPostgreSqlContainer | null = null;
let mongoContainer: StartedMongoDBContainer | null = null;
let minioContainer: StartedMinioContainer | null = null;

async function startContainers() {
  console.log('Starting containers (this may take a minute on first run)...');

  const [pg, mongo, minio] = await Promise.all([new PostgreSqlContainer('postgres:16-alpine').start(), new MongoDBContainer('mongo:7').start(), new MinioContainer('minio/minio:latest').start()]);

  pgContainer = pg;
  mongoContainer = mongo;
  minioContainer = minio;

  // Create MinIO bucket
  const minioClient = new Minio.Client({
    endPoint: minioContainer.getHost(),
    port: minioContainer.getPort(),
    useSSL: false,
    accessKey: minioContainer.getUsername(),
    secretKey: minioContainer.getPassword(),
  });
  await minioClient.makeBucket('autopilot-test', 'us-east-1');

  console.log(`  Postgres: ${pgContainer.getConnectionUri()}`);
  console.log(`  MongoDB:  ${mongoContainer.getConnectionString()}`);
  console.log(`  MinIO:    ${minioContainer.getConnectionUrl()}`);
}

async function stopContainers() {
  await Promise.all([pgContainer?.stop(), mongoContainer?.stop(), minioContainer?.stop()]);
}

// ── Factory functions ──

function createStorageAdapter(type: string): StorageAdapter {
  switch (type) {
    case 'memory':
      return new InMemoryStorageAdapter();
    case 'postgres':
      return new PostgresStorageAdapter({ connectionString: pgContainer!.getConnectionUri() });
    case 'mongodb': {
      const mongoUri = mongoContainer!.getConnectionString() + '?directConnection=true';
      return new MongoStorageAdapter({ uri: mongoUri, database: `autopilot_test_${Date.now()}` });
    }
    default:
      throw new Error(`Unknown storage: ${type}`);
  }
}

function createFileStorageProvider(type: string): FileStorageProvider {
  switch (type) {
    case 'memory':
      return new MemoryFileStorage();
    case 's3-minio':
      return new S3FileStorage({
        region: 'us-east-1',
        bucket: 'autopilot-test',
        prefix: `test-${Date.now()}`,
        credentials: {
          accessKeyId: minioContainer!.getUsername(),
          secretAccessKey: minioContainer!.getPassword(),
        },
        endpoint: minioContainer!.getConnectionUrl(),
        forcePathStyle: true,
      });
    default:
      throw new Error(`Unknown file storage: ${type}`);
  }
}

// ── SDK test suite (runs against any permutation) ──

async function runSdkSuite(suiteName: string, storageType: string, fileStorageType: string) {
  describe(suiteName, async () => {
    let autopilot: AutopilotServer;
    let httpServer: ServerType;
    let client: AgentMailClient;
    const port = 10000 + Math.floor(Math.random() * 50000);

    before(async () => {
      const storage = createStorageAdapter(storageType);
      const fileStorage = createFileStorageProvider(fileStorageType);

      autopilot = new AutopilotServer({
        storage,
        transport: new NoopTransport(),
        fileStorage,
        defaultDomain: 'integration.test',
        podId: 'test-pod',
        logger: SILENT_LOGGER,
      });
      await autopilot.initialize();

      const app = createRouter(autopilot, [API_KEY]);
      httpServer = serve({ fetch: app.fetch, port });

      // Wait for server
      for (let i = 0; i < 30; i++) {
        try {
          await fetch(`http://localhost:${port}/health`);
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      client = new AgentMailClient({ baseUrl: `http://localhost:${port}`, apiKey: API_KEY });
    });

    after(async () => {
      httpServer?.close();
      await autopilot?.close();
    });

    // ── Inbox CRUD ──

    it('create + get + list inboxes', async () => {
      const inbox = await client.inboxes.create({ username: `t${Date.now()}`, displayName: 'Test' });
      assert.ok(inbox.inboxId);
      assert.ok(inbox.email.endsWith('@integration.test'));
      assert.equal(inbox.displayName, 'Test');

      const fetched = await client.inboxes.get(inbox.inboxId);
      assert.equal(fetched.email, inbox.email);

      const list = await client.inboxes.list();
      assert.ok(list.inboxes.length >= 1);
    });

    it('update + delete inbox', async () => {
      const inbox = await client.inboxes.create({ username: `del${Date.now()}` });
      const updated = await client.inboxes.update(inbox.inboxId, { displayName: 'Updated' });
      assert.equal(updated.displayName, 'Updated');

      await client.inboxes.delete(inbox.inboxId);
      await assert.rejects(() => client.inboxes.get(inbox.inboxId));
    });

    // ── Send + threading ──

    it('send message + reply (same thread)', async () => {
      const inbox = await client.inboxes.create({ username: `send${Date.now()}` });

      const sent = await client.inboxes.messages.send(inbox.inboxId, {
        to: 'recipient@example.com',
        subject: 'Integration test',
        text: 'Hello from integration test',
      });
      assert.ok(sent.messageId);
      assert.ok(sent.threadId);

      const reply = await client.inboxes.messages.reply(inbox.inboxId, sent.messageId, {
        text: 'Reply text',
      });
      assert.equal(reply.threadId, sent.threadId);

      const thread = await client.threads.get(sent.threadId);
      assert.equal(thread.messages.length, 2);
      assert.equal(thread.messageCount, 2);
    });

    it('forward message', async () => {
      const inbox = await client.inboxes.create({ username: `fwd${Date.now()}` });
      const sent = await client.inboxes.messages.send(inbox.inboxId, {
        to: 'a@b.com',
        subject: 'Forward me',
        text: 'content',
      });

      const fwd = await client.inboxes.messages.forward(inbox.inboxId, sent.messageId, {
        to: 'new@example.com',
      });
      assert.ok(fwd.messageId);
    });

    // ── Message CRUD ──

    it('get + list + update labels + delete message', async () => {
      const inbox = await client.inboxes.create({ username: `msg${Date.now()}` });
      const sent = await client.inboxes.messages.send(inbox.inboxId, {
        to: 'a@b.com',
        subject: 'CRUD test',
        text: 'body',
      });

      const msg = await client.inboxes.messages.get(inbox.inboxId, sent.messageId);
      assert.equal(msg.subject, 'CRUD test');
      assert.ok(msg.labels.includes('SENT'));

      const list = await client.inboxes.messages.list(inbox.inboxId);
      assert.ok(list.messages.length >= 1);

      const updated = await client.inboxes.messages.update(inbox.inboxId, sent.messageId, {
        addLabels: ['important'],
      });
      assert.ok(updated.labels.includes('important'));

      await client.inboxes.messages.delete(inbox.inboxId, sent.messageId);
      await assert.rejects(() => client.inboxes.messages.get(inbox.inboxId, sent.messageId));
    });

    // ── Threads ──

    it('list threads + delete thread', async () => {
      const inbox = await client.inboxes.create({ username: `thd${Date.now()}` });
      const sent = await client.inboxes.messages.send(inbox.inboxId, {
        to: 'a@b.com',
        subject: 'Thread test',
        text: 'x',
      });

      const threads = await client.inboxes.threads.list(inbox.inboxId);
      assert.ok(threads.threads.length >= 1);

      await client.threads.delete(sent.threadId);
      await assert.rejects(() => client.threads.get(sent.threadId));
    });

    // ── Drafts ──

    it('create + update + send draft', async () => {
      const inbox = await client.inboxes.create({ username: `dft${Date.now()}` });

      const draft = await client.inboxes.drafts.create(inbox.inboxId, {
        to: ['recipient@example.com'],
        subject: 'Draft',
        text: 'draft body',
      });
      assert.ok(draft.draftId);

      const updated = await client.inboxes.drafts.update(inbox.inboxId, draft.draftId, {
        text: 'updated body',
      });
      assert.equal(updated.text, 'updated body');

      const result = await client.inboxes.drafts.send(inbox.inboxId, draft.draftId, {});
      assert.ok(result.messageId);
    });

    // ── Webhooks ──

    it('webhook CRUD', async () => {
      const wh = await client.webhooks.create({
        url: 'https://example.com/hook',
        eventTypes: ['message.received'],
      });
      assert.ok(wh.webhookId);
      assert.ok(wh.secret);

      const list = await client.webhooks.list();
      assert.ok(list.webhooks.some((w) => w.webhookId === wh.webhookId));

      await client.webhooks.delete(wh.webhookId);
      await assert.rejects(() => client.webhooks.get(wh.webhookId));
    });

    // ── Domains ──

    it('domain CRUD', async () => {
      const d = await client.domains.create({ domain: `d${Date.now()}.example.com`, feedbackEnabled: false });
      assert.ok(d.domainId);

      await client.domains.delete(d.domainId);
      await assert.rejects(() => client.domains.get(d.domainId));
    });

    // ── Inbound email processing ──

    it('process inbound email (via server SDK)', async () => {
      const inbox = await client.inboxes.create({ username: `in${Date.now()}` });

      const rawMime = Buffer.from(['From: sender@external.com', `To: ${inbox.email}`, 'Subject: Inbound test', 'Content-Type: text/plain; charset=UTF-8', '', 'Hello from outside!'].join('\r\n'));

      // Use server SDK directly for inbound (no HTTP endpoint for raw MIME in the REST API)
      const message = await autopilot.processInboundEmail(rawMime, inbox.email);
      assert.ok(message.messageId);
      assert.equal(message.subject, 'Inbound test');

      // Verify via client SDK
      const msgs = await client.inboxes.messages.list(inbox.inboxId);
      assert.ok(msgs.messages.some((m) => m.subject === 'Inbound test'));
    });
  });
}

// ── Main ──

describe('Integration Test Matrix', { timeout: 120_000 }, async () => {
  before(async () => {
    await startContainers();
  });

  after(async () => {
    await stopContainers();
  });

  // Permutation 1: InMemory + MemoryFileStorage (baseline)
  await runSdkSuite('InMemory + MemoryFiles', 'memory', 'memory');

  // Permutation 2: PostgreSQL + MemoryFileStorage
  await runSdkSuite('Postgres + MemoryFiles', 'postgres', 'memory');

  // Permutation 3: MongoDB + MemoryFileStorage
  await runSdkSuite('MongoDB + MemoryFiles', 'mongodb', 'memory');

  // Permutation 4: InMemory + MinIO S3
  await runSdkSuite('InMemory + MinIO S3', 'memory', 's3-minio');

  // Permutation 5: PostgreSQL + MinIO S3
  await runSdkSuite('Postgres + MinIO S3', 'postgres', 's3-minio');
});
