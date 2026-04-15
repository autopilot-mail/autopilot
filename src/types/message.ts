import type { Attachment, SendAttachment } from './attachment.js';
import type { PaginationParams } from './pagination.js';

export type Addresses = string | string[];

export interface MessageItem {
  inboxId: string;
  threadId: string;
  messageId: string;
  labels: string[];
  timestamp: Date;
  from: Addresses;
  to: Addresses;
  cc?: Addresses;
  bcc?: Addresses;
  subject?: string;
  preview?: string;
  attachments?: Attachment[];
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
  size: number;
  updatedAt: Date;
  createdAt: Date;
}

export interface Message extends MessageItem {
  replyTo?: string[];
  text?: string;
  html?: string;
  extractedText?: string;
  extractedHtml?: string;
}

export interface SendMessageParams {
  labels?: string[];
  replyTo?: Addresses;
  to?: Addresses;
  cc?: Addresses;
  bcc?: Addresses;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: SendAttachment[];
  headers?: Record<string, string>;
}

export interface ReplyMessageParams {
  labels?: string[];
  replyTo?: Addresses;
  to?: Addresses;
  cc?: Addresses;
  bcc?: Addresses;
  text?: string;
  html?: string;
  attachments?: SendAttachment[];
  headers?: Record<string, string>;
}

export interface ForwardMessageParams {
  labels?: string[];
  replyTo?: Addresses;
  to: Addresses;
  cc?: Addresses;
  bcc?: Addresses;
  text?: string;
  html?: string;
  attachments?: SendAttachment[];
  headers?: Record<string, string>;
}

export interface SendMessageResponse {
  messageId: string;
  threadId: string;
  timestamp: Date;
}

export interface UpdateMessageParams {
  addLabels?: string[];
  removeLabels?: string[];
}

export interface ListMessagesParams extends PaginationParams {
  labels?: string[];
  before?: Date;
  after?: Date;
  includeSpam?: boolean;
  includeBlocked?: boolean;
  includeTrash?: boolean;
}

export interface ListMessagesResponse {
  count: number;
  limit?: number;
  nextPageToken?: string;
  messages: MessageItem[];
}
