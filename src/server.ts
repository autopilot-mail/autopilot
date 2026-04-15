import type { AutopilotServerConfig, Logger } from './config.js';
import { defaultLogger } from './config.js';
import type { StorageAdapter } from './storage/adapter.js';
import type { EmailTransport } from './transport/adapter.js';
import type { FileStorageProvider } from './file-storage/adapter.js';
import type { Message } from './types/message.js';
import type { EventTypeValue } from './types/event.js';
import { InboxesResource } from './resources/inboxes.js';
import { ThreadsResource } from './resources/threads.js';
import { DraftsResource } from './resources/drafts.js';
import { WebhooksResource } from './resources/webhooks.js';
import { DomainsResource } from './resources/domains.js';
import { parseRawEmail, createPreview } from './email/parser.js';
import { extractReplyText, extractReplyHtml } from './email/reply-parser.js';
import { resolveOrCreateThread } from './email/threading.js';
import { EventBus } from './events/bus.js';
import { generateId } from './util/id.js';

export class AutopilotServer {
  readonly inboxes: InboxesResource;
  readonly threads: ThreadsResource;
  readonly drafts: DraftsResource;
  readonly webhooks: WebhooksResource;
  readonly domains: DomainsResource;
  readonly events: EventBus;

  private readonly storage: StorageAdapter;
  private readonly transport: EmailTransport | null;
  private readonly fileStorage: FileStorageProvider | null;
  private readonly logger: Logger;
  private readonly podId: string;

  constructor(private readonly config: AutopilotServerConfig) {
    this.storage = config.storage;
    this.transport = config.transport ?? null;
    this.fileStorage = config.fileStorage ?? null;
    this.logger = config.logger ?? defaultLogger;
    this.podId = config.podId ?? 'default';
    this.events = new EventBus();

    // Always bind dispatchEvent — it handles both webhooks and the event bus
    const dispatchEvent = this.dispatchEvent.bind(this);

    this.inboxes = new InboxesResource(this.storage, this.transport, config, this.logger, dispatchEvent);
    this.threads = new ThreadsResource(this.storage);
    this.drafts = new DraftsResource(this.storage);
    this.webhooks = new WebhooksResource(this.storage);
    this.domains = new DomainsResource(this.storage, this.podId);
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Autopilot server...');
    await this.storage.initialize();
    if (this.transport?.initialize) {
      await this.transport.initialize();
    }
    if (this.fileStorage?.initialize) {
      await this.fileStorage.initialize();
    }
    this.logger.info('Autopilot server initialized');
  }

  async close(): Promise<void> {
    this.logger.info('Shutting down Autopilot server...');
    await this.storage.close();
    if (this.transport?.close) {
      await this.transport.close();
    }
    if (this.fileStorage?.close) {
      await this.fileStorage.close();
    }
    this.logger.info('Autopilot server shut down');
  }

  /**
   * Process an inbound email from raw MIME content.
   * This is called by webhook handlers or can be called directly.
   *
   * @param raw - Raw RFC 5322 MIME content
   * @param recipientEmail - The recipient email address (used to look up the inbox)
   * @returns The stored message
   */
  async processInboundEmail(raw: Buffer, recipientEmail: string): Promise<Message> {
    const parsed = await parseRawEmail(raw);

    // Look up inbox by recipient
    const inbox = await this.storage.getInboxByEmail(recipientEmail.toLowerCase());
    if (!inbox) {
      throw new Error(`No inbox found for recipient: ${recipientEmail}`);
    }

    const messageId = generateId('message');
    const now = parsed.date ?? new Date();
    const preview = createPreview(parsed.text, parsed.html);

    // Resolve or create thread
    const { threadId } = await resolveOrCreateThread(this.storage, {
      inboxId: inbox.inboxId,
      subject: parsed.subject,
      from: parsed.from,
      to: parsed.to,
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      timestamp: now,
      preview,
      messageId,
      attachments: parsed.attachments.map((att) => ({
        attachmentId: att.attachmentId,
        filename: att.filename,
        size: att.size,
        contentType: att.contentType,
        contentDisposition: att.contentDisposition,
        contentId: att.contentId,
      })),
      size: parsed.size,
    });

    // Create the message
    const message: Message = {
      inboxId: inbox.inboxId,
      threadId,
      messageId,
      labels: ['INBOX'],
      timestamp: now,
      from: parsed.from,
      to: parsed.to,
      cc: parsed.cc,
      replyTo: parsed.replyTo,
      subject: parsed.subject,
      preview,
      text: parsed.text,
      html: parsed.html,
      extractedText: parsed.text ? extractReplyText(parsed.text) : undefined,
      extractedHtml: parsed.html ? extractReplyHtml(parsed.html) : undefined,
      attachments: parsed.attachments.map((att) => ({
        attachmentId: att.attachmentId,
        filename: att.filename,
        size: att.size,
        contentType: att.contentType,
        contentDisposition: att.contentDisposition,
        contentId: att.contentId,
      })),
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      headers: parsed.headers,
      size: parsed.size,
      updatedAt: now,
      createdAt: now,
    };

    await this.storage.createMessage(message);
    await this.storage.updateThreadOnNewMessage(threadId, message);

    // Store raw message and attachments (delegate to fileStorage if configured)
    if (this.fileStorage) {
      await this.fileStorage.putRawMessage(messageId, raw);
      for (const att of parsed.attachments) {
        await this.fileStorage.putAttachment(messageId, att.attachmentId, att.content, { filename: att.filename, contentType: att.contentType });
      }
    } else {
      await this.storage.storeRawMessage(messageId, raw);
      for (const att of parsed.attachments) {
        await this.storage.storeAttachment(messageId, {
          attachmentId: att.attachmentId,
          filename: att.filename,
          contentType: att.contentType,
          content: att.content,
        });
      }
    }

    // Dispatch webhook event
    if (this.config.webhookDispatch) {
      await this.dispatchEvent('message.received', inbox.inboxId, inbox.podId, {
        messageId,
        threadId,
        from: parsed.from,
        subject: parsed.subject,
        timestamp: now.toISOString(),
      });
    }

    this.logger.info('Inbound email processed', {
      messageId,
      threadId,
      from: parsed.from,
      to: recipientEmail,
    });

    return message;
  }

  /**
   * Dispatch an event to the event bus (WebSocket subscribers) and registered webhooks.
   */
  private async dispatchEvent(eventType: string, inboxId: string, podId: string, payload: Record<string, unknown>): Promise<void> {
    const eventId = generateId('event');
    const timestamp = new Date().toISOString();

    // Always publish to the in-process event bus (WebSocket subscribers)
    this.events.publish({
      eventId,
      eventType: eventType as EventTypeValue,
      timestamp,
      data: payload,
      inboxId,
      podId,
    });

    // Only dispatch to outbound webhooks if enabled
    if (!this.config.webhookDispatch) return;

    try {
      const webhooks = await this.storage.getWebhooksForEvent(eventType as EventTypeValue, inboxId, podId);

      if (webhooks.length === 0) return;

      const body = JSON.stringify({ eventId, eventType, timestamp, data: payload });

      for (const wh of webhooks) {
        try {
          // Compute HMAC signature
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey('raw', encoder.encode(wh.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
          const sigHex = Array.from(new Uint8Array(signature))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');

          const response = await fetch(wh.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Autopilot-Signature': sigHex,
              'X-Autopilot-Event': eventType,
              'X-Autopilot-Event-Id': eventId,
            },
            body,
          });

          if (!response.ok) {
            this.logger.warn(`Webhook delivery failed: ${wh.url} returned ${response.status}`);
          }
        } catch (err) {
          this.logger.error(`Webhook delivery error: ${wh.url}`, {
            error: String(err),
          });
        }
      }
    } catch (err) {
      this.logger.error('Failed to dispatch webhook events', {
        error: String(err),
      });
    }
  }
}
