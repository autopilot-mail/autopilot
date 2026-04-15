import type { EventTypeValue } from '../types/event.js';

export interface AutopilotEvent {
  eventId: string;
  eventType: EventTypeValue;
  timestamp: string;
  data: Record<string, unknown>;
  inboxId?: string;
  podId?: string;
}

export interface EventSubscription {
  inboxIds?: string[];
  podIds?: string[];
  eventTypes?: EventTypeValue[];
}

type EventHandler = (event: AutopilotEvent) => void;

/**
 * In-process event bus for real-time event streaming.
 * WebSocket connections subscribe here to receive events.
 */
export class EventBus {
  private listeners = new Map<string, { handler: EventHandler; filter: EventSubscription }>();
  private nextId = 0;

  /**
   * Subscribe to events. Returns an unsubscribe function.
   */
  subscribe(filter: EventSubscription, handler: EventHandler): () => void {
    const id = String(++this.nextId);
    this.listeners.set(id, { handler, filter });
    return () => {
      this.listeners.delete(id);
    };
  }

  /**
   * Publish an event to all matching subscribers.
   */
  publish(event: AutopilotEvent): void {
    for (const [_id, { handler, filter }] of this.listeners) {
      if (this.matches(event, filter)) {
        try {
          handler(event);
        } catch {
          // Don't let one bad listener break others
        }
      }
    }
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }

  private matches(event: AutopilotEvent, filter: EventSubscription): boolean {
    if (filter.eventTypes?.length && !filter.eventTypes.includes(event.eventType)) return false;
    if (filter.inboxIds?.length && event.inboxId && !filter.inboxIds.includes(event.inboxId)) return false;
    if (filter.podIds?.length && event.podId && !filter.podIds.includes(event.podId)) return false;
    return true;
  }
}
