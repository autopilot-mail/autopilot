import type { Message, SendMessageResponse } from './message.js';
import type { ThreadItem } from './thread.js';

export const EventType = {
  MessageReceived: 'message.received',
  MessageReceivedSpam: 'message.received.spam',
  MessageReceivedBlocked: 'message.received.blocked',
  MessageSent: 'message.sent',
  MessageDelivered: 'message.delivered',
  MessageBounced: 'message.bounced',
  MessageComplained: 'message.complained',
  MessageRejected: 'message.rejected',
  DomainVerified: 'domain.verified',
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

export interface WebhookEvent {
  eventId: string;
  eventType: EventTypeValue;
  timestamp: Date;
  data: Record<string, unknown>;
}

export interface MessageReceivedEvent {
  type: 'event';
  eventType: 'message.received';
  eventId: string;
  message: Message;
  thread: ThreadItem;
}

export interface MessageSentEvent {
  type: 'event';
  eventType: 'message.sent';
  eventId: string;
  send: SendMessageResponse;
}
