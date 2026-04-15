import type { Inbox, CreateInboxParams, UpdateInboxParams, ListInboxesParams, ListInboxesResponse } from '../types/inbox.js';
import type { Message, ListMessagesParams, ListMessagesResponse, UpdateMessageParams } from '../types/message.js';
import type { ThreadItem, Thread, ListThreadsParams, ListThreadsResponse, UpdateThreadParams } from '../types/thread.js';
import type { Draft, CreateDraftParams, UpdateDraftParams, ListDraftsParams, ListDraftsResponse } from '../types/draft.js';
import type { Webhook, CreateWebhookParams, UpdateWebhookParams, ListWebhooksParams, ListWebhooksResponse } from '../types/webhook.js';
import type { Domain, CreateDomainParams, UpdateDomainParams, ListDomainsParams, ListDomainsResponse, VerificationRecord } from '../types/domain.js';
import type { AttachmentData, AttachmentResponse } from '../types/attachment.js';
import type { EventTypeValue } from '../types/event.js';

export interface StorageAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;

  // ── Inbox ──
  createInbox(params: CreateInboxParams & { inboxId: string; email: string; podId: string }): Promise<Inbox>;
  getInbox(inboxId: string): Promise<Inbox | null>;
  getInboxByEmail(email: string): Promise<Inbox | null>;
  listInboxes(params: ListInboxesParams): Promise<ListInboxesResponse>;
  updateInbox(inboxId: string, params: UpdateInboxParams): Promise<Inbox>;
  deleteInbox(inboxId: string): Promise<void>;

  // ── Message ──
  createMessage(message: Message): Promise<Message>;
  getMessage(inboxId: string, messageId: string): Promise<Message | null>;
  listMessages(inboxId: string, params: ListMessagesParams): Promise<ListMessagesResponse>;
  updateMessage(inboxId: string, messageId: string, params: UpdateMessageParams): Promise<Message>;
  deleteMessage(inboxId: string, messageId: string): Promise<void>;
  storeRawMessage(messageId: string, raw: Buffer): Promise<void>;
  getRawMessage(messageId: string): Promise<Buffer | null>;
  resolveThread(inboxId: string, inReplyTo?: string, references?: string[], subject?: string): Promise<string | null>;

  // ── Thread ──
  createThread(thread: ThreadItem): Promise<ThreadItem>;
  getThread(threadId: string): Promise<Thread | null>;
  getThreadByInbox(inboxId: string, threadId: string): Promise<Thread | null>;
  listThreads(params: ListThreadsParams & { inboxId?: string }): Promise<ListThreadsResponse>;
  updateThread(threadId: string, params: UpdateThreadParams): Promise<ThreadItem>;
  updateThreadOnNewMessage(threadId: string, message: Message): Promise<void>;
  deleteThread(threadId: string): Promise<void>;

  // ── Draft ──
  createDraft(inboxId: string, params: CreateDraftParams & { draftId: string }): Promise<Draft>;
  getDraft(inboxId: string, draftId: string): Promise<Draft | null>;
  getDraftGlobal(draftId: string): Promise<Draft | null>;
  listDrafts(inboxId: string, params: ListDraftsParams): Promise<ListDraftsResponse>;
  listDraftsGlobal(params: ListDraftsParams): Promise<ListDraftsResponse>;
  updateDraft(inboxId: string, draftId: string, params: UpdateDraftParams): Promise<Draft>;
  deleteDraft(inboxId: string, draftId: string): Promise<void>;

  // ── Webhook ──
  createWebhook(params: CreateWebhookParams & { webhookId: string; secret: string }): Promise<Webhook>;
  getWebhook(webhookId: string): Promise<Webhook | null>;
  listWebhooks(params: ListWebhooksParams): Promise<ListWebhooksResponse>;
  updateWebhook(webhookId: string, params: UpdateWebhookParams): Promise<Webhook>;
  deleteWebhook(webhookId: string): Promise<void>;
  getWebhooksForEvent(eventType: EventTypeValue, inboxId: string, podId: string): Promise<Webhook[]>;

  // ── Domain ──
  createDomain(
    params: CreateDomainParams & {
      domainId: string;
      podId?: string;
      records: VerificationRecord[];
    },
  ): Promise<Domain>;
  getDomain(domainId: string): Promise<Domain | null>;
  getDomainByName(domain: string): Promise<Domain | null>;
  listDomains(params: ListDomainsParams): Promise<ListDomainsResponse>;
  updateDomain(domainId: string, params: UpdateDomainParams): Promise<Domain>;
  deleteDomain(domainId: string): Promise<void>;

  // ── Attachment ──
  storeAttachment(
    messageId: string,
    attachment: {
      attachmentId: string;
      filename?: string;
      contentType?: string;
      content: Buffer;
    },
  ): Promise<void>;
  getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData | null>;
  getAttachmentDownloadUrl(messageId: string, attachmentId: string): Promise<AttachmentResponse | null>;
}
