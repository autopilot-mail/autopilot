/**
 * SQLite + SMTP — local development setup
 *
 * Uses a local SQLite database file and sends via SMTP.
 * Great for development and single-process deployments.
 *
 * Prerequisites:
 *   npm install better-sqlite3 nodemailer
 *
 * Run: npx tsx examples/04-sqlite-smtp.ts
 */
import { AutopilotServer } from '../src/index.js';
import { SqliteStorageAdapter } from '../src/storage/sqlite.js';
import { SmtpTransport } from '../src/transport/smtp.js';

async function main() {
  const server = new AutopilotServer({
    storage: new SqliteStorageAdapter({
      filename: './agentmail-dev.db',
    }),
    transport: new SmtpTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    }),
    defaultDomain: 'myapp.local',
  });

  await server.initialize();
  console.log('AgentMail initialized with SQLite + SMTP');

  // Create an inbox
  const inbox = await server.inboxes.create({
    username: 'dev-bot',
    displayName: 'Development Bot',
  });
  console.log(`Inbox: ${inbox.email}`);

  // Create a draft
  const draft = await server.inboxes.drafts.create(inbox.inboxId, {
    to: 'developer@example.com',
    subject: 'Build complete',
    text: 'The latest build passed all tests.',
  });
  console.log(`Draft created: ${draft.draftId}`);

  // Review and update the draft
  const updated = await server.inboxes.drafts.update(inbox.inboxId, draft.draftId, {
    text: 'The latest build passed all 31 tests. Ready to deploy!',
  });
  console.log(`Draft updated: ${updated.text}`);

  // Send the draft
  const result = await server.inboxes.drafts.send(inbox.inboxId, draft.draftId);
  console.log(`Draft sent as message ${result.messageId}`);

  await server.close();
}

main().catch(console.error);
