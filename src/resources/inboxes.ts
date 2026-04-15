import type { StorageAdapter } from '../storage/adapter.js';
import type { EmailTransport } from '../transport/adapter.js';
import type { AutopilotServerConfig, Logger } from '../config.js';
import type { Inbox, CreateInboxParams, UpdateInboxParams, ListInboxesParams, ListInboxesResponse } from '../types/inbox.js';
import { InboxMessagesResource } from './messages.js';
import { InboxThreadsResource } from './threads.js';
import { InboxDraftsResource } from './drafts.js';
import { generateId } from '../util/id.js';

export class InboxesResource {
  readonly messages: InboxMessagesResource;
  readonly threads: InboxThreadsResource;
  readonly drafts: InboxDraftsResource;

  constructor(
    private storage: StorageAdapter,
    private transport: EmailTransport | null,
    private config: AutopilotServerConfig,
    private logger: Logger,
    dispatchEvent?: (eventType: string, inboxId: string, podId: string, payload: Record<string, unknown>) => Promise<void>,
  ) {
    this.messages = new InboxMessagesResource(storage, transport, config, logger, dispatchEvent);
    this.threads = new InboxThreadsResource(storage);
    this.drafts = new InboxDraftsResource(storage, this.messages);
  }

  async list(params: ListInboxesParams = {}): Promise<ListInboxesResponse> {
    return this.storage.listInboxes(params);
  }

  async get(inboxId: string): Promise<Inbox> {
    const inbox = await this.storage.getInbox(inboxId);
    if (!inbox) throw new Error(`Inbox not found: ${inboxId}`);
    return inbox;
  }

  async create(params: CreateInboxParams = {}): Promise<Inbox> {
    const inboxId = generateId('inbox');
    const podId = this.config.podId ?? 'default';
    const domain = params.domain ?? this.config.defaultDomain;
    const username = params.username ?? inboxId.replace('inbox_', '').slice(0, 12);
    const email = `${username}@${domain}`.toLowerCase();

    // Check for existing inbox with same email
    const existing = await this.storage.getInboxByEmail(email);
    if (existing) {
      throw new Error(`Inbox with email ${email} already exists`);
    }

    return this.storage.createInbox({
      ...params,
      inboxId,
      email,
      podId,
    });
  }

  async update(inboxId: string, params: UpdateInboxParams): Promise<Inbox> {
    return this.storage.updateInbox(inboxId, params);
  }

  async delete(inboxId: string): Promise<void> {
    return this.storage.deleteInbox(inboxId);
  }
}
