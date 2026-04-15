/**
 * Live AWS integration test — real SES + real S3.
 *
 * Run: npm run test:aws
 * Requires: AWS credentials in environment with SES send + S3 create/put/get permissions.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, type ServerType } from '@hono/node-server';
import { AgentMailClient } from 'agentmail';
import { AutopilotServer } from '../../src/server.js';
import { InMemoryStorageAdapter } from '../../src/storage/memory.js';
import { SesTransport } from '../../src/transport/ses.js';
import { S3FileStorage } from '../../src/file-storage/s3.js';
import { createRouter } from '../../src/bin/router.js';

const REGION = 'us-west-2';
const SES_DOMAIN = process.env.SES_DOMAIN;
const RECIPIENT = `test-recv-${Date.now()}@${SES_DOMAIN}`;
const S3_BUCKET = `autopilot-test-${Date.now()}`;
const API_KEY = 'aws-live-test';
const PORT = 19876;

const SILENT_LOGGER = { info: () => {}, warn: () => {}, error: console.error, debug: () => {} };

describe('Live AWS Integration (SES + S3)', { timeout: 60_000 }, () => {
  let autopilot: AutopilotServer;
  let httpServer: ServerType;
  let client: AgentMailClient;
  let s3Client: any;

  before(async () => {
    // Create S3 bucket for the test
    const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3');
    s3Client = new S3Client({ region: REGION });
    console.log(`Creating temp S3 bucket: ${S3_BUCKET}`);
    await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));

    // Create server with real SES + real S3
    autopilot = new AutopilotServer({
      storage: new InMemoryStorageAdapter(),
      transport: new SesTransport({ region: REGION }),
      fileStorage: new S3FileStorage({ region: REGION, bucket: S3_BUCKET, prefix: 'test' }),
      defaultDomain: SES_DOMAIN,
      logger: SILENT_LOGGER,
    });
    await autopilot.initialize();

    const app = createRouter(autopilot, [API_KEY]);
    httpServer = serve({ fetch: app.fetch, port: PORT });

    for (let i = 0; i < 20; i++) {
      try {
        await fetch(`http://localhost:${PORT}/health`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    client = new AgentMailClient({ baseUrl: `http://localhost:${PORT}`, apiKey: API_KEY });
    console.log('Server ready');
  });

  after(async () => {
    httpServer?.close();
    await autopilot?.close();

    // Cleanup S3 bucket
    try {
      const { ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } = await import('@aws-sdk/client-s3');
      const list = await s3Client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET }));
      if (list.Contents?.length) {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: S3_BUCKET,
            Delete: { Objects: list.Contents.map((o: any) => ({ Key: o.Key })) },
          }),
        );
      }
      await s3Client.send(new DeleteBucketCommand({ Bucket: S3_BUCKET }));
      console.log(`Cleaned up S3 bucket: ${S3_BUCKET}`);
    } catch (err) {
      console.error('S3 cleanup failed:', err);
    }
  });

  it('should create inbox on verified SES domain', async () => {
    const inbox = await client.inboxes.create({ username: `test-${Date.now()}` });
    assert.ok(inbox.inboxId);
    assert.ok(inbox.email.endsWith(`@${SES_DOMAIN}`));
    console.log(`  Inbox: ${inbox.email}`);
  });

  it('should send a real email via SES', async () => {
    const inbox = await client.inboxes.create({ username: `ses-send-${Date.now()}` });

    const result = await client.inboxes.messages.send(inbox.inboxId, {
      to: RECIPIENT,
      subject: `[Autopilot Test] ${new Date().toISOString()}`,
      text: 'This is a live integration test from Autopilot using AWS SES.',
      html: '<p>This is a <b>live integration test</b> from Autopilot using AWS SES.</p>',
    });

    assert.ok(result.messageId);
    assert.ok(result.threadId);
    console.log(`  Sent message ${result.messageId} to ${RECIPIENT}`);
  });

  it('should send + reply (threading via SES)', async () => {
    const inbox = await client.inboxes.create({ username: `ses-thread-${Date.now()}` });

    const sent = await client.inboxes.messages.send(inbox.inboxId, {
      to: RECIPIENT,
      subject: `[Autopilot Thread Test] ${new Date().toISOString()}`,
      text: 'Original message',
    });

    const reply = await client.inboxes.messages.reply(inbox.inboxId, sent.messageId, {
      text: 'Reply message',
    });

    assert.equal(reply.threadId, sent.threadId);

    const thread = await client.threads.get(sent.threadId);
    assert.equal(thread.messages.length, 2);
    console.log(`  Thread ${sent.threadId}: ${thread.messageCount} messages`);
  });

  it('should store inbound email in S3 file storage', async () => {
    const inbox = await client.inboxes.create({ username: `s3-inbound-${Date.now()}` });

    const rawMime = Buffer.from(['From: test@external.com', `To: ${inbox.email}`, 'Subject: S3 storage test', 'Content-Type: text/plain; charset=UTF-8', '', 'Body stored in S3'].join('\r\n'));

    const message = await autopilot.processInboundEmail(rawMime, inbox.email);
    assert.ok(message.messageId);
    assert.equal(message.subject, 'S3 storage test');

    // Verify raw message was stored in S3 and can be retrieved
    const raw = await autopilot.inboxes.messages.getRaw(inbox.inboxId, message.messageId);
    assert.ok(raw.length > 0);
    assert.ok(raw.toString().includes('Body stored in S3'));
    console.log(`  Inbound stored in S3: ${message.messageId} (${raw.length} bytes)`);
  });

  it('should list via SDK after real sends', async () => {
    const inboxes = await client.inboxes.list();
    assert.ok(inboxes.inboxes.length >= 3);

    const threads = await client.threads.list();
    assert.ok(threads.threads.length >= 1);
    console.log(`  ${inboxes.inboxes.length} inboxes, ${threads.threads.length} threads`);
  });
});
