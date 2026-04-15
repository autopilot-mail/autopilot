/**
 * Basic send example — InMemory storage + NoopTransport
 *
 * Run: npx tsx examples/01-basic-send.ts
 */
import { AutopilotServer } from '../src/index.js';
import { InMemoryStorageAdapter } from '../src/storage/memory.js';
import { NoopTransport } from '../src/transport/noop.js';

async function main() {
  const transport = new NoopTransport();
  const server = new AutopilotServer({
    storage: new InMemoryStorageAdapter(),
    transport,
    defaultDomain: 'demo.local',
  });
  await server.initialize();

  // Create an inbox
  const inbox = await server.inboxes.create({
    username: 'support',
    displayName: 'Support Agent',
  });
  console.log(`Created inbox: ${inbox.email}`);

  // Send a message
  const { messageId, threadId } = await server.inboxes.messages.send(inbox.inboxId, {
    to: 'customer@example.com',
    subject: 'Your order has shipped!',
    text: 'Hi! Your order #42 has been shipped and is on its way.',
    html: '<p>Hi! Your order <b>#42</b> has been shipped and is on its way.</p>',
  });
  console.log(`Sent message ${messageId} in thread ${threadId}`);

  // Reply to the message
  const reply = await server.inboxes.messages.reply(inbox.inboxId, messageId, {
    text: 'Follow-up: tracking number is XYZ123',
  });
  console.log(`Reply ${reply.messageId} added to thread ${reply.threadId}`);

  // List threads
  const { threads } = await server.inboxes.threads.list(inbox.inboxId);
  console.log(`\nInbox has ${threads.length} thread(s):`);
  for (const t of threads) {
    console.log(`  - "${t.subject}" (${t.messageCount} messages)`);
  }

  // Get full thread
  const thread = await server.threads.get(threadId);
  console.log(`\nThread "${thread.subject}" messages:`);
  for (const msg of thread.messages) {
    console.log(`  [${msg.labels.join(',')}] ${msg.from} → ${msg.to}: ${msg.preview}`);
  }

  // Check what the transport recorded
  console.log(`\nTransport recorded ${transport.sent.length} sends:`);
  for (const s of transport.sent) {
    console.log(`  → ${s.params.to.join(', ')}: ${s.params.subject}`);
  }

  await server.close();
}

main().catch(console.error);
