/**
 * Express + PostgreSQL + SES — full production setup
 *
 * Prerequisites:
 *   npm install express @aws-sdk/client-sesv2 @aws-sdk/client-s3 pg
 *
 * Environment variables:
 *   DATABASE_URL    — PostgreSQL connection string
 *   AWS_REGION      — AWS region (e.g. us-east-1)
 *   SES_S3_BUCKET   — S3 bucket for inbound SES emails
 *   MAIL_DOMAIN     — Your verified SES domain
 *
 * Run: npx tsx examples/02-express-webhooks.ts
 */
import express from 'express';
import { AutopilotServer } from '../src/index.js';
import { PostgresStorageAdapter } from '../src/storage/postgres.js';
import { SesTransport } from '../src/transport/ses.js';
import { createExpressWebhookHandler } from '../src/webhooks/express.js';

async function main() {
  const region = process.env.AWS_REGION ?? 'us-east-1';

  const server = new AutopilotServer({
    storage: new PostgresStorageAdapter({
      connectionString: process.env.DATABASE_URL!,
      schema: 'agentmail',
    }),
    transport: new SesTransport({ region }),
    defaultDomain: process.env.MAIL_DOMAIN ?? 'mail.example.com',
    s3: {
      region,
      bucket: process.env.SES_S3_BUCKET ?? 'my-ses-inbound',
    },
    webhookDispatch: true,
  });

  await server.initialize();
  console.log('Autopilot server initialized');

  const app = express();

  // SNS sends Content-Type: text/plain — parse it
  app.use(express.text({ type: 'text/plain' }));
  app.use(express.json());

  // Mount SES webhook handler
  app.post('/webhooks/ses', createExpressWebhookHandler(server));

  // Example API: create inbox
  app.post('/api/inboxes', async (req, res) => {
    const inbox = await server.inboxes.create({
      username: req.body.username,
      displayName: req.body.displayName,
    });
    res.json(inbox);
  });

  // Example API: send message
  app.post('/api/inboxes/:inboxId/messages', async (req, res) => {
    const result = await server.inboxes.messages.send(req.params.inboxId, {
      to: req.body.to,
      subject: req.body.subject,
      text: req.body.text,
      html: req.body.html,
    });
    res.json(result);
  });

  // Example API: list threads
  app.get('/api/inboxes/:inboxId/threads', async (req, res) => {
    const result = await server.inboxes.threads.list(req.params.inboxId);
    res.json(result);
  });

  // Example API: get thread with messages
  app.get('/api/threads/:threadId', async (req, res) => {
    const thread = await server.threads.get(req.params.threadId);
    res.json(thread);
  });

  // Register webhook for inbound notifications
  await server.webhooks.create({
    url: 'https://your-app.com/hooks/mail',
    eventTypes: ['message.received', 'message.sent'],
  });

  const port = process.env.PORT ?? 3000;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`  POST /webhooks/ses        — SES/SNS inbound webhook`);
    console.log(`  POST /api/inboxes         — Create inbox`);
    console.log(`  POST /api/inboxes/:id/messages — Send message`);
    console.log(`  GET  /api/inboxes/:id/threads  — List threads`);
    console.log(`  GET  /api/threads/:id     — Get thread`);
  });
}

main().catch(console.error);
