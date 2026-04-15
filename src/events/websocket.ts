import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { AutopilotServer } from '../server.js';
import type { EventSubscription, AutopilotEvent } from './bus.js';

export interface WebSocketServerOptions {
  apiKeys?: string[];
}

/**
 * Create a WebSocket server that streams events from the AutopilotServer event bus.
 *
 * Protocol:
 *   Client → Server:
 *     { "type": "subscribe", "inbox_ids": [...], "pod_ids": [...], "event_types": [...] }
 *     { "type": "ping" }
 *
 *   Server → Client:
 *     { "type": "event", "event_id": "...", "event_type": "...", "timestamp": "...", "data": {...} }
 *     { "type": "subscribed", "filter": {...} }
 *     { "type": "pong" }
 *     { "type": "error", "message": "..." }
 */
export function createWebSocketHandler(server: AutopilotServer, options?: WebSocketServerOptions) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket) => {
    let unsubscribe: (() => void) | null = null;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (msg.type === 'subscribe') {
          // Unsubscribe from previous filter
          if (unsubscribe) unsubscribe();

          const filter: EventSubscription = {
            inboxIds: msg.inbox_ids ?? msg.inboxIds,
            podIds: msg.pod_ids ?? msg.podIds,
            eventTypes: msg.event_types ?? msg.eventTypes,
          };

          unsubscribe = server.events.subscribe(filter, (event: AutopilotEvent) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'event',
                  event_id: event.eventId,
                  event_type: event.eventType,
                  timestamp: event.timestamp,
                  data: event.data,
                }),
              );
            }
          });

          ws.send(JSON.stringify({ type: 'subscribed', filter }));
          return;
        }

        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      if (unsubscribe) unsubscribe();
    });

    ws.on('error', () => {
      if (unsubscribe) unsubscribe();
    });
  });

  /**
   * Handle HTTP upgrade request. Call this from your Node HTTP server's 'upgrade' event.
   */
  function handleUpgrade(req: IncomingMessage, socket: any, head: Buffer): boolean {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    // Only handle /v0/ws
    if (url.pathname !== '/v0/ws') return false;

    // Auth check
    if (options?.apiKeys?.length) {
      const auth = req.headers.authorization;
      const token = auth?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token');
      if (!token || !options.apiKeys.includes(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return true;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
    return true;
  }

  return { wss, handleUpgrade };
}
