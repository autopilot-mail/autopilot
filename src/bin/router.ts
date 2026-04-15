import { Hono } from 'hono';
import type { AutopilotServer } from '../server.js';

export function createRouter(server: AutopilotServer, apiKeys?: string[]): Hono {
  const app = new Hono();

  // ── Auth middleware ──
  if (apiKeys?.length) {
    app.use('/v0/*', async (c, next) => {
      const auth = c.req.header('Authorization');
      if (!auth) return c.json({ error: 'Missing Authorization header' }, 401);
      const token = auth.replace(/^Bearer\s+/i, '');
      if (!apiKeys.includes(token)) return c.json({ error: 'Invalid API key' }, 401);
      await next();
    });
  }

  // ── Health ──
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // ── Inboxes ──

  app.post('/v0/inboxes', async (c) => {
    const body = await c.req.json();
    const inbox = await server.inboxes.create({
      username: body.username,
      domain: body.domain,
      displayName: body.display_name ?? body.displayName,
      clientId: body.client_id ?? body.clientId,
    });
    return c.json(serializeInbox(inbox), 201);
  });

  app.get('/v0/inboxes', async (c) => {
    const limit = intParam(c, 'limit');
    const pageToken = c.req.query('page_token');
    const result = await server.inboxes.list({ limit, pageToken });
    return c.json({ ...result, inboxes: result.inboxes.map(serializeInbox) });
  });

  app.get('/v0/inboxes/:inbox_id', async (c) => {
    const inbox = await server.inboxes.get(c.req.param('inbox_id'));
    return c.json(serializeInbox(inbox));
  });

  app.patch('/v0/inboxes/:inbox_id', async (c) => {
    const body = await c.req.json();
    const inbox = await server.inboxes.update(c.req.param('inbox_id'), {
      displayName: body.display_name ?? body.displayName,
    });
    return c.json(serializeInbox(inbox));
  });

  app.delete('/v0/inboxes/:inbox_id', async (c) => {
    await server.inboxes.delete(c.req.param('inbox_id'));
    return c.json({ ok: true });
  });

  // ── Messages ──

  app.post('/v0/inboxes/:inbox_id/messages/send', async (c) => {
    const body = await c.req.json();
    const result = await server.inboxes.messages.send(c.req.param('inbox_id'), {
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      replyTo: body.reply_to ?? body.replyTo,
      labels: body.labels,
      attachments: body.attachments,
      headers: body.headers,
    });
    return c.json(serializeSendResponse(result), 201);
  });

  app.get('/v0/inboxes/:inbox_id/messages', async (c) => {
    const limit = intParam(c, 'limit');
    const pageToken = c.req.query('page_token');
    const labels = c.req.query('labels') ? JSON.parse(c.req.query('labels')!) : undefined;
    const result = await server.inboxes.messages.list(c.req.param('inbox_id'), { limit, pageToken, labels });
    return c.json({ ...result, messages: result.messages.map(serializeMessage) });
  });

  app.get('/v0/inboxes/:inbox_id/messages/:message_id', async (c) => {
    const msg = await server.inboxes.messages.get(c.req.param('inbox_id'), c.req.param('message_id'));
    return c.json(serializeMessage(msg));
  });

  app.post('/v0/inboxes/:inbox_id/messages/:message_id/reply', async (c) => {
    const body = await c.req.json();
    const result = await server.inboxes.messages.reply(c.req.param('inbox_id'), c.req.param('message_id'), {
      text: body.text,
      html: body.html,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      replyTo: body.reply_to ?? body.replyTo,
      labels: body.labels,
      attachments: body.attachments,
    });
    return c.json(serializeSendResponse(result), 201);
  });

  app.post('/v0/inboxes/:inbox_id/messages/:message_id/reply-all', async (c) => {
    const body = await c.req.json();
    const result = await server.inboxes.messages.replyAll(c.req.param('inbox_id'), c.req.param('message_id'), {
      text: body.text,
      html: body.html,
      replyTo: body.reply_to ?? body.replyTo,
      labels: body.labels,
      attachments: body.attachments,
    });
    return c.json(serializeSendResponse(result), 201);
  });

  app.post('/v0/inboxes/:inbox_id/messages/:message_id/forward', async (c) => {
    const body = await c.req.json();
    const result = await server.inboxes.messages.forward(c.req.param('inbox_id'), c.req.param('message_id'), {
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      text: body.text,
      html: body.html,
      replyTo: body.reply_to ?? body.replyTo,
      labels: body.labels,
      attachments: body.attachments,
    });
    return c.json(serializeSendResponse(result), 201);
  });

  app.patch('/v0/inboxes/:inbox_id/messages/:message_id', async (c) => {
    const body = await c.req.json();
    const msg = await server.inboxes.messages.update(c.req.param('inbox_id'), c.req.param('message_id'), {
      addLabels: body.add_labels ?? body.addLabels,
      removeLabels: body.remove_labels ?? body.removeLabels,
    });
    return c.json(serializeMessage(msg));
  });

  app.delete('/v0/inboxes/:inbox_id/messages/:message_id', async (c) => {
    await server.inboxes.messages.delete(c.req.param('inbox_id'), c.req.param('message_id'));
    return c.json({ ok: true });
  });

  app.get('/v0/inboxes/:inbox_id/messages/:message_id/raw', async (c) => {
    const raw = await server.inboxes.messages.getRaw(c.req.param('inbox_id'), c.req.param('message_id'));
    return new Response(raw, { headers: { 'Content-Type': 'message/rfc822' } });
  });

  app.get('/v0/inboxes/:inbox_id/messages/:message_id/attachments/:attachment_id', async (c) => {
    const att = await server.inboxes.messages.getAttachment(c.req.param('inbox_id'), c.req.param('message_id'), c.req.param('attachment_id'));
    return c.json(att);
  });

  // ── Threads ──

  app.get('/v0/inboxes/:inbox_id/threads', async (c) => {
    const limit = intParam(c, 'limit');
    const pageToken = c.req.query('page_token');
    const result = await server.inboxes.threads.list(c.req.param('inbox_id'), { limit, pageToken });
    return c.json({ ...result, threads: result.threads.map(serializeThread) });
  });

  app.get('/v0/threads', async (c) => {
    const limit = intParam(c, 'limit');
    const pageToken = c.req.query('page_token');
    const result = await server.threads.list({ limit, pageToken });
    return c.json({ ...result, threads: result.threads.map(serializeThread) });
  });

  app.get('/v0/threads/:thread_id', async (c) => {
    const thread = await server.threads.get(c.req.param('thread_id'));
    return c.json({ ...serializeThread(thread), messages: thread.messages.map(serializeMessage) });
  });

  app.delete('/v0/threads/:thread_id', async (c) => {
    await server.threads.delete(c.req.param('thread_id'));
    return c.json({ ok: true });
  });

  // ── Drafts ──

  app.post('/v0/inboxes/:inbox_id/drafts', async (c) => {
    const body = await c.req.json();
    const draft = await server.inboxes.drafts.create(c.req.param('inbox_id'), {
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      replyTo: body.reply_to ?? body.replyTo,
      labels: body.labels,
      inReplyTo: body.in_reply_to ?? body.inReplyTo,
      sendAt: body.send_at ? new Date(body.send_at) : undefined,
      clientId: body.client_id ?? body.clientId,
    });
    return c.json(serializeDraft(draft), 201);
  });

  app.get('/v0/inboxes/:inbox_id/drafts', async (c) => {
    const limit = intParam(c, 'limit');
    const result = await server.inboxes.drafts.list(c.req.param('inbox_id'), { limit });
    return c.json({ ...result, drafts: result.drafts.map(serializeDraft) });
  });

  app.get('/v0/inboxes/:inbox_id/drafts/:draft_id', async (c) => {
    const draft = await server.inboxes.drafts.get(c.req.param('inbox_id'), c.req.param('draft_id'));
    return c.json(serializeDraft(draft));
  });

  app.patch('/v0/inboxes/:inbox_id/drafts/:draft_id', async (c) => {
    const body = await c.req.json();
    const draft = await server.inboxes.drafts.update(c.req.param('inbox_id'), c.req.param('draft_id'), {
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      replyTo: body.reply_to ?? body.replyTo,
      sendAt: body.send_at ? new Date(body.send_at) : undefined,
    });
    return c.json(serializeDraft(draft));
  });

  app.delete('/v0/inboxes/:inbox_id/drafts/:draft_id', async (c) => {
    await server.inboxes.drafts.delete(c.req.param('inbox_id'), c.req.param('draft_id'));
    return c.json({ ok: true });
  });

  app.post('/v0/inboxes/:inbox_id/drafts/:draft_id/send', async (c) => {
    const result = await server.inboxes.drafts.send(c.req.param('inbox_id'), c.req.param('draft_id'));
    return c.json(serializeSendResponse(result), 201);
  });

  app.get('/v0/drafts', async (c) => {
    const limit = intParam(c, 'limit');
    const result = await server.drafts.list({ limit });
    return c.json({ ...result, drafts: result.drafts.map(serializeDraft) });
  });

  app.get('/v0/drafts/:draft_id', async (c) => {
    const draft = await server.drafts.get(c.req.param('draft_id'));
    return c.json(serializeDraft(draft));
  });

  // ── Webhooks ──

  app.post('/v0/webhooks', async (c) => {
    const body = await c.req.json();
    const wh = await server.webhooks.create({
      url: body.url,
      eventTypes: body.event_types ?? body.eventTypes,
      podIds: body.pod_ids ?? body.podIds,
      inboxIds: body.inbox_ids ?? body.inboxIds,
      clientId: body.client_id ?? body.clientId,
    });
    return c.json(serializeWebhook(wh), 201);
  });

  app.get('/v0/webhooks', async (c) => {
    const limit = intParam(c, 'limit');
    const result = await server.webhooks.list({ limit });
    return c.json({ ...result, webhooks: result.webhooks.map(serializeWebhook) });
  });

  app.get('/v0/webhooks/:webhook_id', async (c) => {
    const wh = await server.webhooks.get(c.req.param('webhook_id'));
    return c.json(serializeWebhook(wh));
  });

  app.patch('/v0/webhooks/:webhook_id', async (c) => {
    const body = await c.req.json();
    const wh = await server.webhooks.update(c.req.param('webhook_id'), {
      addInboxIds: body.add_inbox_ids ?? body.addInboxIds,
      removeInboxIds: body.remove_inbox_ids ?? body.removeInboxIds,
      addPodIds: body.add_pod_ids ?? body.addPodIds,
      removePodIds: body.remove_pod_ids ?? body.removePodIds,
      enabled: body.enabled,
    });
    return c.json(serializeWebhook(wh));
  });

  app.delete('/v0/webhooks/:webhook_id', async (c) => {
    await server.webhooks.delete(c.req.param('webhook_id'));
    return c.json({ ok: true });
  });

  // ── Domains ──

  app.post('/v0/domains', async (c) => {
    const body = await c.req.json();
    const domain = await server.domains.create({
      domain: body.domain,
      feedbackEnabled: body.feedback_enabled ?? body.feedbackEnabled,
    });
    return c.json(serializeDomain(domain), 201);
  });

  app.get('/v0/domains', async (c) => {
    const limit = intParam(c, 'limit');
    const result = await server.domains.list({ limit });
    return c.json({ ...result, domains: result.domains.map(serializeDomain) });
  });

  app.get('/v0/domains/:domain_id', async (c) => {
    const domain = await server.domains.get(c.req.param('domain_id'));
    return c.json(serializeDomain(domain));
  });

  app.delete('/v0/domains/:domain_id', async (c) => {
    await server.domains.delete(c.req.param('domain_id'));
    return c.json({ ok: true });
  });

  // ── Error handler ──
  app.onError((err, c) => {
    const message = err.message ?? 'Internal server error';
    if (message.includes('not found')) return c.json({ error: message }, 404);
    if (message.includes('already exists')) return c.json({ error: message }, 409);
    console.error('[autopilot] Error:', err);
    return c.json({ error: message }, 500);
  });

  return app;
}

// ── Serializers (camelCase → snake_case for wire format) ──

function serializeInbox(inbox: any) {
  return {
    inbox_id: inbox.inboxId,
    pod_id: inbox.podId,
    email: inbox.email,
    display_name: inbox.displayName,
    client_id: inbox.clientId,
    created_at: inbox.createdAt?.toISOString(),
    updated_at: inbox.updatedAt?.toISOString(),
  };
}

function serializeMessage(msg: any) {
  return {
    message_id: msg.messageId,
    inbox_id: msg.inboxId,
    thread_id: msg.threadId,
    labels: msg.labels,
    timestamp: msg.timestamp?.toISOString(),
    from: msg.from,
    to: msg.to,
    cc: msg.cc,
    bcc: msg.bcc,
    reply_to: msg.replyTo,
    subject: msg.subject,
    preview: msg.preview,
    text: msg.text,
    html: msg.html,
    extracted_text: msg.extractedText,
    extracted_html: msg.extractedHtml,
    attachments: msg.attachments,
    in_reply_to: msg.inReplyTo,
    references: msg.references,
    headers: msg.headers,
    size: msg.size,
    created_at: msg.createdAt?.toISOString(),
    updated_at: msg.updatedAt?.toISOString(),
  };
}

function serializeThread(thread: any) {
  return {
    inbox_id: thread.inboxId,
    thread_id: thread.threadId,
    labels: thread.labels,
    timestamp: thread.timestamp?.toISOString(),
    senders: thread.senders,
    recipients: thread.recipients,
    subject: thread.subject,
    preview: thread.preview,
    attachments: thread.attachments,
    last_message_id: thread.lastMessageId,
    message_count: thread.messageCount,
    size: thread.size,
    created_at: thread.createdAt?.toISOString(),
    updated_at: thread.updatedAt?.toISOString(),
  };
}

function serializeSendResponse(result: any) {
  return {
    message_id: result.messageId,
    thread_id: result.threadId,
    timestamp: result.timestamp?.toISOString(),
  };
}

function serializeDraft(draft: any) {
  return {
    draft_id: draft.draftId,
    inbox_id: draft.inboxId,
    client_id: draft.clientId,
    labels: draft.labels,
    reply_to: draft.replyTo,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    preview: draft.preview,
    text: draft.text,
    html: draft.html,
    attachments: draft.attachments,
    in_reply_to: draft.inReplyTo,
    references: draft.references,
    send_status: draft.sendStatus,
    send_at: draft.sendAt?.toISOString(),
    created_at: draft.createdAt?.toISOString(),
    updated_at: draft.updatedAt?.toISOString(),
  };
}

function serializeWebhook(wh: any) {
  return {
    webhook_id: wh.webhookId,
    url: wh.url,
    event_types: wh.eventTypes,
    pod_ids: wh.podIds,
    inbox_ids: wh.inboxIds,
    secret: wh.secret,
    enabled: wh.enabled,
    client_id: wh.clientId,
    created_at: wh.createdAt?.toISOString(),
    updated_at: wh.updatedAt?.toISOString(),
  };
}

function serializeDomain(domain: any) {
  return {
    domain_id: domain.domainId,
    pod_id: domain.podId,
    domain: domain.domain,
    status: domain.status,
    feedback_enabled: domain.feedbackEnabled,
    records: domain.records,
    client_id: domain.clientId,
    created_at: domain.createdAt?.toISOString(),
    updated_at: domain.updatedAt?.toISOString(),
  };
}

function intParam(c: any, name: string): number | undefined {
  const v = c.req.query(name);
  return v ? Number(v) : undefined;
}
