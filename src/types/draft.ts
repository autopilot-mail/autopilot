import type { Addresses } from './message.js';
import type { Attachment, SendAttachment } from './attachment.js';
import type { PaginationParams } from './pagination.js';

export interface DraftItem {
  inboxId: string;
  draftId: string;
  clientId?: string;
  labels: string[];
  replyTo?: Addresses;
  to?: Addresses;
  cc?: Addresses;
  bcc?: Addresses;
  subject?: string;
  preview?: string;
  attachments?: Attachment[];
  inReplyTo?: string;
  references?: string[];
  sendStatus?: string;
  sendAt?: Date;
  updatedAt: Date;
  createdAt: Date;
}

export interface Draft extends DraftItem {
  text?: string;
  html?: string;
}

export interface CreateDraftParams {
  labels?: string[];
  replyTo?: Addresses;
  to?: Addresses;
  cc?: Addresses;
  bcc?: Addresses;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: SendAttachment[];
  inReplyTo?: string;
  sendAt?: Date;
  clientId?: string;
}

export interface UpdateDraftParams {
  replyTo?: Addresses;
  to?: Addresses;
  cc?: Addresses;
  bcc?: Addresses;
  subject?: string;
  text?: string;
  html?: string;
  sendAt?: Date;
}

export interface ListDraftsParams extends PaginationParams {}

export interface ListDraftsResponse {
  count: number;
  limit?: number;
  nextPageToken?: string;
  drafts: DraftItem[];
}
