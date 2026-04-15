import type { StorageAdapter } from '../storage/adapter.js';
import type { Draft, CreateDraftParams, UpdateDraftParams, ListDraftsParams, ListDraftsResponse } from '../types/draft.js';
import type { SendMessageResponse } from '../types/message.js';
import type { InboxMessagesResource } from './messages.js';
import { generateId } from '../util/id.js';

export class InboxDraftsResource {
  constructor(
    private storage: StorageAdapter,
    private messagesResource: InboxMessagesResource,
  ) {}

  async list(inboxId: string, params: ListDraftsParams = {}): Promise<ListDraftsResponse> {
    return this.storage.listDrafts(inboxId, params);
  }

  async get(inboxId: string, draftId: string): Promise<Draft> {
    const draft = await this.storage.getDraft(inboxId, draftId);
    if (!draft) throw new Error(`Draft not found: ${draftId}`);
    return draft;
  }

  async create(inboxId: string, params: CreateDraftParams): Promise<Draft> {
    const draftId = generateId('draft');
    return this.storage.createDraft(inboxId, { ...params, draftId });
  }

  async update(inboxId: string, draftId: string, params: UpdateDraftParams): Promise<Draft> {
    return this.storage.updateDraft(inboxId, draftId, params);
  }

  async delete(inboxId: string, draftId: string): Promise<void> {
    return this.storage.deleteDraft(inboxId, draftId);
  }

  async send(inboxId: string, draftId: string): Promise<SendMessageResponse> {
    const draft = await this.get(inboxId, draftId);

    const result = await this.messagesResource.send(inboxId, {
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      text: draft.text,
      html: draft.html,
      replyTo: draft.replyTo,
      labels: draft.labels,
    });

    // Delete the draft after sending
    await this.storage.deleteDraft(inboxId, draftId);

    return result;
  }
}

export class DraftsResource {
  constructor(private storage: StorageAdapter) {}

  async list(params: ListDraftsParams = {}): Promise<ListDraftsResponse> {
    return this.storage.listDraftsGlobal(params);
  }

  async get(draftId: string): Promise<Draft> {
    const draft = await this.storage.getDraftGlobal(draftId);
    if (!draft) throw new Error(`Draft not found: ${draftId}`);
    return draft;
  }
}
