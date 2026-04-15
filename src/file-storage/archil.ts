import type { FileStorageProvider } from './adapter.js';

export interface ArchilFileStorageConfig {
  region: string;
  diskName: string;
  authToken?: string;
  prefix?: string;
}

/**
 * Archil-backed file storage for raw messages and attachments.
 *
 * Uses the @archildata/just-bash ArchilFs filesystem adapter for
 * path-based file operations on an Archil disk.
 *
 * Layout:
 *   {prefix}/raw/{messageId}
 *   {prefix}/attachments/{messageId}/{attachmentId}
 *
 * Install: npm install @archildata/client @archildata/just-bash
 */
export class ArchilFileStorage implements FileStorageProvider {
  private fs: any; // ArchilFs
  private client: any; // ArchilClient
  private prefix: string;

  constructor(private config: ArchilFileStorageConfig) {
    this.prefix = config.prefix ?? '/autopilot';
  }

  async initialize(): Promise<void> {
    // Dynamic imports — @archildata packages have native bindings and are optional peer deps
    const archilClient = await import(/* webpackIgnore: true */ '@archildata/client' as string);
    const archilFs = await import(/* webpackIgnore: true */ '@archildata/just-bash' as string);
    const { ArchilClient } = archilClient;
    const { ArchilFs } = archilFs;

    this.client = await ArchilClient.connect({
      region: this.config.region,
      diskName: this.config.diskName,
      ...(this.config.authToken ? { authToken: this.config.authToken } : {}),
    });

    this.fs = await ArchilFs.create(this.client, {
      subdirectory: this.prefix,
    });

    // Ensure directory structure exists
    await this.fs.mkdir('/raw', { recursive: true });
    await this.fs.mkdir('/attachments', { recursive: true });
  }

  async close(): Promise<void> {
    if (this.client?.close) await this.client.close();
  }

  private rawPath(messageId: string): string {
    return `/raw/${messageId}`;
  }

  private attDir(messageId: string): string {
    return `/attachments/${messageId}`;
  }

  private attPath(messageId: string, attachmentId: string): string {
    return `/attachments/${messageId}/${attachmentId}`;
  }

  async putRawMessage(messageId: string, content: Buffer): Promise<void> {
    await this.fs.writeFile(this.rawPath(messageId), content);
  }

  async getRawMessage(messageId: string): Promise<Buffer | null> {
    try {
      const exists = await this.fs.exists(this.rawPath(messageId));
      if (!exists) return null;
      return await this.fs.readFileBuffer(this.rawPath(messageId));
    } catch {
      return null;
    }
  }

  async deleteRawMessage(messageId: string): Promise<void> {
    try {
      await this.fs.rm(this.rawPath(messageId));
    } catch {
      // Ignore if not found
    }
  }

  async putAttachment(messageId: string, attachmentId: string, content: Buffer, metadata?: { filename?: string; contentType?: string }): Promise<void> {
    await this.fs.mkdir(this.attDir(messageId), { recursive: true });

    // Store the file content
    await this.fs.writeFile(this.attPath(messageId, attachmentId), content);

    // Store metadata as a sidecar JSON file
    if (metadata?.filename || metadata?.contentType) {
      await this.fs.writeFile(`${this.attPath(messageId, attachmentId)}.meta`, JSON.stringify(metadata));
    }
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<{ content: Buffer; contentType?: string; filename?: string } | null> {
    try {
      const path = this.attPath(messageId, attachmentId);
      const exists = await this.fs.exists(path);
      if (!exists) return null;

      const content = await this.fs.readFileBuffer(path);

      // Try to read metadata sidecar
      let metadata: { filename?: string; contentType?: string } = {};
      try {
        const metaExists = await this.fs.exists(`${path}.meta`);
        if (metaExists) {
          const metaStr = await this.fs.readFile(`${path}.meta`);
          metadata = JSON.parse(metaStr);
        }
      } catch {
        // No metadata file — that's fine
      }

      return {
        content,
        contentType: metadata.contentType,
        filename: metadata.filename,
      };
    } catch {
      return null;
    }
  }

  async deleteAttachment(messageId: string, attachmentId: string): Promise<void> {
    try {
      const path = this.attPath(messageId, attachmentId);
      await this.fs.rm(path);
      try {
        await this.fs.rm(`${path}.meta`);
      } catch {
        // Metadata file may not exist
      }
    } catch {
      // Ignore if not found
    }
  }
}
