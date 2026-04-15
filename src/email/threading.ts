import type { StorageAdapter } from '../storage/adapter.js';
import type { ThreadItem } from '../types/thread.js';
import type { Attachment } from '../types/attachment.js';
import { generateId } from '../util/id.js';

export async function resolveOrCreateThread(
  storage: StorageAdapter,
  params: {
    inboxId: string;
    subject?: string;
    from: string | string[];
    to: string | string[];
    inReplyTo?: string;
    references?: string[];
    timestamp: Date;
    preview?: string;
    messageId: string;
    attachments?: Attachment[];
    size: number;
  },
): Promise<{ threadId: string; isNew: boolean }> {
  // Try to find existing thread via In-Reply-To/References
  const existingThreadId = await storage.resolveThread(params.inboxId, params.inReplyTo, params.references, params.subject);

  if (existingThreadId) {
    return { threadId: existingThreadId, isNew: false };
  }

  // Create a new thread
  const threadId = generateId('thread');
  const from = Array.isArray(params.from) ? params.from : [params.from];
  const to = Array.isArray(params.to) ? params.to : [params.to];

  const thread: ThreadItem = {
    inboxId: params.inboxId,
    threadId,
    labels: [],
    timestamp: params.timestamp,
    senders: from,
    recipients: to,
    subject: params.subject,
    preview: params.preview,
    attachments: params.attachments,
    lastMessageId: params.messageId,
    messageCount: 0, // Will be incremented by updateThreadOnNewMessage
    size: 0,
    updatedAt: params.timestamp,
    createdAt: params.timestamp,
  };

  await storage.createThread(thread);
  return { threadId, isNew: true };
}
