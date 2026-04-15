import type { StorageAdapter } from './adapter.js';
import type { Inbox, CreateInboxParams, UpdateInboxParams, ListInboxesParams, ListInboxesResponse } from '../types/inbox.js';
import type { Message, ListMessagesParams, ListMessagesResponse, UpdateMessageParams } from '../types/message.js';
import type { ThreadItem, Thread, ListThreadsParams, ListThreadsResponse, UpdateThreadParams } from '../types/thread.js';
import type { Draft, CreateDraftParams, UpdateDraftParams, ListDraftsParams, ListDraftsResponse } from '../types/draft.js';
import type { Webhook, CreateWebhookParams, UpdateWebhookParams, ListWebhooksParams, ListWebhooksResponse } from '../types/webhook.js';
import type { Domain, CreateDomainParams, UpdateDomainParams, ListDomainsParams, ListDomainsResponse, VerificationRecord } from '../types/domain.js';
import type { AttachmentData, AttachmentResponse } from '../types/attachment.js';
import type { EventTypeValue } from '../types/event.js';
import { applyPagination } from '../util/pagination.js';

export class InMemoryStorageAdapter implements StorageAdapter {
  private inboxes = new Map<string, Inbox>();
  private inboxesByEmail = new Map<string, string>();
  private messages = new Map<string, Message>();
  private messagesByInbox = new Map<string, Set<string>>();
  private threads = new Map<string, ThreadItem>();
  private threadMessages = new Map<string, string[]>();
  private threadsByInbox = new Map<string, Set<string>>();
  private drafts = new Map<string, Draft>();
  private draftsByInbox = new Map<string, Set<string>>();
  private webhooks = new Map<string, Webhook>();
  private domains = new Map<string, Domain>();
  private domainsByName = new Map<string, string>();
  private rawMessages = new Map<string, Buffer>();
  private attachments = new Map<string, Map<string, { content: Buffer; contentType?: string; filename?: string }>>();
  private messageIdToThread = new Map<string, string>(); // In-Reply-To/References → threadId

  async initialize(): Promise<void> {}
  async close(): Promise<void> {}

  // ── Inbox ──

  async createInbox(params: CreateInboxParams & { inboxId: string; email: string; podId: string }): Promise<Inbox> {
    const now = new Date();
    const inbox: Inbox = {
      podId: params.podId,
      inboxId: params.inboxId,
      email: params.email,
      displayName: params.displayName,
      clientId: params.clientId,
      updatedAt: now,
      createdAt: now,
    };
    this.inboxes.set(inbox.inboxId, inbox);
    this.inboxesByEmail.set(inbox.email.toLowerCase(), inbox.inboxId);
    return inbox;
  }

  async getInbox(inboxId: string): Promise<Inbox | null> {
    return this.inboxes.get(inboxId) ?? null;
  }

  async getInboxByEmail(email: string): Promise<Inbox | null> {
    const id = this.inboxesByEmail.get(email.toLowerCase());
    return id ? (this.inboxes.get(id) ?? null) : null;
  }

  async listInboxes(params: ListInboxesParams): Promise<ListInboxesResponse> {
    const all = Array.from(this.inboxes.values());
    const { items, nextPageToken } = applyPagination(all, params, (i) => i.inboxId);
    return { count: all.length, limit: params.limit, nextPageToken, inboxes: items };
  }

  async updateInbox(inboxId: string, params: UpdateInboxParams): Promise<Inbox> {
    const inbox = this.inboxes.get(inboxId);
    if (!inbox) throw new Error(`Inbox not found: ${inboxId}`);
    inbox.displayName = params.displayName;
    inbox.updatedAt = new Date();
    return inbox;
  }

  async deleteInbox(inboxId: string): Promise<void> {
    const inbox = this.inboxes.get(inboxId);
    if (inbox) {
      this.inboxesByEmail.delete(inbox.email.toLowerCase());
      this.inboxes.delete(inboxId);
    }
  }

  // ── Message ──

  async createMessage(message: Message): Promise<Message> {
    this.messages.set(message.messageId, message);

    if (!this.messagesByInbox.has(message.inboxId)) {
      this.messagesByInbox.set(message.inboxId, new Set());
    }
    this.messagesByInbox.get(message.inboxId)!.add(message.messageId);

    if (!this.threadMessages.has(message.threadId)) {
      this.threadMessages.set(message.threadId, []);
    }
    this.threadMessages.get(message.threadId)!.push(message.messageId);

    // Index message ID headers for thread resolution
    if (message.messageId) {
      this.messageIdToThread.set(message.messageId, message.threadId);
    }

    return message;
  }

  async getMessage(inboxId: string, messageId: string): Promise<Message | null> {
    const msg = this.messages.get(messageId);
    if (msg && msg.inboxId === inboxId) return msg;
    return null;
  }

  async listMessages(inboxId: string, params: ListMessagesParams): Promise<ListMessagesResponse> {
    const ids = this.messagesByInbox.get(inboxId) ?? new Set();
    let items = Array.from(ids)
      .map((id) => this.messages.get(id)!)
      .filter(Boolean);

    if (params.labels?.length) {
      items = items.filter((m) => params.labels!.some((l) => m.labels.includes(l)));
    }
    if (params.before) {
      items = items.filter((m) => m.timestamp < params.before!);
    }
    if (params.after) {
      items = items.filter((m) => m.timestamp > params.after!);
    }
    if (!params.includeSpam) {
      items = items.filter((m) => !m.labels.includes('SPAM'));
    }
    if (!params.includeTrash) {
      items = items.filter((m) => !m.labels.includes('TRASH'));
    }

    const { items: page, nextPageToken } = applyPagination(items, params, (m) => m.messageId);
    return {
      count: items.length,
      limit: params.limit,
      nextPageToken,
      messages: page,
    };
  }

  async updateMessage(inboxId: string, messageId: string, params: UpdateMessageParams): Promise<Message> {
    const msg = this.messages.get(messageId);
    if (!msg || msg.inboxId !== inboxId) throw new Error(`Message not found: ${messageId}`);
    if (params.addLabels) {
      for (const l of params.addLabels) {
        if (!msg.labels.includes(l)) msg.labels.push(l);
      }
    }
    if (params.removeLabels) {
      msg.labels = msg.labels.filter((l) => !params.removeLabels!.includes(l));
    }
    msg.updatedAt = new Date();
    return msg;
  }

  async deleteMessage(inboxId: string, messageId: string): Promise<void> {
    const msg = this.messages.get(messageId);
    if (msg && msg.inboxId === inboxId) {
      this.messages.delete(messageId);
      this.messagesByInbox.get(inboxId)?.delete(messageId);
    }
  }

  async storeRawMessage(messageId: string, raw: Buffer): Promise<void> {
    this.rawMessages.set(messageId, raw);
  }

  async getRawMessage(messageId: string): Promise<Buffer | null> {
    return this.rawMessages.get(messageId) ?? null;
  }

  async resolveThread(inboxId: string, inReplyTo?: string, references?: string[], _subject?: string): Promise<string | null> {
    const normalize = (id: string) => id.replace(/^<|>$/g, '');
    if (inReplyTo) {
      const normalized = normalize(inReplyTo);
      const threadId = this.messageIdToThread.get(normalized) ?? this.messageIdToThread.get(inReplyTo);
      if (threadId) return threadId;
    }
    if (references) {
      for (const ref of references) {
        const normalized = normalize(ref);
        const threadId = this.messageIdToThread.get(normalized) ?? this.messageIdToThread.get(ref);
        if (threadId) return threadId;
      }
    }
    return null;
  }

  // ── Thread ──

  async createThread(thread: ThreadItem): Promise<ThreadItem> {
    this.threads.set(thread.threadId, thread);
    if (!this.threadsByInbox.has(thread.inboxId)) {
      this.threadsByInbox.set(thread.inboxId, new Set());
    }
    this.threadsByInbox.get(thread.inboxId)!.add(thread.threadId);
    return thread;
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const item = this.threads.get(threadId);
    if (!item) return null;
    const msgIds = this.threadMessages.get(threadId) ?? [];
    const messages = msgIds
      .map((id) => this.messages.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return { ...item, messages };
  }

  async getThreadByInbox(inboxId: string, threadId: string): Promise<Thread | null> {
    const thread = await this.getThread(threadId);
    if (thread && thread.inboxId === inboxId) return thread;
    return null;
  }

  async listThreads(params: ListThreadsParams & { inboxId?: string }): Promise<ListThreadsResponse> {
    let items: ThreadItem[];
    if (params.inboxId) {
      const ids = this.threadsByInbox.get(params.inboxId) ?? new Set();
      items = Array.from(ids)
        .map((id) => this.threads.get(id)!)
        .filter(Boolean);
    } else {
      items = Array.from(this.threads.values());
    }

    if (params.labels?.length) {
      items = items.filter((t) => params.labels!.some((l) => t.labels.includes(l)));
    }
    if (params.before) {
      items = items.filter((t) => t.timestamp < params.before!);
    }
    if (params.after) {
      items = items.filter((t) => t.timestamp > params.after!);
    }

    const { items: page, nextPageToken } = applyPagination(items, params, (t) => t.threadId);
    return {
      count: items.length,
      limit: params.limit,
      nextPageToken,
      threads: page,
    };
  }

  async updateThread(threadId: string, params: UpdateThreadParams): Promise<ThreadItem> {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    if (params.addLabels) {
      for (const l of params.addLabels) {
        if (!thread.labels.includes(l)) thread.labels.push(l);
      }
    }
    if (params.removeLabels) {
      thread.labels = thread.labels.filter((l) => !params.removeLabels!.includes(l));
    }
    thread.updatedAt = new Date();
    return thread;
  }

  async updateThreadOnNewMessage(threadId: string, message: Message): Promise<void> {
    const thread = this.threads.get(threadId);
    if (!thread) return;

    const from = Array.isArray(message.from) ? message.from : [message.from];
    const to = Array.isArray(message.to) ? message.to : [message.to];

    for (const s of from) {
      if (!thread.senders.includes(s)) thread.senders.push(s);
    }
    for (const r of to) {
      if (!thread.recipients.includes(r)) thread.recipients.push(r);
    }

    thread.lastMessageId = message.messageId;
    thread.messageCount += 1;
    thread.size += message.size;
    thread.timestamp = message.timestamp;
    thread.preview = message.preview;
    thread.updatedAt = new Date();

    if (message.attachments?.length) {
      thread.attachments = [...(thread.attachments ?? []), ...message.attachments];
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    const thread = this.threads.get(threadId);
    if (thread) {
      this.threadsByInbox.get(thread.inboxId)?.delete(threadId);
      this.threads.delete(threadId);
      // Clean up messages in thread
      const msgIds = this.threadMessages.get(threadId) ?? [];
      for (const id of msgIds) {
        this.messages.delete(id);
        this.messagesByInbox.get(thread.inboxId)?.delete(id);
      }
      this.threadMessages.delete(threadId);
    }
  }

  // ── Draft ──

  async createDraft(inboxId: string, params: CreateDraftParams & { draftId: string }): Promise<Draft> {
    const now = new Date();
    const draft: Draft = {
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
    this.drafts.set(draft.draftId, draft);
    if (!this.draftsByInbox.has(inboxId)) {
      this.draftsByInbox.set(inboxId, new Set());
    }
    this.draftsByInbox.get(inboxId)!.add(draft.draftId);
    return draft;
  }

  async getDraft(inboxId: string, draftId: string): Promise<Draft | null> {
    const d = this.drafts.get(draftId);
    if (d && d.inboxId === inboxId) return d;
    return null;
  }

  async getDraftGlobal(draftId: string): Promise<Draft | null> {
    return this.drafts.get(draftId) ?? null;
  }

  async listDrafts(inboxId: string, params: ListDraftsParams): Promise<ListDraftsResponse> {
    const ids = this.draftsByInbox.get(inboxId) ?? new Set();
    const all = Array.from(ids)
      .map((id) => this.drafts.get(id)!)
      .filter(Boolean);
    const { items, nextPageToken } = applyPagination(all, params, (d) => d.draftId);
    return { count: all.length, limit: params.limit, nextPageToken, drafts: items };
  }

  async listDraftsGlobal(params: ListDraftsParams): Promise<ListDraftsResponse> {
    const all = Array.from(this.drafts.values());
    const { items, nextPageToken } = applyPagination(all, params, (d) => d.draftId);
    return { count: all.length, limit: params.limit, nextPageToken, drafts: items };
  }

  async updateDraft(inboxId: string, draftId: string, params: UpdateDraftParams): Promise<Draft> {
    const draft = this.drafts.get(draftId);
    if (!draft || draft.inboxId !== inboxId) throw new Error(`Draft not found: ${draftId}`);
    if (params.to !== undefined) draft.to = params.to;
    if (params.cc !== undefined) draft.cc = params.cc;
    if (params.bcc !== undefined) draft.bcc = params.bcc;
    if (params.subject !== undefined) draft.subject = params.subject;
    if (params.text !== undefined) draft.text = params.text;
    if (params.html !== undefined) draft.html = params.html;
    if (params.replyTo !== undefined) draft.replyTo = params.replyTo;
    if (params.sendAt !== undefined) draft.sendAt = params.sendAt;
    draft.updatedAt = new Date();
    return draft;
  }

  async deleteDraft(inboxId: string, draftId: string): Promise<void> {
    const draft = this.drafts.get(draftId);
    if (draft && draft.inboxId === inboxId) {
      this.drafts.delete(draftId);
      this.draftsByInbox.get(inboxId)?.delete(draftId);
    }
  }

  // ── Webhook ──

  async createWebhook(params: CreateWebhookParams & { webhookId: string; secret: string }): Promise<Webhook> {
    const now = new Date();
    const webhook: Webhook = {
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
    this.webhooks.set(webhook.webhookId, webhook);
    return webhook;
  }

  async getWebhook(webhookId: string): Promise<Webhook | null> {
    return this.webhooks.get(webhookId) ?? null;
  }

  async listWebhooks(params: ListWebhooksParams): Promise<ListWebhooksResponse> {
    const all = Array.from(this.webhooks.values());
    const { items, nextPageToken } = applyPagination(all, params, (w) => w.webhookId);
    return {
      count: all.length,
      limit: params.limit,
      nextPageToken,
      webhooks: items,
    };
  }

  async updateWebhook(webhookId: string, params: UpdateWebhookParams): Promise<Webhook> {
    const wh = this.webhooks.get(webhookId);
    if (!wh) throw new Error(`Webhook not found: ${webhookId}`);
    if (params.addInboxIds) {
      wh.inboxIds = [...(wh.inboxIds ?? []), ...params.addInboxIds];
    }
    if (params.removeInboxIds) {
      wh.inboxIds = (wh.inboxIds ?? []).filter((id) => !params.removeInboxIds!.includes(id));
    }
    if (params.addPodIds) {
      wh.podIds = [...(wh.podIds ?? []), ...params.addPodIds];
    }
    if (params.removePodIds) {
      wh.podIds = (wh.podIds ?? []).filter((id) => !params.removePodIds!.includes(id));
    }
    if (params.enabled !== undefined) wh.enabled = params.enabled;
    wh.updatedAt = new Date();
    return wh;
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    this.webhooks.delete(webhookId);
  }

  async getWebhooksForEvent(eventType: EventTypeValue, inboxId: string, podId: string): Promise<Webhook[]> {
    return Array.from(this.webhooks.values()).filter((wh) => {
      if (!wh.enabled) return false;
      if (!wh.eventTypes.includes(eventType)) return false;
      if (wh.inboxIds?.length && !wh.inboxIds.includes(inboxId)) return false;
      if (wh.podIds?.length && !wh.podIds.includes(podId)) return false;
      return true;
    });
  }

  // ── Domain ──

  async createDomain(
    params: CreateDomainParams & {
      domainId: string;
      podId?: string;
      records: VerificationRecord[];
    },
  ): Promise<Domain> {
    const now = new Date();
    const domain: Domain = {
      podId: params.podId,
      domainId: params.domainId,
      domain: params.domain,
      status: 'NOT_STARTED',
      feedbackEnabled: params.feedbackEnabled ?? false,
      records: params.records,
      updatedAt: now,
      createdAt: now,
    };
    this.domains.set(domain.domainId, domain);
    this.domainsByName.set(domain.domain.toLowerCase(), domain.domainId);
    return domain;
  }

  async getDomain(domainId: string): Promise<Domain | null> {
    return this.domains.get(domainId) ?? null;
  }

  async getDomainByName(domain: string): Promise<Domain | null> {
    const id = this.domainsByName.get(domain.toLowerCase());
    return id ? (this.domains.get(id) ?? null) : null;
  }

  async listDomains(params: ListDomainsParams): Promise<ListDomainsResponse> {
    const all = Array.from(this.domains.values());
    const { items, nextPageToken } = applyPagination(all, params, (d) => d.domainId);
    return {
      count: all.length,
      limit: params.limit,
      nextPageToken,
      domains: items,
    };
  }

  async updateDomain(domainId: string, params: UpdateDomainParams): Promise<Domain> {
    const domain = this.domains.get(domainId);
    if (!domain) throw new Error(`Domain not found: ${domainId}`);
    if (params.feedbackEnabled !== undefined) {
      domain.feedbackEnabled = params.feedbackEnabled;
    }
    domain.updatedAt = new Date();
    return domain;
  }

  async deleteDomain(domainId: string): Promise<void> {
    const domain = this.domains.get(domainId);
    if (domain) {
      this.domainsByName.delete(domain.domain.toLowerCase());
      this.domains.delete(domainId);
    }
  }

  // ── Attachment ──

  async storeAttachment(
    messageId: string,
    attachment: {
      attachmentId: string;
      filename?: string;
      contentType?: string;
      content: Buffer;
    },
  ): Promise<void> {
    if (!this.attachments.has(messageId)) {
      this.attachments.set(messageId, new Map());
    }
    this.attachments.get(messageId)!.set(attachment.attachmentId, {
      content: attachment.content,
      contentType: attachment.contentType,
      filename: attachment.filename,
    });
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData | null> {
    return this.attachments.get(messageId)?.get(attachmentId) ?? null;
  }

  async getAttachmentDownloadUrl(messageId: string, attachmentId: string): Promise<AttachmentResponse | null> {
    const data = this.attachments.get(messageId)?.get(attachmentId);
    if (!data) return null;
    // In-memory adapter returns a data: URL as a placeholder
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
