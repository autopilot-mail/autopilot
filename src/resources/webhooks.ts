import type { StorageAdapter } from '../storage/adapter.js';
import type { Webhook, CreateWebhookParams, UpdateWebhookParams, ListWebhooksParams, ListWebhooksResponse } from '../types/webhook.js';
import { generateId, generateSecret } from '../util/id.js';

export class WebhooksResource {
  constructor(private storage: StorageAdapter) {}

  async list(params: ListWebhooksParams = {}): Promise<ListWebhooksResponse> {
    return this.storage.listWebhooks(params);
  }

  async get(webhookId: string): Promise<Webhook> {
    const webhook = await this.storage.getWebhook(webhookId);
    if (!webhook) throw new Error(`Webhook not found: ${webhookId}`);
    return webhook;
  }

  async create(params: CreateWebhookParams): Promise<Webhook> {
    const webhookId = generateId('webhook');
    const secret = generateSecret();
    return this.storage.createWebhook({ ...params, webhookId, secret });
  }

  async update(webhookId: string, params: UpdateWebhookParams): Promise<Webhook> {
    return this.storage.updateWebhook(webhookId, params);
  }

  async delete(webhookId: string): Promise<void> {
    return this.storage.deleteWebhook(webhookId);
  }
}
