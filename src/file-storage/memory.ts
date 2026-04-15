import type { FileStorageProvider } from './adapter.js';

/**
 * In-memory file storage — data lost on restart.
 * Used when no external file storage is configured.
 */
export class MemoryFileStorage implements FileStorageProvider {
  private rawMessages = new Map<string, Buffer>();
  private attachments = new Map<string, { content: Buffer; contentType?: string; filename?: string }>();

  private attKey(messageId: string, attachmentId: string): string {
    return `${messageId}/${attachmentId}`;
  }

  async putRawMessage(messageId: string, content: Buffer): Promise<void> {
    this.rawMessages.set(messageId, content);
  }

  async getRawMessage(messageId: string): Promise<Buffer | null> {
    return this.rawMessages.get(messageId) ?? null;
  }

  async deleteRawMessage(messageId: string): Promise<void> {
    this.rawMessages.delete(messageId);
  }

  async putAttachment(messageId: string, attachmentId: string, content: Buffer, metadata?: { filename?: string; contentType?: string }): Promise<void> {
    this.attachments.set(this.attKey(messageId, attachmentId), {
      content,
      contentType: metadata?.contentType,
      filename: metadata?.filename,
    });
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<{ content: Buffer; contentType?: string; filename?: string } | null> {
    return this.attachments.get(this.attKey(messageId, attachmentId)) ?? null;
  }

  async getAttachmentUrl(messageId: string, attachmentId: string): Promise<{ url: string; expiresAt: Date } | null> {
    const data = this.attachments.get(this.attKey(messageId, attachmentId));
    if (!data) return null;
    const ct = data.contentType ?? 'application/octet-stream';
    return {
      url: `data:${ct};base64,${data.content.toString('base64')}`,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }

  async deleteAttachment(messageId: string, attachmentId: string): Promise<void> {
    this.attachments.delete(this.attKey(messageId, attachmentId));
  }
}
