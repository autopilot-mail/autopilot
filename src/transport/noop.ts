import type { EmailTransport, TransportSendParams, TransportSendResult } from './adapter.js';
import { generateId } from '../util/id.js';

export interface SentRecord {
  params: TransportSendParams;
  transportMessageId: string;
  sentAt: Date;
}

export class NoopTransport implements EmailTransport {
  readonly sent: SentRecord[] = [];

  async send(params: TransportSendParams): Promise<TransportSendResult> {
    const transportMessageId = generateId('message');
    this.sent.push({ params, transportMessageId, sentAt: new Date() });
    return { transportMessageId };
  }

  clear(): void {
    this.sent.length = 0;
  }
}
