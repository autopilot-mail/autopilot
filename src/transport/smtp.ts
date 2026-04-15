import type { EmailTransport, TransportSendParams, TransportSendResult } from './adapter.js';

export interface SmtpTransportConfig {
  host: string;
  port: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
}

export class SmtpTransport implements EmailTransport {
  private transporter: any; // nodemailer Transporter

  constructor(private config: SmtpTransportConfig) {}

  async initialize(): Promise<void> {
    const nodemailer = await import('nodemailer');
    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth,
    });
  }

  async send(params: TransportSendParams): Promise<TransportSendResult> {
    if (!this.transporter) {
      await this.initialize();
    }

    const mailOptions: Record<string, unknown> = {
      from: params.from,
      to: params.to.join(', '),
      subject: params.subject,
    };

    if (params.cc?.length) mailOptions.cc = params.cc.join(', ');
    if (params.bcc?.length) mailOptions.bcc = params.bcc.join(', ');
    if (params.replyTo?.length) mailOptions.replyTo = params.replyTo.join(', ');
    if (params.text) mailOptions.text = params.text;
    if (params.html) mailOptions.html = params.html;
    if (params.inReplyTo) mailOptions.inReplyTo = params.inReplyTo;
    if (params.references?.length) mailOptions.references = params.references.join(' ');

    if (params.headers) {
      mailOptions.headers = params.headers;
    }

    if (params.attachments?.length) {
      mailOptions.attachments = params.attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
        cid: att.contentId,
        contentDisposition: att.contentDisposition,
      }));
    }

    const info = await this.transporter.sendMail(mailOptions);
    return { transportMessageId: info.messageId ?? '' };
  }

  async close(): Promise<void> {
    if (this.transporter?.close) {
      this.transporter.close();
    }
  }
}
