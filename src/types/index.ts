export type { Attachment, SendAttachment, AttachmentData, AttachmentResponse } from './attachment.js';

export type { Domain, CreateDomainParams, UpdateDomainParams, ListDomainsParams, ListDomainsResponse, VerificationStatus, RecordType, RecordStatus, VerificationRecord } from './domain.js';

export type { Draft, DraftItem, CreateDraftParams, UpdateDraftParams, ListDraftsParams, ListDraftsResponse } from './draft.js';

export { EventType } from './event.js';

export type { EventTypeValue, WebhookEvent, MessageReceivedEvent, MessageSentEvent } from './event.js';

export type { Inbox, CreateInboxParams, UpdateInboxParams, ListInboxesParams, ListInboxesResponse } from './inbox.js';

export type {
  Addresses,
  Message,
  MessageItem,
  SendMessageParams,
  ReplyMessageParams,
  ForwardMessageParams,
  SendMessageResponse,
  UpdateMessageParams,
  ListMessagesParams,
  ListMessagesResponse,
} from './message.js';

export type { PaginationParams, PaginatedList } from './pagination.js';

export type { Thread, ThreadItem, ListThreadsParams, ListThreadsResponse, UpdateThreadParams } from './thread.js';

export type { Webhook, CreateWebhookParams, UpdateWebhookParams, ListWebhooksParams, ListWebhooksResponse } from './webhook.js';
