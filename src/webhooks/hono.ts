import type { AutopilotServer } from '../server.js';
import { WebhookHandlerCore, type WebhookHandlerOptions } from './handler.js';
import { defaultLogger } from '../config.js';

/**
 * Create a Hono handler for SES/SNS webhooks.
 *
 * Usage:
 * ```ts
 * app.post('/webhooks/ses', createHonoWebhookHandler(server));
 * ```
 */
export function createHonoWebhookHandler(server: AutopilotServer, options?: WebhookHandlerOptions): (c: any) => Promise<any> {
  const config = (server as any).config;
  const logger = config?.logger ?? defaultLogger;
  const handler = new WebhookHandlerCore(server, config?.s3, logger, options);

  return async (c: any) => {
    const body = await c.req.text();
    const headers: Record<string, string | string[] | undefined> = {};
    for (const [key, value] of c.req.raw.headers.entries()) {
      headers[key.toLowerCase()] = value;
    }

    const response = await handler.handleRequest({
      body,
      headers,
      method: c.req.method,
    });

    return c.json(response.body ? JSON.parse(response.body) : {}, response.status, response.headers);
  };
}
