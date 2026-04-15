/**
 * Query-only setup — MongoDB, no webhooks, no transport
 *
 * Use this pattern when you just need to read mail data
 * that was stored by another service.
 *
 * Prerequisites:
 *   npm install mongodb
 *
 * Run: npx tsx examples/03-query-only-mongo.ts
 */
import { AutopilotServer } from '../src/index.js';
import { MongoStorageAdapter } from '../src/storage/mongodb.js';

async function main() {
  const server = new AutopilotServer({
    storage: new MongoStorageAdapter({
      uri: process.env.MONGO_URI ?? 'mongodb://localhost:27017',
      database: 'agentmail',
    }),
    defaultDomain: 'mail.example.com',
    // No transport — this instance only reads data
  });

  await server.initialize();
  console.log('Connected to MongoDB (query-only mode)');

  // List all inboxes
  const { inboxes } = await server.inboxes.list({ limit: 10 });
  console.log(`\nFound ${inboxes.length} inboxes:`);

  for (const inbox of inboxes) {
    console.log(`\n  ${inbox.email} (${inbox.displayName ?? 'no name'})`);

    // List threads in each inbox
    const { threads } = await server.inboxes.threads.list(inbox.inboxId, { limit: 5 });
    for (const t of threads) {
      console.log(`    Thread: "${t.subject}" — ${t.messageCount} msgs, last from ${t.senders.join(', ')}`);
    }

    // List recent messages
    const { messages } = await server.inboxes.messages.list(inbox.inboxId, { limit: 5 });
    for (const m of messages) {
      console.log(`    Message: [${m.labels.join(',')}] ${m.subject} (${m.preview?.slice(0, 50)}...)`);
    }
  }

  await server.close();
}

main().catch(console.error);
