import type { EmailTransport, TransportSendParams, TransportSendResult } from './adapter.js';
import { buildMimeMessage } from '../email/builder.js';

export interface SesTransportConfig {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  configurationSetName?: string;
}

export class SesTransport implements EmailTransport {
  private client: any; // SESv2Client — dynamically imported

  constructor(private config: SesTransportConfig) {}

  async initialize(): Promise<void> {
    const { SESv2Client } = await import('@aws-sdk/client-sesv2');
    this.client = new SESv2Client({
      region: this.config.region,
      ...(this.config.credentials ? { credentials: this.config.credentials } : {}),
    });
  }

  async send(params: TransportSendParams): Promise<TransportSendResult> {
    if (!this.client) {
      await this.initialize();
    }

    const { SendEmailCommand } = await import('@aws-sdk/client-sesv2');

    const hasAttachments = params.attachments && params.attachments.length > 0;
    const hasCustomHeaders = params.inReplyTo || params.references?.length || params.headers;

    // Use raw MIME when we have attachments or custom headers that SES Simple mode doesn't support
    if (hasAttachments || hasCustomHeaders) {
      const rawMessage = await buildMimeMessage(params);

      const result = await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: params.from,
          Destination: {
            ToAddresses: params.to,
            ...(params.cc?.length ? { CcAddresses: params.cc } : {}),
            ...(params.bcc?.length ? { BccAddresses: params.bcc } : {}),
          },
          Content: {
            Raw: { Data: new TextEncoder().encode(rawMessage) },
          },
          ...(params.replyTo?.length ? { ReplyToAddresses: params.replyTo } : {}),
          ...(this.config.configurationSetName ? { ConfigurationSetName: this.config.configurationSetName } : {}),
        }),
      );

      return { transportMessageId: result.MessageId ?? '' };
    }

    // Simple mode (no attachments, no custom headers)
    const result = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: params.from,
        Destination: {
          ToAddresses: params.to,
          ...(params.cc?.length ? { CcAddresses: params.cc } : {}),
          ...(params.bcc?.length ? { BccAddresses: params.bcc } : {}),
        },
        Content: {
          Simple: {
            Subject: { Data: params.subject, Charset: 'UTF-8' },
            Body: {
              ...(params.html ? { Html: { Data: params.html, Charset: 'UTF-8' } } : {}),
              ...(params.text ? { Text: { Data: params.text, Charset: 'UTF-8' } } : {}),
            },
          },
        },
        ...(params.replyTo?.length ? { ReplyToAddresses: params.replyTo } : {}),
        ...(this.config.configurationSetName ? { ConfigurationSetName: this.config.configurationSetName } : {}),
      }),
    );

    return { transportMessageId: result.MessageId ?? '' };
  }

  async close(): Promise<void> {
    if (this.client?.destroy) {
      this.client.destroy();
    }
  }
}
