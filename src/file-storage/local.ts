import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileStorageProvider } from './adapter.js';

export interface LocalFileStorageConfig {
  directory: string;
}

/**
 * Local filesystem file storage for raw messages and attachments.
 *
 * Layout:
 *   {directory}/raw/{messageId}
 *   {directory}/attachments/{messageId}/{attachmentId}
 *   {directory}/attachments/{messageId}/{attachmentId}.meta  (JSON metadata)
 */
export class LocalFileStorage implements FileStorageProvider {
  private dir: string;

  constructor(private config: LocalFileStorageConfig) {
    this.dir = config.directory;
  }

  async initialize(): Promise<void> {
    await mkdir(join(this.dir, 'raw'), { recursive: true });
    await mkdir(join(this.dir, 'attachments'), { recursive: true });
  }

  private rawPath(messageId: string): string {
    return join(this.dir, 'raw', messageId);
  }

  private attDir(messageId: string): string {
    return join(this.dir, 'attachments', messageId);
  }

  private attPath(messageId: string, attachmentId: string): string {
    return join(this.dir, 'attachments', messageId, attachmentId);
  }

  async putRawMessage(messageId: string, content: Buffer): Promise<void> {
    await writeFile(this.rawPath(messageId), content);
  }

  async getRawMessage(messageId: string): Promise<Buffer | null> {
    try {
      return await readFile(this.rawPath(messageId));
    } catch {
      return null;
    }
  }

  async deleteRawMessage(messageId: string): Promise<void> {
    try {
      await rm(this.rawPath(messageId));
    } catch {
      // Ignore
    }
  }

  async putAttachment(messageId: string, attachmentId: string, content: Buffer, metadata?: { filename?: string; contentType?: string }): Promise<void> {
    await mkdir(this.attDir(messageId), { recursive: true });
    await writeFile(this.attPath(messageId, attachmentId), content);

    if (metadata?.filename || metadata?.contentType) {
      await writeFile(`${this.attPath(messageId, attachmentId)}.meta`, JSON.stringify(metadata));
    }
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<{ content: Buffer; contentType?: string; filename?: string } | null> {
    try {
      const content = await readFile(this.attPath(messageId, attachmentId));

      let metadata: { filename?: string; contentType?: string } = {};
      try {
        const metaRaw = await readFile(`${this.attPath(messageId, attachmentId)}.meta`, 'utf-8');
        metadata = JSON.parse(metaRaw);
      } catch {
        // No metadata
      }

      return { content, contentType: metadata.contentType, filename: metadata.filename };
    } catch {
      return null;
    }
  }

  async getAttachmentUrl(messageId: string, attachmentId: string): Promise<{ url: string; expiresAt: Date } | null> {
    try {
      await access(this.attPath(messageId, attachmentId));
      // Return a file:// URL for local access
      return {
        url: `file://${this.attPath(messageId, attachmentId)}`,
        expiresAt: new Date(Date.now() + 86400_000),
      };
    } catch {
      return null;
    }
  }

  async deleteAttachment(messageId: string, attachmentId: string): Promise<void> {
    try {
      await rm(this.attPath(messageId, attachmentId));
      try {
        await rm(`${this.attPath(messageId, attachmentId)}.meta`);
      } catch {
        // Metadata may not exist
      }
    } catch {
      // Ignore
    }
  }
}
