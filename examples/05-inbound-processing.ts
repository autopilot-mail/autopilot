/**
 * Inbound email processing — directly from raw MIME
 *
 * Shows how to process inbound emails without webhooks.
 * Useful when you fetch emails from S3, IMAP, or any other source.
 *
 * Run: npx tsx examples/05-inbound-processing.ts
 */
import { AutopilotServer } from '../src/index.js';
import { InMemoryStorageAdapter } from '../src/storage/memory.js';
import { NoopTransport } from '../src/transport/noop.js';

async function main() {
  const server = new AutopilotServer({
    storage: new InMemoryStorageAdapter(),
    transport: new NoopTransport(),
    defaultDomain: 'agents.example.com',
  });
  await server.initialize();

  // Create an inbox that will receive mail
  const inbox = await server.inboxes.create({
    username: 'intake',
    displayName: 'Intake Agent',
  });
  console.log(`Inbox ready: ${inbox.email}`);

  // Simulate receiving a raw MIME email (e.g., fetched from S3 or IMAP)
  const rawEmail1 = Buffer.from(
    [
      'From: customer@gmail.com',
      'To: intake@agents.example.com',
      'Subject: Bug report: login page broken',
      'Date: Mon, 14 Apr 2026 10:30:00 -0700',
      'Message-ID: <external-msg-001@gmail.com>',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'Hi,',
      '',
      "I can't log in to my account. The login page shows a blank white screen.",
      'Please help!',
      '',
      'Thanks,',
      'Alice',
    ].join('\r\n'),
  );

  const msg1 = await server.processInboundEmail(rawEmail1, 'intake@agents.example.com');
  console.log(`\nReceived: "${msg1.subject}" from ${msg1.from}`);
  console.log(`  Thread: ${msg1.threadId}`);
  console.log(`  Labels: ${msg1.labels.join(', ')}`);

  // Simulate a follow-up from the same sender (threaded via References)
  const rawEmail2 = Buffer.from(
    [
      'From: customer@gmail.com',
      'To: intake@agents.example.com',
      'Subject: Re: Bug report: login page broken',
      'Date: Mon, 14 Apr 2026 11:00:00 -0700',
      'Message-ID: <external-msg-002@gmail.com>',
      `In-Reply-To: ${msg1.messageId}`,
      `References: ${msg1.messageId}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'Update: I tried a different browser and it works. Seems like a Chrome issue.',
    ].join('\r\n'),
  );

  const msg2 = await server.processInboundEmail(rawEmail2, 'intake@agents.example.com');
  console.log(`\nReceived follow-up: "${msg2.subject}"`);
  console.log(`  Same thread? ${msg2.threadId === msg1.threadId}`);

  // View the full thread
  const thread = await server.threads.get(msg1.threadId);
  console.log(`\n--- Thread: "${thread.subject}" (${thread.messageCount} messages) ---`);
  for (const msg of thread.messages) {
    console.log(`  [${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.from}:`);
    console.log(`    ${msg.text?.split('\n')[0]}`);
  }

  // Agent replies
  const reply = await server.inboxes.messages.reply(inbox.inboxId, msg2.messageId, {
    text: "Thanks for the update! We'll investigate the Chrome compatibility issue.",
  });
  console.log(`\nAgent replied: ${reply.messageId}`);

  // Final thread state
  const finalThread = await server.threads.get(msg1.threadId);
  console.log(`Thread now has ${finalThread.messageCount} messages`);

  await server.close();
}

main().catch(console.error);
