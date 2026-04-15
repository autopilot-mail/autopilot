import type { PaginationParams } from './pagination.js';

export interface Inbox {
  podId: string;
  inboxId: string;
  email: string;
  displayName?: string;
  clientId?: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface CreateInboxParams {
  username?: string;
  domain?: string;
  displayName?: string;
  clientId?: string;
}

export interface UpdateInboxParams {
  displayName: string;
}

export interface ListInboxesParams extends PaginationParams {}

export interface ListInboxesResponse {
  count: number;
  limit?: number;
  nextPageToken?: string;
  inboxes: Inbox[];
}
