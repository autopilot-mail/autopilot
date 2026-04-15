import type { AutopilotServer } from '../server.js';
import type { Logger } from '../config.js';
import type { S3Config } from '../config.js';
import { parseSnsMessage, parseSesNotification, verifySnsSignature, type SnsMessage } from './sns.js';

export interface WebhookRequest {
  body: string | Buffer | Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  method: string;
}

export interface WebhookResponse {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

export interface WebhookHandlerOptions {
  verifySnsSignature?: boolean;
}

export class WebhookHandlerCore {
  constructor(
    private server: AutopilotServer,
    private s3Config: S3Config | undefined,
    private logger: Logger,
    private options: WebhookHandlerOptions = {},
  ) {}

  async handleRequest(req: WebhookRequest): Promise<WebhookResponse> {
    try {
      const snsMessage = parseSnsMessage(req.body);

      // Handle subscription confirmation
      if (snsMessage.Type === 'SubscriptionConfirmation') {
        return this.handleSubscriptionConfirmation(snsMessage);
      }

      // Handle unsubscribe confirmation
      if (snsMessage.Type === 'UnsubscribeConfirmation') {
        this.logger.info('SNS unsubscribe confirmation received', {
          topicArn: snsMessage.TopicArn,
        });
        return { status: 200, body: 'OK' };
      }

      // Verify signature if enabled
      if (this.options.verifySnsSignature !== false) {
        const valid = await verifySnsSignature(snsMessage);
        if (!valid) {
          this.logger.warn('SNS signature verification failed');
          return { status: 403, body: 'Invalid signature' };
        }
      }

      // Handle notification
      if (snsMessage.Type === 'Notification') {
        return this.handleNotification(snsMessage);
      }

      return { status: 400, body: 'Unknown message type' };
    } catch (err) {
      this.logger.error('Webhook handler error', { error: String(err) });
      return { status: 500, body: 'Internal server error' };
    }
  }

  private async handleSubscriptionConfirmation(message: SnsMessage): Promise<WebhookResponse> {
    if (!message.SubscribeURL) {
      return { status: 400, body: 'Missing SubscribeURL' };
    }

    this.logger.info('Confirming SNS subscription...', {
      topicArn: message.TopicArn,
    });

    try {
      await fetch(message.SubscribeURL);
      this.logger.info('SNS subscription confirmed');
      return { status: 200, body: 'Subscription confirmed' };
    } catch (err) {
      this.logger.error('Failed to confirm SNS subscription', {
        error: String(err),
      });
      return { status: 500, body: 'Failed to confirm subscription' };
    }
  }

  private async handleNotification(message: SnsMessage): Promise<WebhookResponse> {
    const notification = parseSesNotification(message.Message);

    switch (notification.notificationType) {
      case 'Received':
        return this.handleReceived(notification);
      case 'Bounce':
        this.logger.info('Bounce notification received', {
          messageId: notification.mail.messageId,
        });
        return { status: 200, body: 'OK' };
      case 'Complaint':
        this.logger.info('Complaint notification received', {
          messageId: notification.mail.messageId,
        });
        return { status: 200, body: 'OK' };
      case 'Delivery':
        this.logger.debug('Delivery notification received', {
          messageId: notification.mail.messageId,
        });
        return { status: 200, body: 'OK' };
      default:
        return { status: 200, body: 'OK' };
    }
  }

  private async handleReceived(notification: any): Promise<WebhookResponse> {
    const receipt = notification.receipt;
    const mail = notification.mail;

    if (!receipt?.action?.bucketName || !receipt?.action?.objectKey) {
      this.logger.warn('SES received notification missing S3 info');
      return { status: 200, body: 'OK' };
    }

    if (!this.s3Config) {
      this.logger.warn('SES received notification but no S3 config provided. Cannot fetch raw email.');
      return { status: 200, body: 'OK' };
    }

    try {
      // Fetch raw email from S3
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({
        region: this.s3Config.region,
        ...(this.s3Config.credentials ? { credentials: this.s3Config.credentials } : {}),
      });

      const result = await s3.send(
        new GetObjectCommand({
          Bucket: receipt.action.bucketName,
          Key: receipt.action.objectKey,
        }),
      );

      const rawStr = (await result.Body?.transformToString('utf-8')) ?? '';
      const raw = Buffer.from(rawStr, 'utf-8');

      // Process for each recipient
      const recipients: string[] = receipt.recipients ?? mail.destination ?? [];
      for (const recipient of recipients) {
        try {
          await this.server.processInboundEmail(raw, recipient);
        } catch (err) {
          this.logger.warn(`Failed to process inbound email for ${recipient}`, {
            error: String(err),
          });
        }
      }

      return { status: 200, body: 'OK' };
    } catch (err) {
      this.logger.error('Failed to fetch/process inbound email from S3', {
        error: String(err),
        bucket: receipt.action.bucketName,
        key: receipt.action.objectKey,
      });
      return { status: 500, body: 'Failed to process email' };
    }
  }
}

export function createWebhookHandlerCore(server: AutopilotServer, s3Config: S3Config | undefined, logger: Logger, options?: WebhookHandlerOptions): WebhookHandlerCore {
  return new WebhookHandlerCore(server, s3Config, logger, options);
}
