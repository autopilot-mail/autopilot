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

    // The underlying handler always returns a plain-text body like "OK", "Invalid signature",
    // or "Internal server error" — never JSON. JSON.parse("OK") throws SyntaxError and Hono
    // returns 500. Respond with c.text to pass the body through unchanged.
    return c.text(response.body ?? '', response.status as any, response.headers);
  };
}
