import type { StorageAdapter } from './storage/adapter.js';
import type { EmailTransport } from './transport/adapter.js';
import type { FileStorageProvider } from './file-storage/adapter.js';

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface S3Config {
  region: string;
  bucket: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

export interface AutopilotServerConfig {
  storage: StorageAdapter;
  transport?: EmailTransport;
  fileStorage?: FileStorageProvider;
  defaultDomain: string;
  podId?: string;
  s3?: S3Config;
  webhookDispatch?: boolean;
  logger?: Logger;
}

export const defaultLogger: Logger = {
  info: (msg, meta) => console.log(`[autopilot] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[autopilot] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[autopilot] ${msg}`, meta ?? ''),
  debug: (msg, meta) => console.debug(`[autopilot] ${msg}`, meta ?? ''),
};
