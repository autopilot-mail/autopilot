#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { AutopilotServer } from '../server.js';
import { createRouter } from './router.js';
import { loadConfig, type TomlConfig } from './config.js';
import { InMemoryStorageAdapter } from '../storage/memory.js';
import { NoopTransport } from '../transport/noop.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { EmailTransport } from '../transport/adapter.js';
import type { FileStorageProvider } from '../file-storage/adapter.js';
import { MemoryFileStorage } from '../file-storage/memory.js';
import type { Logger } from '../config.js';

async function createStorage(config: TomlConfig): Promise<StorageAdapter> {
  switch (config.storage.adapter) {
    case 'postgres': {
      const { PostgresStorageAdapter } = await import('../storage/postgres.js');
      return new PostgresStorageAdapter({
        connectionString: config.storage.connection_string!,
        schema: config.storage.schema,
      });
    }
    case 'mongodb': {
      const { MongoStorageAdapter } = await import('../storage/mongodb.js');
      return new MongoStorageAdapter({
        uri: config.storage.connection_string!,
        database: config.storage.database,
      });
    }
    case 'sqlite': {
      const { SqliteStorageAdapter } = await import('../storage/sqlite.js');
      return new SqliteStorageAdapter({
        filename: config.storage.filename ?? './autopilot.db',
      });
    }
    case 'd1': {
      const { D1StorageAdapter } = await import('../storage/d1.js');
      return new D1StorageAdapter({
        accountId: config.storage.account_id!,
        databaseId: config.storage.database_id!,
        apiToken: config.storage.api_token!,
      });
    }
    case 'memory':
    default:
      return new InMemoryStorageAdapter();
  }
}

async function createTransport(config: TomlConfig): Promise<EmailTransport | undefined> {
  if (!config.transport) return undefined;

  switch (config.transport.adapter) {
    case 'ses': {
      const { SesTransport } = await import('../transport/ses.js');
      return new SesTransport({
        region: config.transport.region ?? 'us-east-1',
        configurationSetName: config.transport.configuration_set,
      });
    }
    case 'smtp': {
      const { SmtpTransport } = await import('../transport/smtp.js');
      return new SmtpTransport({
        host: config.transport.host!,
        port: config.transport.port ?? 587,
        secure: config.transport.secure,
        auth: config.transport.user ? { user: config.transport.user, pass: config.transport.pass! } : undefined,
      });
    }
    case 'noop':
    default:
      return new NoopTransport();
  }
}

async function createFileStorage(config: TomlConfig): Promise<FileStorageProvider | undefined> {
  if (!config.file_storage) return undefined;

  switch (config.file_storage.adapter) {
    case 's3': {
      const { S3FileStorage } = await import('../file-storage/s3.js');
      return new S3FileStorage({
        region: config.file_storage.region ?? 'us-east-1',
        bucket: config.file_storage.bucket!,
        prefix: config.file_storage.prefix,
      });
    }
    case 'r2': {
      const { R2FileStorage } = await import('../file-storage/r2.js');
      return new R2FileStorage({
        accountId: config.file_storage.account_id!,
        bucket: config.file_storage.bucket!,
        accessKeyId: config.file_storage.access_key_id!,
        secretAccessKey: config.file_storage.secret_access_key!,
        prefix: config.file_storage.prefix,
        jurisdiction: config.file_storage.jurisdiction,
      });
    }
    case 'archil': {
      const { ArchilFileStorage } = await import('../file-storage/archil.js');
      return new ArchilFileStorage({
        region: config.file_storage.region ?? 'aws-us-east-1',
        diskName: config.file_storage.disk_name!,
        authToken: config.file_storage.auth_token,
        prefix: config.file_storage.prefix,
      });
    }
    case 'local': {
      const { LocalFileStorage } = await import('../file-storage/local.js');
      return new LocalFileStorage({
        directory: config.file_storage.directory ?? './autopilot-files',
      });
    }
    case 'memory':
      return new MemoryFileStorage();
    default:
      return undefined;
  }
}

function createLogger(config: TomlConfig): Logger {
  const level = config.logging?.level ?? 'info';
  const levels: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const threshold = levels[level] ?? 1;

  return {
    debug: (msg, meta) => {
      if (threshold <= 0) console.debug(`[autopilot] ${msg}`, meta ?? '');
    },
    info: (msg, meta) => {
      if (threshold <= 1) console.log(`[autopilot] ${msg}`, meta ?? '');
    },
    warn: (msg, meta) => {
      if (threshold <= 2) console.warn(`[autopilot] ${msg}`, meta ?? '');
    },
    error: (msg, meta) => {
      if (threshold <= 3) console.error(`[autopilot] ${msg}`, meta ?? '');
    },
  };
}

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2);
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' || args[i] === '-c') {
      configPath = args[++i];
    }
    if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
autopilot — standalone agentmail-compatible email server

Usage:
  autopilot [options]

Options:
  -c, --config <path>   Path to autopilot.toml config file
                        Defaults: ./autopilot.toml, ./config.toml, /etc/autopilot/config.toml
  -h, --help            Show this help message

Environment variables (used when no config file is found):
  PORT                  Server port (default: 3100)
  HOST                  Bind address (default: 0.0.0.0)
  DOMAIN                Default email domain
  API_KEYS              Comma-separated API keys for auth
  DATABASE_URL          PostgreSQL connection string
  MONGO_URI             MongoDB connection string
  SQLITE_PATH           SQLite database file path
  SES_REGION            AWS SES region (enables SES transport)
  SMTP_HOST             SMTP host (enables SMTP transport)
  SMTP_PORT             SMTP port (default: 587)
  SMTP_USER             SMTP username
  SMTP_PASS             SMTP password
  S3_BUCKET             S3 bucket for inbound SES emails
  S3_REGION             S3 region (defaults to SES_REGION)
`);
      process.exit(0);
    }
  }

  const config = loadConfig(configPath);
  const logger = createLogger(config);

  logger.info(`Loading config (storage: ${config.storage.adapter}, transport: ${config.transport?.adapter ?? 'none'}, file_storage: ${config.file_storage?.adapter ?? 'none'})`);

  const storage = await createStorage(config);
  const transport = await createTransport(config);
  const fileStorage = await createFileStorage(config);

  const autopilot = new AutopilotServer({
    storage,
    transport,
    fileStorage,
    defaultDomain: config.server.domain,
    podId: config.server.pod_id,
    s3: config.s3,
    webhookDispatch: config.webhooks?.dispatch,
    logger,
  });

  await autopilot.initialize();

  const app = createRouter(autopilot, config.server.api_keys);

  // Mount SES webhook handler if configured
  if (config.webhooks?.ses_endpoint) {
    const { createHonoWebhookHandler } = await import('../webhooks/hono.js');
    const webhookPath = config.webhooks.ses_endpoint;
    app.post(webhookPath, createHonoWebhookHandler(autopilot, { verifySnsSignature: config.webhooks.verify_sns_signature }));
    logger.info(`SES webhook handler mounted at ${webhookPath}`);
  }

  const port = config.server.port;
  const host = config.server.host;

  const httpServer = serve({ fetch: app.fetch, port, hostname: host }, () => {
    logger.info(`Autopilot server listening on http://${host}:${port}`);
    logger.info(`API base: http://${host}:${port}/v0`);
    logger.info(`WebSocket: ws://${host}:${port}/v0/ws`);
    if (config.server.api_keys?.length) {
      logger.info(`Auth enabled (${config.server.api_keys.length} API key(s))`);
    } else {
      logger.warn('No API keys configured — server is unauthenticated');
    }
  });

  // WebSocket upgrade handler
  const { createWebSocketHandler } = await import('../events/websocket.js');
  const wsHandler = createWebSocketHandler(autopilot, { apiKeys: config.server.api_keys });
  httpServer.on('upgrade', (req: any, socket: any, head: any) => {
    wsHandler.handleUpgrade(req, socket, head);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await autopilot.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[autopilot] Fatal error:', err);
  process.exit(1);
});
