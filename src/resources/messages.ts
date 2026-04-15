import type { StorageAdapter } from '../storage/adapter.js';
import type { EmailTransport } from '../transport/adapter.js';
import type { AutopilotServerConfig, Logger } from '../config.js';
import type {
  Message,
  SendMessageParams,
  ReplyMessageParams,
  ForwardMessageParams,
  SendMessageResponse,
  UpdateMessageParams,
  ListMessagesParams,
  ListMessagesResponse,
  Addresses,
} from '../types/message.js';
import type { AttachmentResponse } from '../types/attachment.js';
import { generateId } from '../util/id.js';
import { createPreview } from '../email/parser.js';
import { resolveOrCreateThread } from '../email/threading.js';

function toArray(addr?: Addresses): string[] {
  if (!addr) return [];
  return Array.isArray(addr) ? addr : [addr];
}

export class InboxMessagesResource {
  constructor(
    private storage: StorageAdapter,
    private transport: EmailTransport | null,
    private config: AutopilotServerConfig,
    private logger: Logger,
    private dispatchEvent?: (eventType: string, inboxId: string, podId: string, payload: Record<string, unknown>) => Promise<void>,
  ) {}

  async list(inboxId: string, params: ListMessagesParams = {}): Promise<ListMessagesResponse> {
    return this.storage.listMessages(inboxId, params);
  }

  async get(inboxId: string, messageId: string): Promise<Message> {
    const msg = await this.storage.getMessage(inboxId, messageId);
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    return msg;
  }

  async getAttachment(inboxId: string, messageId: string, attachmentId: string): Promise<AttachmentResponse> {
    const fs = this.config.fileStorage;
    if (fs) {
      const urlResult = fs.getAttachmentUrl ? await fs.getAttachmentUrl(messageId, attachmentId) : null;
      const data = await fs.getAttachment(messageId, attachmentId);
      if (!data) throw new Error(`Attachment not found: ${attachmentId}`);
      return {
        attachmentId,
        filename: data.filename,
        size: data.content.length,
        contentType: data.contentType,
        downloadUrl: urlResult?.url ?? `data:${data.contentType ?? 'application/octet-stream'};base64,${data.content.toString('base64')}`,
        expiresAt: urlResult?.expiresAt ?? new Date(Date.now() + 3600_000),
      };
    }
    const resp = await this.storage.getAttachmentDownloadUrl(messageId, attachmentId);
    if (!resp) throw new Error(`Attachment not found: ${attachmentId}`);
    return resp;
  }

  async getRaw(inboxId: string, messageId: string): Promise<Buffer> {
    const fs = this.config.fileStorage;
    if (fs) {
      const raw = await fs.getRawMessage(messageId);
      if (!raw) throw new Error(`Raw message not found: ${messageId}`);
      return raw;
    }
    const raw = await this.storage.getRawMessage(messageId);
    if (!raw) throw new Error(`Raw message not found: ${messageId}`);
    return raw;
  }

  async update(inboxId: string, messageId: string, params: UpdateMessageParams): Promise<Message> {
    return this.storage.updateMessage(inboxId, messageId, params);
  }

  async delete(inboxId: string, messageId: string): Promise<void> {
    return this.storage.deleteMessage(inboxId, messageId);
  }

  async send(inboxId: string, params: SendMessageParams): Promise<SendMessageResponse> {
    if (!this.transport) {
      throw new Error('No email transport configured. Cannot send messages.');
    }

    const inbox = await this.storage.getInbox(inboxId);
    if (!inbox) throw new Error(`Inbox not found: ${inboxId}`);

    const to = toArray(params.to);
    const cc = toArray(params.cc);
    const bcc = toArray(params.bcc);
    const replyTo = toArray(params.replyTo);
    const messageId = generateId('message');
    const now = new Date();
    const preview = createPreview(params.text, params.html);

    // Resolve attachments
    const transportAttachments = (params.attachments ?? []).map((att) => ({
      filename: att.filename,
      content: att.content ? Buffer.from(att.content, 'base64') : Buffer.alloc(0),
      contentType: att.contentType,
      contentId: att.contentId,
      contentDisposition: att.contentDisposition,
    }));

    // Extract In-Reply-To and References from headers for thread resolution
    const inReplyTo = params.headers?.['In-Reply-To'];
    const references = params.headers?.['References']?.split(/\s+/).filter(Boolean);

    // Resolve or create thread
    const { threadId } = await resolveOrCreateThread(this.storage, {
      inboxId,
      subject: params.subject,
      from: inbox.email,
      to,
      inReplyTo,
      references,
      timestamp: now,
      preview,
      messageId,
      size: (params.text?.length ?? 0) + (params.html?.length ?? 0),
    });

    // Send via transport
    const _result = await this.transport.send({
      from: inbox.displayName ? `${inbox.displayName} <${inbox.email}>` : inbox.email,
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      replyTo: replyTo.length ? replyTo : undefined,
      subject: params.subject ?? '',
      text: params.text,
      html: params.html,
      headers: params.headers,
      attachments: transportAttachments.length ? transportAttachments : undefined,
    });

    // Store the message
    const message: Message = {
      inboxId,
      threadId,
      messageId,
      labels: [...(params.labels ?? []), 'SENT'],
      timestamp: now,
      from: inbox.email,
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      replyTo: replyTo.length ? replyTo : undefined,
      subject: params.subject,
      preview,
      text: params.text,
      html: params.html,
      attachments: (params.attachments ?? []).map((att) => ({
        attachmentId: generateId('attachment'),
        filename: att.filename,
        size: att.content ? Buffer.from(att.content, 'base64').length : 0,
        contentType: att.contentType,
        contentDisposition: att.contentDisposition,
        contentId: att.contentId,
      })),
      inReplyTo,
      references,
      headers: params.headers,
      size: (params.text?.length ?? 0) + (params.html?.length ?? 0),
      updatedAt: now,
      createdAt: now,
    };

    await this.storage.createMessage(message);
    await this.storage.updateThreadOnNewMessage(threadId, message);

    // Store attachments (delegate to fileStorage if configured)
    const fs = this.config.fileStorage;
    for (let i = 0; i < transportAttachments.length; i++) {
      const att = transportAttachments[i];
      const attMeta = message.attachments![i];
      if (fs) {
        await fs.putAttachment(messageId, attMeta.attachmentId, att.content, { filename: att.filename, contentType: att.contentType });
      } else {
        await this.storage.storeAttachment(messageId, {
          attachmentId: attMeta.attachmentId,
          filename: att.filename,
          contentType: att.contentType,
          content: att.content,
        });
      }
    }

    // Dispatch event
    if (this.dispatchEvent) {
      await this.dispatchEvent('message.sent', inboxId, inbox.podId, {
        messageId,
        threadId,
        timestamp: now.toISOString(),
      });
    }

    return { messageId, threadId, timestamp: now };
  }

  async reply(inboxId: string, messageId: string, params: ReplyMessageParams): Promise<SendMessageResponse> {
    const original = await this.get(inboxId, messageId);

    // Build reply-to addresses: reply to the sender, or override with params.to
    const to = params.to ? toArray(params.to) : toArray(original.from);

    return this.send(inboxId, {
      to,
      cc: params.cc,
      bcc: params.bcc,
      subject: original.subject?.startsWith('Re:') ? original.subject : `Re: ${original.subject ?? ''}`,
      text: params.text,
      html: params.html,
      replyTo: params.replyTo,
      labels: params.labels,
      attachments: params.attachments,
      headers: {
        ...params.headers,
        'In-Reply-To': original.messageId,
        References: [...(original.references ?? []), original.messageId].join(' '),
      },
    });
  }

  async replyAll(inboxId: string, messageId: string, params: ReplyMessageParams): Promise<SendMessageResponse> {
    const original = await this.get(inboxId, messageId);
    const inbox = await this.storage.getInbox(inboxId);
    if (!inbox) throw new Error(`Inbox not found: ${inboxId}`);

    // Reply-all: original sender + all original recipients minus self
    const allTo = new Set([...toArray(original.from), ...toArray(original.to)]);
    allTo.delete(inbox.email);
    const allCc = new Set(toArray(original.cc));
    allCc.delete(inbox.email);

    return this.send(inboxId, {
      to: Array.from(allTo),
      cc: allCc.size > 0 ? Array.from(allCc) : undefined,
      bcc: params.bcc,
      subject: original.subject?.startsWith('Re:') ? original.subject : `Re: ${original.subject ?? ''}`,
      text: params.text,
      html: params.html,
      replyTo: params.replyTo,
      labels: params.labels,
      attachments: params.attachments,
      headers: {
        ...params.headers,
        'In-Reply-To': original.messageId,
        References: [...(original.references ?? []), original.messageId].join(' '),
      },
    });
  }

  async forward(inboxId: string, messageId: string, params: ForwardMessageParams): Promise<SendMessageResponse> {
    const original = await this.get(inboxId, messageId);

    const fwdText = params.text
      ? `${params.text}\n\n---------- Forwarded message ----------\nFrom: ${original.from}\nSubject: ${original.subject ?? ''}\n\n${original.text ?? ''}`
      : `---------- Forwarded message ----------\nFrom: ${original.from}\nSubject: ${original.subject ?? ''}\n\n${original.text ?? ''}`;

    return this.send(inboxId, {
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: original.subject?.startsWith('Fwd:') ? original.subject : `Fwd: ${original.subject ?? ''}`,
      text: fwdText,
      html: params.html,
      replyTo: params.replyTo,
      labels: params.labels,
      attachments: params.attachments,
      headers: params.headers,
    });
  }
}
