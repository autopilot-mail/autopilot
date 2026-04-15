import type { Attachment } from './attachment.js';
import type { Message } from './message.js';
import type { PaginationParams } from './pagination.js';

export interface ThreadItem {
  inboxId: string;
  threadId: string;
  labels: string[];
  timestamp: Date;
  receivedTimestamp?: Date;
  sentTimestamp?: Date;
  senders: string[];
  recipients: string[];
  subject?: string;
  preview?: string;
  attachments?: Attachment[];
  lastMessageId: string;
  messageCount: number;
  size: number;
  updatedAt: Date;
  createdAt: Date;
}

export interface Thread extends ThreadItem {
  messages: Message[];
}

export interface ListThreadsParams extends PaginationParams {
  labels?: string[];
  before?: Date;
  after?: Date;
  includeSpam?: boolean;
  includeBlocked?: boolean;
  includeTrash?: boolean;
}

export interface ListThreadsResponse {
  count: number;
  limit?: number;
  nextPageToken?: string;
  threads: ThreadItem[];
}

export interface UpdateThreadParams {
  addLabels?: string[];
  removeLabels?: string[];
}
