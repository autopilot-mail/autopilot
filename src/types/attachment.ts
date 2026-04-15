export interface Attachment {
  attachmentId: string;
  filename?: string;
  size: number;
  contentType?: string;
  contentDisposition?: string;
  contentId?: string;
}

export interface SendAttachment {
  filename?: string;
  contentType?: string;
  contentDisposition?: string;
  contentId?: string;
  content?: string; // base64-encoded
  url?: string;
}

export interface AttachmentData {
  content: Buffer;
  contentType?: string;
  filename?: string;
}

export interface AttachmentResponse extends Attachment {
  downloadUrl: string;
  expiresAt: Date;
}
