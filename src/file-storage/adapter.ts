/**
 * FileStorageProvider handles binary file storage for raw messages and attachments.
 *
 * This is separate from the main StorageAdapter (which handles structured data like
 * inboxes, messages, threads). File storage can be backed by S3, Archil, local disk,
 * or kept in-memory.
 *
 * When a FileStorageProvider is configured on the server, it takes over the
 * storeRawMessage/getRawMessage and storeAttachment/getAttachment operations.
 * The main StorageAdapter still handles metadata.
 */
export interface FileStorageProvider {
  initialize?(): Promise<void>;
  close?(): Promise<void>;

  /**
   * Store a raw MIME message.
   * Key format: `raw/{messageId}`
   */
  putRawMessage(messageId: string, content: Buffer): Promise<void>;

  /**
   * Retrieve a raw MIME message.
   */
  getRawMessage(messageId: string): Promise<Buffer | null>;

  /**
   * Delete a raw MIME message.
   */
  deleteRawMessage?(messageId: string): Promise<void>;

  /**
   * Store an attachment file.
   * Key format: `attachments/{messageId}/{attachmentId}`
   */
  putAttachment(messageId: string, attachmentId: string, content: Buffer, metadata?: { filename?: string; contentType?: string }): Promise<void>;

  /**
   * Retrieve an attachment file.
   */
  getAttachment(messageId: string, attachmentId: string): Promise<{ content: Buffer; contentType?: string; filename?: string } | null>;

  /**
   * Generate a download URL for an attachment (presigned URL, data URL, etc.).
   * Returns null if the provider doesn't support URL generation.
   */
  getAttachmentUrl?(messageId: string, attachmentId: string, expiresInSeconds?: number): Promise<{ url: string; expiresAt: Date } | null>;

  /**
   * Delete an attachment file.
   */
  deleteAttachment?(messageId: string, attachmentId: string): Promise<void>;
}
