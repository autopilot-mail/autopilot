import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';

export interface TomlConfig {
  server: {
    port: number;
    host: string;
    domain: string;
    pod_id?: string;
    api_keys?: string[];
  };
  storage: {
    adapter: 'postgres' | 'mongodb' | 'sqlite' | 'd1' | 'memory';
    connection_string?: string;
    database?: string;
    filename?: string;
    schema?: string;
    // D1
    account_id?: string;
    database_id?: string;
    api_token?: string;
  };
  transport?: {
    adapter: 'ses' | 'smtp' | 'noop';
    region?: string;
    configuration_set?: string;
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
  };
  file_storage?: {
    adapter: 's3' | 'r2' | 'archil' | 'local' | 'memory';
    // S3
    region?: string;
    bucket?: string;
    prefix?: string;
    // R2
    account_id?: string;
    access_key_id?: string;
    secret_access_key?: string;
    jurisdiction?: 'eu' | 'fedramp';
    // Archil
    disk_name?: string;
    auth_token?: string;
    // Local
    directory?: string;
  };
  s3?: {
    region: string;
    bucket: string;
  };
  webhooks?: {
    dispatch: boolean;
    ses_endpoint?: string;
    verify_sns_signature?: boolean;
  };
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}

const DEFAULT_CONFIG: TomlConfig = {
  server: {
    port: 3100,
    host: '0.0.0.0',
    domain: 'localhost',
  },
  storage: {
    adapter: 'memory',
  },
};

export function loadConfig(configPath?: string): TomlConfig {
  const paths = configPath ? [configPath] : ['./autopilot.toml', './config.toml', '/etc/autopilot/config.toml'];

  for (const p of paths) {
    const resolved = resolve(p);
    if (existsSync(resolved)) {
      const raw = readFileSync(resolved, 'utf-8');
      const parsed = parseToml(raw) as unknown as Partial<TomlConfig>;
      return mergeConfig(DEFAULT_CONFIG, parsed);
    }
  }

  if (configPath) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  // Fall back to env vars
  return envToConfig();
}

function mergeConfig(defaults: TomlConfig, overrides: Partial<TomlConfig>): TomlConfig {
  return {
    server: { ...defaults.server, ...overrides.server },
    storage: { ...defaults.storage, ...overrides.storage },
    transport: overrides.transport,
    file_storage: overrides.file_storage,
    s3: overrides.s3,
    webhooks: overrides.webhooks,
    logging: overrides.logging,
  };
}

function envToConfig(): TomlConfig {
  const config = { ...DEFAULT_CONFIG };

  if (process.env.PORT) config.server.port = Number(process.env.PORT);
  if (process.env.HOST) config.server.host = process.env.HOST;
  if (process.env.DOMAIN) config.server.domain = process.env.DOMAIN;
  if (process.env.POD_ID) config.server.pod_id = process.env.POD_ID;
  if (process.env.API_KEYS) config.server.api_keys = process.env.API_KEYS.split(',').map((k) => k.trim());

  if (process.env.DATABASE_URL) {
    config.storage = { adapter: 'postgres', connection_string: process.env.DATABASE_URL };
  } else if (process.env.MONGO_URI) {
    config.storage = { adapter: 'mongodb', connection_string: process.env.MONGO_URI, database: process.env.MONGO_DB };
  } else if (process.env.SQLITE_PATH) {
    config.storage = { adapter: 'sqlite', filename: process.env.SQLITE_PATH };
  }

  if (process.env.SES_REGION) {
    config.transport = { adapter: 'ses', region: process.env.SES_REGION };
  } else if (process.env.SMTP_HOST) {
    config.transport = {
      adapter: 'smtp',
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    };
  }

  if (process.env.S3_BUCKET) {
    config.s3 = { region: process.env.S3_REGION ?? process.env.SES_REGION ?? 'us-east-1', bucket: process.env.S3_BUCKET };
  }

  return config;
}
