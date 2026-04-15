import type { StorageAdapter } from './adapter.js';
import type { Inbox, CreateInboxParams, UpdateInboxParams, ListInboxesParams, ListInboxesResponse } from '../types/inbox.js';
import type { Message, ListMessagesParams, ListMessagesResponse, UpdateMessageParams } from '../types/message.js';
import type { ThreadItem, Thread, ListThreadsParams, ListThreadsResponse, UpdateThreadParams } from '../types/thread.js';
import type { Draft, CreateDraftParams, UpdateDraftParams, ListDraftsParams, ListDraftsResponse } from '../types/draft.js';
import type { Webhook, CreateWebhookParams, UpdateWebhookParams, ListWebhooksParams, ListWebhooksResponse } from '../types/webhook.js';
import type { Domain, CreateDomainParams, UpdateDomainParams, ListDomainsParams, ListDomainsResponse, VerificationRecord } from '../types/domain.js';
import type { AttachmentData, AttachmentResponse } from '../types/attachment.js';
import type { EventTypeValue } from '../types/event.js';

export interface MongoStorageConfig {
  uri: string;
  database?: string;
}

export class MongoStorageAdapter implements StorageAdapter {
  private client: any;
  private db: any;

  constructor(private config: MongoStorageConfig) {}

  async initialize(): Promise<void> {
    const { MongoClient } = await import('mongodb');
    this.client = new MongoClient(this.config.uri);
    await this.client.connect();
    this.db = this.client.db(this.config.database ?? 'autopilot');

    // Create indexes
    await this.db.collection('inboxes').createIndex({ email: 1 }, { unique: true });
    await this.db.collection('messages').createIndex({ inboxId: 1 });
    await this.db.collection('messages').createIndex({ threadId: 1 });
    await this.db.collection('messages').createIndex({ inReplyTo: 1 });
    await this.db.collection('threads').createIndex({ inboxId: 1 });
    await this.db.collection('drafts').createIndex({ inboxId: 1 });
    await this.db.collection('domains').createIndex({ domain: 1 }, { unique: true });
  }

  async close(): Promise<void> {
    if (this.client) await this.client.close();
  }

  private col(name: string) {
    return this.db.collection(name);
  }

  // ── Inbox ──

  async createInbox(params: CreateInboxParams & { inboxId: string; email: string; podId: string }): Promise<Inbox> {
    const now = new Date();
    const doc = { ...params, email: params.email.toLowerCase(), updatedAt: now, createdAt: now };
    await this.col('inboxes').insertOne(doc);
    return { podId: params.podId, inboxId: params.inboxId, email: params.email, displayName: params.displayName, clientId: params.clientId, updatedAt: now, createdAt: now };
  }

  async getInbox(inboxId: string): Promise<Inbox | null> {
    return this.col('inboxes').findOne({ inboxId }) as Promise<Inbox | null>;
  }

  async getInboxByEmail(email: string): Promise<Inbox | null> {
    return this.col('inboxes').findOne({ email: email.toLowerCase() }) as Promise<Inbox | null>;
  }

  async listInboxes(params: ListInboxesParams): Promise<ListInboxesResponse> {
    const limit = params.limit ?? 25;
    const items = await this.col('inboxes').find().sort({ createdAt: -1 }).limit(limit).toArray();
    return { count: items.length, limit, inboxes: items as Inbox[] };
  }

  async updateInbox(inboxId: string, params: UpdateInboxParams): Promise<Inbox> {
    const result = await this.col('inboxes').findOneAndUpdate({ inboxId }, { $set: { displayName: params.displayName, updatedAt: new Date() } }, { returnDocument: 'after' });
    if (!result) throw new Error(`Inbox not found: ${inboxId}`);
    return result as unknown as Inbox;
  }

  async deleteInbox(inboxId: string): Promise<void> {
    await this.col('inboxes').deleteOne({ inboxId });
  }

  // ── Message ──

  async createMessage(message: Message): Promise<Message> {
    await this.col('messages').insertOne({ ...message });
    return message;
  }

  async getMessage(inboxId: string, messageId: string): Promise<Message | null> {
    return this.col('messages').findOne({ messageId, inboxId }) as Promise<Message | null>;
  }

  async listMessages(inboxId: string, params: ListMessagesParams): Promise<ListMessagesResponse> {
    const limit = params.limit ?? 25;
    const filter: Record<string, unknown> = { inboxId };
    if (params.before) filter.timestamp = { ...((filter.timestamp as any) ?? {}), $lt: params.before };
    if (params.after) filter.timestamp = { ...((filter.timestamp as any) ?? {}), $gt: params.after };
    if (!params.includeSpam) filter.labels = { $nin: ['SPAM'] };
    if (!params.includeTrash) filter.labels = { ...((filter.labels as any) ?? {}), $nin: [...((filter.labels as any)?.$nin ?? []), 'TRASH'] };

    const sort = params.ascending ? 1 : -1;
    const items = await this.col('messages').find(filter).sort({ timestamp: sort }).limit(limit).toArray();
    return { count: items.length, limit, messages: items as unknown as Message[] };
  }

  async updateMessage(inboxId: string, messageId: string, params: UpdateMessageParams): Promise<Message> {
    const update: Record<string, unknown> = { $set: { updatedAt: new Date() } };
    if (params.addLabels?.length) update.$addToSet = { labels: { $each: params.addLabels } };
    if (params.removeLabels?.length) update.$pull = { labels: { $in: params.removeLabels } };

    const result = await this.col('messages').findOneAndUpdate({ messageId, inboxId }, update, { returnDocument: 'after' });
    if (!result) throw new Error(`Message not found: ${messageId}`);
    return result as unknown as Message;
  }

  async deleteMessage(inboxId: string, messageId: string): Promise<void> {
    await this.col('messages').deleteOne({ messageId, inboxId });
  }

  async storeRawMessage(messageId: string, raw: Buffer): Promise<void> {
    await this.col('rawMessages').updateOne({ messageId }, { $set: { messageId, raw } }, { upsert: true });
  }

  async getRawMessage(messageId: string): Promise<Buffer | null> {
    const doc = await this.col('rawMessages').findOne({ messageId });
    return doc?.raw?.buffer ? Buffer.from(doc.raw.buffer) : null;
  }

  async resolveThread(inboxId: string, inReplyTo?: string, references?: string[]): Promise<string | null> {
    if (inReplyTo) {
      const msg = await this.col('messages').findOne({ messageId: inReplyTo, inboxId });
      if (msg) return msg.threadId;
    }
    if (references?.length) {
      const msg = await this.col('messages').findOne({ messageId: { $in: references }, inboxId });
      if (msg) return msg.threadId;
    }
    return null;
  }

  // ── Thread ──

  async createThread(thread: ThreadItem): Promise<ThreadItem> {
    await this.col('threads').insertOne({ ...thread });
    return thread;
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const item = await this.col('threads').findOne({ threadId });
    if (!item) return null;
    const messages = await this.col('messages').find({ threadId }).sort({ timestamp: 1 }).toArray();
    return { ...item, messages } as unknown as Thread;
  }

  async getThreadByInbox(inboxId: string, threadId: string): Promise<Thread | null> {
    const thread = await this.getThread(threadId);
    if (thread && thread.inboxId === inboxId) return thread;
    return null;
  }

  async listThreads(params: ListThreadsParams & { inboxId?: string }): Promise<ListThreadsResponse> {
    const limit = params.limit ?? 25;
    const filter: Record<string, unknown> = {};
    if (params.inboxId) filter.inboxId = params.inboxId;
    if (params.before) filter.timestamp = { $lt: params.before };
    if (params.after) filter.timestamp = { ...((filter.timestamp as any) ?? {}), $gt: params.after };

    const sort = params.ascending ? 1 : -1;
    const items = await this.col('threads').find(filter).sort({ timestamp: sort }).limit(limit).toArray();
    return { count: items.length, limit, threads: items as unknown as ThreadItem[] };
  }

  async updateThread(threadId: string, params: UpdateThreadParams): Promise<ThreadItem> {
    const update: Record<string, unknown> = { $set: { updatedAt: new Date() } };
    if (params.addLabels?.length) update.$addToSet = { labels: { $each: params.addLabels } };
    if (params.removeLabels?.length) update.$pull = { labels: { $in: params.removeLabels } };

    const result = await this.col('threads').findOneAndUpdate({ threadId }, update, { returnDocument: 'after' });
    if (!result) throw new Error(`Thread not found: ${threadId}`);
    return result as unknown as ThreadItem;
  }

  async updateThreadOnNewMessage(threadId: string, message: Message): Promise<void> {
    const from = Array.isArray(message.from) ? message.from : [message.from];
    const to = Array.isArray(message.to) ? message.to : [message.to];

    await this.col('threads').updateOne(
      { threadId },
      {
        $addToSet: { senders: { $each: from }, recipients: { $each: to } },
        $set: { lastMessageId: message.messageId, timestamp: message.timestamp, preview: message.preview, updatedAt: new Date() },
        $inc: { messageCount: 1, size: message.size },
      },
    );
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.col('messages').deleteMany({ threadId });
    await this.col('threads').deleteOne({ threadId });
  }

  // ── Draft ──

  async createDraft(inboxId: string, params: CreateDraftParams & { draftId: string }): Promise<Draft> {
    const now = new Date();
    const doc: Draft = {
      inboxId,
      draftId: params.draftId,
      clientId: params.clientId,
      labels: params.labels ?? [],
      replyTo: params.replyTo,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: [],
      inReplyTo: params.inReplyTo,
      sendAt: params.sendAt,
      updatedAt: now,
      createdAt: now,
    };
    await this.col('drafts').insertOne({ ...doc });
    return doc;
  }

  async getDraft(inboxId: string, draftId: string): Promise<Draft | null> {
    return this.col('drafts').findOne({ draftId, inboxId }) as Promise<Draft | null>;
  }

  async getDraftGlobal(draftId: string): Promise<Draft | null> {
    return this.col('drafts').findOne({ draftId }) as Promise<Draft | null>;
  }

  async listDrafts(inboxId: string, params: ListDraftsParams): Promise<ListDraftsResponse> {
    const limit = params.limit ?? 25;
    const items = await this.col('drafts').find({ inboxId }).sort({ createdAt: -1 }).limit(limit).toArray();
    return { count: items.length, limit, drafts: items as unknown as Draft[] };
  }

  async listDraftsGlobal(params: ListDraftsParams): Promise<ListDraftsResponse> {
    const limit = params.limit ?? 25;
    const items = await this.col('drafts').find().sort({ createdAt: -1 }).limit(limit).toArray();
    return { count: items.length, limit, drafts: items as unknown as Draft[] };
  }

  async updateDraft(inboxId: string, draftId: string, params: UpdateDraftParams): Promise<Draft> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (params.to !== undefined) $set.to = params.to;
    if (params.cc !== undefined) $set.cc = params.cc;
    if (params.bcc !== undefined) $set.bcc = params.bcc;
    if (params.subject !== undefined) $set.subject = params.subject;
    if (params.text !== undefined) $set.text = params.text;
    if (params.html !== undefined) $set.html = params.html;
    if (params.replyTo !== undefined) $set.replyTo = params.replyTo;
    if (params.sendAt !== undefined) $set.sendAt = params.sendAt;

    const result = await this.col('drafts').findOneAndUpdate({ draftId, inboxId }, { $set }, { returnDocument: 'after' });
    if (!result) throw new Error(`Draft not found: ${draftId}`);
    return result as unknown as Draft;
  }

  async deleteDraft(inboxId: string, draftId: string): Promise<void> {
    await this.col('drafts').deleteOne({ draftId, inboxId });
  }

  // ── Webhook ──

  async createWebhook(params: CreateWebhookParams & { webhookId: string; secret: string }): Promise<Webhook> {
    const now = new Date();
    const doc: Webhook = {
      webhookId: params.webhookId,
      url: params.url,
      eventTypes: params.eventTypes,
      podIds: params.podIds,
      inboxIds: params.inboxIds,
      secret: params.secret,
      enabled: true,
      clientId: params.clientId,
      updatedAt: now,
      createdAt: now,
    };
    await this.col('webhooks').insertOne({ ...doc });
    return doc;
  }

  async getWebhook(webhookId: string): Promise<Webhook | null> {
    return this.col('webhooks').findOne({ webhookId }) as Promise<Webhook | null>;
  }

  async listWebhooks(params: ListWebhooksParams): Promise<ListWebhooksResponse> {
    const limit = params.limit ?? 25;
    const items = await this.col('webhooks').find().sort({ createdAt: -1 }).limit(limit).toArray();
    return { count: items.length, limit, webhooks: items as unknown as Webhook[] };
  }

  async updateWebhook(webhookId: string, params: UpdateWebhookParams): Promise<Webhook> {
    const update: Record<string, unknown> = { $set: { updatedAt: new Date() } };
    if (params.addInboxIds?.length) update.$addToSet = { ...((update.$addToSet as any) ?? {}), inboxIds: { $each: params.addInboxIds } };
    if (params.removeInboxIds?.length) update.$pull = { ...((update.$pull as any) ?? {}), inboxIds: { $in: params.removeInboxIds } };
    if (params.addPodIds?.length) {
      update.$addToSet = { ...((update.$addToSet as any) ?? {}), podIds: { $each: params.addPodIds } };
    }
    if (params.removePodIds?.length) {
      update.$pull = { ...((update.$pull as any) ?? {}), podIds: { $in: params.removePodIds } };
    }
    if (params.enabled !== undefined) (update.$set as any).enabled = params.enabled;

    const result = await this.col('webhooks').findOneAndUpdate({ webhookId }, update, { returnDocument: 'after' });
    if (!result) throw new Error(`Webhook not found: ${webhookId}`);
    return result as unknown as Webhook;
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.col('webhooks').deleteOne({ webhookId });
  }

  async getWebhooksForEvent(eventType: EventTypeValue, inboxId: string, _podId: string): Promise<Webhook[]> {
    const items = await this.col('webhooks')
      .find({
        enabled: true,
        eventTypes: eventType,
        $or: [{ inboxIds: { $exists: false } }, { inboxIds: { $size: 0 } }, { inboxIds: inboxId }],
      })
      .toArray();
    return items as unknown as Webhook[];
  }

  // ── Domain ──

  async createDomain(params: CreateDomainParams & { domainId: string; podId?: string; records: VerificationRecord[] }): Promise<Domain> {
    const now = new Date();
    const doc: Domain = {
      domainId: params.domainId,
      podId: params.podId,
      domain: params.domain,
      status: 'NOT_STARTED',
      feedbackEnabled: params.feedbackEnabled ?? false,
      records: params.records,
      updatedAt: now,
      createdAt: now,
    };
    await this.col('domains').insertOne({ ...doc });
    return doc;
  }

  async getDomain(domainId: string): Promise<Domain | null> {
    return this.col('domains').findOne({ domainId }) as Promise<Domain | null>;
  }

  async getDomainByName(domain: string): Promise<Domain | null> {
    return this.col('domains').findOne({ domain: domain.toLowerCase() }) as Promise<Domain | null>;
  }

  async listDomains(params: ListDomainsParams): Promise<ListDomainsResponse> {
    const limit = params.limit ?? 25;
    const items = await this.col('domains').find().sort({ createdAt: -1 }).limit(limit).toArray();
    return { count: items.length, limit, domains: items as unknown as Domain[] };
  }

  async updateDomain(domainId: string, params: UpdateDomainParams): Promise<Domain> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (params.feedbackEnabled !== undefined) $set.feedbackEnabled = params.feedbackEnabled;
    const result = await this.col('domains').findOneAndUpdate({ domainId }, { $set }, { returnDocument: 'after' });
    if (!result) throw new Error(`Domain not found: ${domainId}`);
    return result as unknown as Domain;
  }

  async deleteDomain(domainId: string): Promise<void> {
    await this.col('domains').deleteOne({ domainId });
  }

  // ── Attachment ──

  async storeAttachment(messageId: string, attachment: { attachmentId: string; filename?: string; contentType?: string; content: Buffer }): Promise<void> {
    await this.col('attachments').updateOne({ messageId, attachmentId: attachment.attachmentId }, { $set: { messageId, ...attachment } }, { upsert: true });
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData | null> {
    const doc = await this.col('attachments').findOne({ messageId, attachmentId });
    if (!doc) return null;
    return { content: Buffer.from(doc.content.buffer), contentType: doc.contentType, filename: doc.filename };
  }

  async getAttachmentDownloadUrl(messageId: string, attachmentId: string): Promise<AttachmentResponse | null> {
    const data = await this.getAttachment(messageId, attachmentId);
    if (!data) return null;
    const b64 = data.content.toString('base64');
    const ct = data.contentType ?? 'application/octet-stream';
    return {
      attachmentId,
      filename: data.filename,
      size: data.content.length,
      contentType: ct,
      downloadUrl: `data:${ct};base64,${b64}`,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }
}
