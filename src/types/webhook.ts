import type { EventTypeValue } from './event.js';
import type { PaginationParams } from './pagination.js';

export interface Webhook {
  webhookId: string;
  url: string;
  eventTypes: EventTypeValue[];
  podIds?: string[];
  inboxIds?: string[];
  secret: string;
  enabled: boolean;
  clientId?: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface CreateWebhookParams {
  url: string;
  eventTypes: EventTypeValue[];
  podIds?: string[];
  inboxIds?: string[];
  clientId?: string;
}

export interface UpdateWebhookParams {
  addInboxIds?: string[];
  removeInboxIds?: string[];
  addPodIds?: string[];
  removePodIds?: string[];
  enabled?: boolean;
}

export interface ListWebhooksParams extends PaginationParams {}

export interface ListWebhooksResponse {
  count: number;
  limit?: number;
  nextPageToken?: string;
  webhooks: Webhook[];
}
