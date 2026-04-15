import type { AutopilotServer } from '../server.js';
import { WebhookHandlerCore, type WebhookHandlerOptions } from './handler.js';
import { defaultLogger } from '../config.js';

/**
 * Create an Express middleware handler for SES/SNS webhooks.
 *
 * Usage:
 * ```ts
 * app.post('/webhooks/ses', createExpressWebhookHandler(server));
 * ```
 *
 * Note: Ensure your Express app parses text/plain body since SNS sends
 * notifications with Content-Type: text/plain:
 * ```ts
 * app.use(express.text({ type: 'text/plain' }));
 * ```
 */
export function createExpressWebhookHandler(server: AutopilotServer, options?: WebhookHandlerOptions): (req: any, res: any) => Promise<void> {
  const config = (server as any).config;
  const logger = config?.logger ?? defaultLogger;
  const handler = new WebhookHandlerCore(server, config?.s3, logger, options);

  return async (req: any, res: any) => {
    const headers: Record<string, string | string[] | undefined> = {};
    if (req.headers) {
      for (const [key, value] of Object.entries(req.headers)) {
        headers[key.toLowerCase()] = value as string | string[] | undefined;
      }
    }

    const response = await handler.handleRequest({
      body: req.body,
      headers,
      method: req.method,
    });

    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.set(key, value);
      }
    }
    res.send(response.body ?? '');
  };
}
