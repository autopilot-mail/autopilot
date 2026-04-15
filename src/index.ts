// Core
export { AutopilotServer } from './server.js';
export type { AutopilotServerConfig, Logger, S3Config } from './config.js';
export { defaultLogger } from './config.js';

// Types
export * from './types/index.js';

// Storage
export type { StorageAdapter } from './storage/adapter.js';
export { InMemoryStorageAdapter } from './storage/memory.js';

// Transport
export type { EmailTransport, TransportSendParams, TransportSendResult } from './transport/adapter.js';
export { NoopTransport } from './transport/noop.js';
export type { SentRecord } from './transport/noop.js';

// File Storage
export type { FileStorageProvider } from './file-storage/adapter.js';
export { MemoryFileStorage } from './file-storage/memory.js';
export { S3FileStorage, type S3FileStorageConfig } from './file-storage/s3.js';
export { R2FileStorage, type R2FileStorageConfig } from './file-storage/r2.js';
export { ArchilFileStorage, type ArchilFileStorageConfig } from './file-storage/archil.js';
export { LocalFileStorage, type LocalFileStorageConfig } from './file-storage/local.js';

// Events
export { EventBus, type AutopilotEvent, type EventSubscription } from './events/bus.js';
export { createWebSocketHandler } from './events/websocket.js';

// Webhooks
export { WebhookHandlerCore, createWebhookHandlerCore, type WebhookRequest, type WebhookResponse, type WebhookHandlerOptions } from './webhooks/handler.js';

// Email utilities
export { parseRawEmail, createPreview, type ParsedEmail } from './email/parser.js';
export { buildMimeMessage } from './email/builder.js';
export { extractReplyText, extractReplyHtml } from './email/reply-parser.js';
export { resolveOrCreateThread } from './email/threading.js';

// ID utilities
export { generateId, generateSecret, type IdPrefix } from './util/id.js';
