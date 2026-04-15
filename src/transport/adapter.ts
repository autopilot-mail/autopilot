export interface TransportSendParams {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
  attachments?: Array<{
    filename?: string;
    content: Buffer;
    contentType?: string;
    contentId?: string;
    contentDisposition?: string;
  }>;
}

export interface TransportSendResult {
  transportMessageId: string;
}

export interface EmailTransport {
  send(params: TransportSendParams): Promise<TransportSendResult>;
  initialize?(): Promise<void>;
  close?(): Promise<void>;
}
