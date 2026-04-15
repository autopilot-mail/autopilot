import type { FileStorageProvider } from './adapter.js';

export interface R2FileStorageConfig {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
  jurisdiction?: 'eu' | 'fedramp';
}

/**
 * Cloudflare R2 file storage — S3-compatible object storage.
 *
 * Uses the standard @aws-sdk/client-s3 with R2's S3-compatible endpoint.
 *
 * Layout:
 *   {prefix}/raw/{messageId}
 *   {prefix}/attachments/{messageId}/{attachmentId}
 */
export class R2FileStorage implements FileStorageProvider {
  private client: any; // S3Client
  private bucket: string;
  private prefix: string;

  constructor(private config: R2FileStorageConfig) {
    this.bucket = config.bucket;
    this.prefix = config.prefix ?? 'autopilot';
  }

  async initialize(): Promise<void> {
    const { S3Client } = await import('@aws-sdk/client-s3');

    const jurisdictionPrefix = this.config.jurisdiction ? `${this.config.jurisdiction}.` : '';
    const endpoint = `https://${this.config.accountId}.${jurisdictionPrefix}r2.cloudflarestorage.com`;

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }

  async close(): Promise<void> {
    if (this.client?.destroy) this.client.destroy();
  }

  private rawKey(messageId: string): string {
    return `${this.prefix}/raw/${messageId}`;
  }

  private attKey(messageId: string, attachmentId: string): string {
    return `${this.prefix}/attachments/${messageId}/${attachmentId}`;
  }

  async putRawMessage(messageId: string, content: Buffer): Promise<void> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.rawKey(messageId),
        Body: content,
        ContentType: 'message/rfc822',
      }),
    );
  }

  async getRawMessage(messageId: string): Promise<Buffer | null> {
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.rawKey(messageId) }));
      const str = (await result.Body?.transformToString('utf-8')) ?? '';
      return Buffer.from(str, 'utf-8');
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async deleteRawMessage(messageId: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.rawKey(messageId) }));
  }

  async putAttachment(messageId: string, attachmentId: string, content: Buffer, metadata?: { filename?: string; contentType?: string }): Promise<void> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.attKey(messageId, attachmentId),
        Body: content,
        ContentType: metadata?.contentType ?? 'application/octet-stream',
        ...(metadata?.filename ? { ContentDisposition: `attachment; filename="${metadata.filename}"` } : {}),
      }),
    );
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<{ content: Buffer; contentType?: string; filename?: string } | null> {
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.attKey(messageId, attachmentId) }));
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) return null;
      return {
        content: Buffer.from(bytes),
        contentType: result.ContentType,
        filename: result.ContentDisposition?.match(/filename="(.+)"/)?.[1],
      };
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async getAttachmentUrl(messageId: string, attachmentId: string, expiresInSeconds = 3600): Promise<{ url: string; expiresAt: Date } | null> {
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const url = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: this.attKey(messageId, attachmentId) }), { expiresIn: expiresInSeconds });
      return { url, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
    } catch {
      return null;
    }
  }

  async deleteAttachment(messageId: string, attachmentId: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.attKey(messageId, attachmentId) }));
  }
}
