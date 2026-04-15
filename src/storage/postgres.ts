import type { StorageAdapter } from './adapter.js';
import type { Inbox, CreateInboxParams, UpdateInboxParams, ListInboxesParams, ListInboxesResponse } from '../types/inbox.js';
import type { Message, ListMessagesParams, ListMessagesResponse, UpdateMessageParams } from '../types/message.js';
import type { ThreadItem, Thread, ListThreadsParams, ListThreadsResponse, UpdateThreadParams } from '../types/thread.js';
import type { Draft, CreateDraftParams, UpdateDraftParams, ListDraftsParams, ListDraftsResponse } from '../types/draft.js';
import type { Webhook, CreateWebhookParams, UpdateWebhookParams, ListWebhooksParams, ListWebhooksResponse } from '../types/webhook.js';
import type { Domain, CreateDomainParams, UpdateDomainParams, ListDomainsParams, ListDomainsResponse, VerificationRecord } from '../types/domain.js';
import type { AttachmentData, AttachmentResponse } from '../types/attachment.js';
import type { EventTypeValue } from '../types/event.js';

export interface PostgresStorageConfig {
  connectionString: string;
  schema?: string;
  pool?: { min?: number; max?: number };
}

/**
 * PostgreSQL storage adapter using raw pg queries.
 *
 * Creates all tables in the configured schema (default: 'autopilot')
 * on first initialize() call.
 */
export class PostgresStorageAdapter implements StorageAdapter {
  private pool: any; // pg.Pool
  private schema: string;

  constructor(private config: PostgresStorageConfig) {
    this.schema = config.schema ?? 'autopilot';
  }

  async initialize(): Promise<void> {
    const pg = await import('pg');
    this.pool = new pg.default.Pool({
      connectionString: this.config.connectionString,
      min: this.config.pool?.min ?? 2,
      max: this.config.pool?.max ?? 10,
    });

    const s = this.schema;
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS "${s}"`);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "${s}".inboxes (
        inbox_id TEXT PRIMARY KEY,
        pod_id TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT,
        client_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "${s}".messages (
        message_id TEXT PRIMARY KEY,
        inbox_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        labels JSONB NOT NULL DEFAULT '[]',
        "timestamp" TIMESTAMPTZ NOT NULL,
        "from" TEXT NOT NULL,
        "to" JSONB NOT NULL,
        cc JSONB,
        bcc JSONB,
        reply_to JSONB,
        subject TEXT,
        preview TEXT,
        "text" TEXT,
        html TEXT,
        extracted_text TEXT,
        extracted_html TEXT,
        attachments JSONB DEFAULT '[]',
        in_reply_to TEXT,
        "references" JSONB,
        headers JSONB,
        size INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "${s}".threads (
        thread_id TEXT PRIMARY KEY,
        inbox_id TEXT NOT NULL,
        labels JSONB NOT NULL DEFAULT '[]',
        "timestamp" TIMESTAMPTZ NOT NULL,
        received_timestamp TIMESTAMPTZ,
        sent_timestamp TIMESTAMPTZ,
        senders JSONB NOT NULL DEFAULT '[]',
        recipients JSONB NOT NULL DEFAULT '[]',
        subject TEXT,
        preview TEXT,
        attachments JSONB DEFAULT '[]',
        last_message_id TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "${s}".drafts (
        draft_id TEXT PRIMARY KEY,
        inbox_id TEXT NOT NULL,
        client_id TEXT,
        labels JSONB NOT NULL DEFAULT '[]',
        reply_to JSONB,
        "to" JSONB,
        cc JSONB,
        bcc JSONB,
        subject TEXT,
        preview TEXT,
        "text" TEXT,
        html TEXT,
        attachments JSONB DEFAULT '[]',
        in_reply_to TEXT,
        "references" JSONB,
        send_status TEXT,
        send_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "${s}".webhooks (
        webhook_id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        event_types JSONB NOT NULL DEFAULT '[]',
        pod_ids JSONB,
        inbox_ids JSONB,
        secret TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        client_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "${s}".domains (
        domain_id TEXT PRIMARY KEY,
        pod_id TEXT,
        domain TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'NOT_STARTED',
        feedback_enabled BOOLEAN NOT NULL DEFAULT false,
        records JSONB NOT NULL DEFAULT '[]',
        client_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "${s}".raw_messages (
        message_id TEXT PRIMARY KEY,
        raw BYTEA NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "${s}".attachments (
        message_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        filename TEXT,
        content_type TEXT,
        content BYTEA NOT NULL,
        PRIMARY KEY (message_id, attachment_id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_inbox ON "${s}".messages(inbox_id);
      CREATE INDEX IF NOT EXISTS idx_messages_thread ON "${s}".messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_messages_in_reply_to ON "${s}".messages(in_reply_to);
      CREATE INDEX IF NOT EXISTS idx_threads_inbox ON "${s}".threads(inbox_id);
      CREATE INDEX IF NOT EXISTS idx_drafts_inbox ON "${s}".drafts(inbox_id);
    `);
  }

  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
  }

  private q(table: string): string {
    return `"${this.schema}"."${table}"`;
  }

  // ── Inbox ──

  async createInbox(params: CreateInboxParams & { inboxId: string; email: string; podId: string }): Promise<Inbox> {
    const { rows } = await this.pool.query(
      `INSERT INTO ${this.q('inboxes')} (inbox_id, pod_id, email, display_name, client_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [params.inboxId, params.podId, params.email, params.displayName, params.clientId],
    );
    return this.mapInbox(rows[0]);
  }

  async getInbox(inboxId: string): Promise<Inbox | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('inboxes')} WHERE inbox_id = $1`, [inboxId]);
    return rows[0] ? this.mapInbox(rows[0]) : null;
  }

  async getInboxByEmail(email: string): Promise<Inbox | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('inboxes')} WHERE email = $1`, [email.toLowerCase()]);
    return rows[0] ? this.mapInbox(rows[0]) : null;
  }

  async listInboxes(params: ListInboxesParams): Promise<ListInboxesResponse> {
    const limit = params.limit ?? 25;
    let query = `SELECT * FROM ${this.q('inboxes')} ORDER BY created_at DESC LIMIT $1`;
    const values: unknown[] = [limit + 1];

    const { rows } = await this.pool.query(query, values);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(this.mapInbox);
    return {
      count: items.length,
      limit,
      nextPageToken: hasMore ? Buffer.from(items[items.length - 1].inboxId).toString('base64url') : undefined,
      inboxes: items,
    };
  }

  async updateInbox(inboxId: string, params: UpdateInboxParams): Promise<Inbox> {
    const { rows } = await this.pool.query(`UPDATE ${this.q('inboxes')} SET display_name = $2, updated_at = NOW() WHERE inbox_id = $1 RETURNING *`, [inboxId, params.displayName]);
    if (!rows[0]) throw new Error(`Inbox not found: ${inboxId}`);
    return this.mapInbox(rows[0]);
  }

  async deleteInbox(inboxId: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.q('inboxes')} WHERE inbox_id = $1`, [inboxId]);
  }

  // ── Message ──

  async createMessage(message: Message): Promise<Message> {
    await this.pool.query(
      `INSERT INTO ${this.q('messages')}
       (message_id, inbox_id, thread_id, labels, "timestamp", "from", "to", cc, bcc, reply_to,
        subject, preview, "text", html, extracted_text, extracted_html, attachments,
        in_reply_to, "references", headers, size)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        message.messageId,
        message.inboxId,
        message.threadId,
        JSON.stringify(message.labels),
        message.timestamp,
        Array.isArray(message.from) ? message.from[0] : message.from,
        JSON.stringify(message.to),
        JSON.stringify(message.cc),
        JSON.stringify(message.bcc),
        JSON.stringify(message.replyTo),
        message.subject,
        message.preview,
        message.text,
        message.html,
        message.extractedText,
        message.extractedHtml,
        JSON.stringify(message.attachments),
        message.inReplyTo,
        JSON.stringify(message.references),
        JSON.stringify(message.headers),
        message.size,
      ],
    );
    return message;
  }

  async getMessage(inboxId: string, messageId: string): Promise<Message | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('messages')} WHERE message_id = $1 AND inbox_id = $2`, [messageId, inboxId]);
    return rows[0] ? this.mapMessage(rows[0]) : null;
  }

  async listMessages(inboxId: string, params: ListMessagesParams): Promise<ListMessagesResponse> {
    const limit = params.limit ?? 25;
    const conditions = ['inbox_id = $1'];
    const values: unknown[] = [inboxId];
    let idx = 2;

    if (params.before) {
      conditions.push(`"timestamp" < $${idx++}`);
      values.push(params.before);
    }
    if (params.after) {
      conditions.push(`"timestamp" > $${idx++}`);
      values.push(params.after);
    }
    if (!params.includeSpam) {
      conditions.push(`NOT (labels @> '"SPAM"')`);
    }
    if (!params.includeTrash) {
      conditions.push(`NOT (labels @> '"TRASH"')`);
    }

    const order = params.ascending ? 'ASC' : 'DESC';
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('messages')} WHERE ${conditions.join(' AND ')} ORDER BY "timestamp" ${order} LIMIT $${idx}`, [...values, limit + 1]);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(this.mapMessage);
    return {
      count: items.length,
      limit,
      nextPageToken: hasMore ? Buffer.from(items[items.length - 1].messageId).toString('base64url') : undefined,
      messages: items,
    };
  }

  async updateMessage(inboxId: string, messageId: string, params: UpdateMessageParams): Promise<Message> {
    const msg = await this.getMessage(inboxId, messageId);
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    let labels = msg.labels;
    if (params.addLabels) labels = [...new Set([...labels, ...params.addLabels])];
    if (params.removeLabels) labels = labels.filter((l) => !params.removeLabels!.includes(l));

    const { rows } = await this.pool.query(`UPDATE ${this.q('messages')} SET labels = $3, updated_at = NOW() WHERE message_id = $1 AND inbox_id = $2 RETURNING *`, [
      messageId,
      inboxId,
      JSON.stringify(labels),
    ]);
    return this.mapMessage(rows[0]);
  }

  async deleteMessage(inboxId: string, messageId: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.q('messages')} WHERE message_id = $1 AND inbox_id = $2`, [messageId, inboxId]);
  }

  async storeRawMessage(messageId: string, raw: Buffer): Promise<void> {
    await this.pool.query(`INSERT INTO ${this.q('raw_messages')} (message_id, raw) VALUES ($1, $2) ON CONFLICT (message_id) DO UPDATE SET raw = $2`, [messageId, raw]);
  }

  async getRawMessage(messageId: string): Promise<Buffer | null> {
    const { rows } = await this.pool.query(`SELECT raw FROM ${this.q('raw_messages')} WHERE message_id = $1`, [messageId]);
    return rows[0]?.raw ?? null;
  }

  async resolveThread(inboxId: string, inReplyTo?: string, references?: string[]): Promise<string | null> {
    if (inReplyTo) {
      const { rows } = await this.pool.query(`SELECT thread_id FROM ${this.q('messages')} WHERE message_id = $1 AND inbox_id = $2 LIMIT 1`, [inReplyTo, inboxId]);
      if (rows[0]) return rows[0].thread_id;
    }
    if (references?.length) {
      for (const ref of references) {
        const { rows } = await this.pool.query(`SELECT thread_id FROM ${this.q('messages')} WHERE message_id = $1 AND inbox_id = $2 LIMIT 1`, [ref, inboxId]);
        if (rows[0]) return rows[0].thread_id;
      }
    }
    return null;
  }

  // ── Thread ──

  async createThread(thread: ThreadItem): Promise<ThreadItem> {
    await this.pool.query(
      `INSERT INTO ${this.q('threads')}
       (thread_id, inbox_id, labels, "timestamp", senders, recipients, subject, preview,
        attachments, last_message_id, message_count, size)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        thread.threadId,
        thread.inboxId,
        JSON.stringify(thread.labels),
        thread.timestamp,
        JSON.stringify(thread.senders),
        JSON.stringify(thread.recipients),
        thread.subject,
        thread.preview,
        JSON.stringify(thread.attachments),
        thread.lastMessageId,
        thread.messageCount,
        thread.size,
      ],
    );
    return thread;
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('threads')} WHERE thread_id = $1`, [threadId]);
    if (!rows[0]) return null;
    const item = this.mapThread(rows[0]);
    const { rows: msgRows } = await this.pool.query(`SELECT * FROM ${this.q('messages')} WHERE thread_id = $1 ORDER BY "timestamp" ASC`, [threadId]);
    return { ...item, messages: msgRows.map(this.mapMessage) };
  }

  async getThreadByInbox(inboxId: string, threadId: string): Promise<Thread | null> {
    const thread = await this.getThread(threadId);
    if (thread && thread.inboxId === inboxId) return thread;
    return null;
  }

  async listThreads(params: ListThreadsParams & { inboxId?: string }): Promise<ListThreadsResponse> {
    const limit = params.limit ?? 25;
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.inboxId) {
      conditions.push(`inbox_id = $${idx++}`);
      values.push(params.inboxId);
    }
    if (params.before) {
      conditions.push(`"timestamp" < $${idx++}`);
      values.push(params.before);
    }
    if (params.after) {
      conditions.push(`"timestamp" > $${idx++}`);
      values.push(params.after);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = params.ascending ? 'ASC' : 'DESC';
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('threads')} ${where} ORDER BY "timestamp" ${order} LIMIT $${idx}`, [...values, limit + 1]);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(this.mapThread);
    return {
      count: items.length,
      limit,
      nextPageToken: hasMore ? Buffer.from(items[items.length - 1].threadId).toString('base64url') : undefined,
      threads: items,
    };
  }

  async updateThread(threadId: string, params: UpdateThreadParams): Promise<ThreadItem> {
    const thread = await this.getThread(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    let labels = thread.labels;
    if (params.addLabels) labels = [...new Set([...labels, ...params.addLabels])];
    if (params.removeLabels) labels = labels.filter((l) => !params.removeLabels!.includes(l));

    const { rows } = await this.pool.query(`UPDATE ${this.q('threads')} SET labels = $2, updated_at = NOW() WHERE thread_id = $1 RETURNING *`, [threadId, JSON.stringify(labels)]);
    return this.mapThread(rows[0]);
  }

  async updateThreadOnNewMessage(threadId: string, message: Message): Promise<void> {
    const from = Array.isArray(message.from) ? message.from : [message.from];
    const to = Array.isArray(message.to) ? message.to : [message.to];

    await this.pool.query(
      `UPDATE ${this.q('threads')} SET
        senders = (SELECT jsonb_agg(DISTINCT val) FROM (SELECT jsonb_array_elements_text(senders) AS val UNION SELECT unnest($2::text[]) AS val) t),
        recipients = (SELECT jsonb_agg(DISTINCT val) FROM (SELECT jsonb_array_elements_text(recipients) AS val UNION SELECT unnest($3::text[]) AS val) t),
        last_message_id = $4, message_count = message_count + 1, size = size + $5,
        "timestamp" = $6, preview = $7, updated_at = NOW()
       WHERE thread_id = $1`,
      [threadId, from, to, message.messageId, message.size, message.timestamp, message.preview],
    );
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.q('messages')} WHERE thread_id = $1`, [threadId]);
    await this.pool.query(`DELETE FROM ${this.q('threads')} WHERE thread_id = $1`, [threadId]);
  }

  // ── Draft ──

  async createDraft(inboxId: string, params: CreateDraftParams & { draftId: string }): Promise<Draft> {
    const now = new Date();
    await this.pool.query(
      `INSERT INTO ${this.q('drafts')}
       (draft_id, inbox_id, client_id, labels, reply_to, "to", cc, bcc, subject, "text", html, in_reply_to, send_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        params.draftId,
        inboxId,
        params.clientId,
        JSON.stringify(params.labels ?? []),
        JSON.stringify(params.replyTo),
        JSON.stringify(params.to),
        JSON.stringify(params.cc),
        JSON.stringify(params.bcc),
        params.subject,
        params.text,
        params.html,
        params.inReplyTo,
        params.sendAt,
      ],
    );
    return {
      inboxId,
      draftId: params.draftId,
      clientId: params.clientId,
      labels: params.labels ?? [],
      replyTo: params.replyTo,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      text: params.text,
      html: params.html,
      inReplyTo: params.inReplyTo,
      sendAt: params.sendAt,
      attachments: [],
      updatedAt: now,
      createdAt: now,
    };
  }

  async getDraft(inboxId: string, draftId: string): Promise<Draft | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('drafts')} WHERE draft_id = $1 AND inbox_id = $2`, [draftId, inboxId]);
    return rows[0] ? this.mapDraft(rows[0]) : null;
  }

  async getDraftGlobal(draftId: string): Promise<Draft | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('drafts')} WHERE draft_id = $1`, [draftId]);
    return rows[0] ? this.mapDraft(rows[0]) : null;
  }

  async listDrafts(inboxId: string, params: ListDraftsParams): Promise<ListDraftsResponse> {
    const limit = params.limit ?? 25;
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('drafts')} WHERE inbox_id = $1 ORDER BY created_at DESC LIMIT $2`, [inboxId, limit + 1]);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(this.mapDraft);
    return { count: items.length, limit, nextPageToken: hasMore ? Buffer.from(items[items.length - 1].draftId).toString('base64url') : undefined, drafts: items };
  }

  async listDraftsGlobal(params: ListDraftsParams): Promise<ListDraftsResponse> {
    const limit = params.limit ?? 25;
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('drafts')} ORDER BY created_at DESC LIMIT $1`, [limit + 1]);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(this.mapDraft);
    return { count: items.length, limit, nextPageToken: hasMore ? Buffer.from(items[items.length - 1].draftId).toString('base64url') : undefined, drafts: items };
  }

  async updateDraft(inboxId: string, draftId: string, params: UpdateDraftParams): Promise<Draft> {
    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let idx = 1;

    if (params.to !== undefined) {
      sets.push(`"to" = $${idx++}`);
      values.push(JSON.stringify(params.to));
    }
    if (params.cc !== undefined) {
      sets.push(`cc = $${idx++}`);
      values.push(JSON.stringify(params.cc));
    }
    if (params.bcc !== undefined) {
      sets.push(`bcc = $${idx++}`);
      values.push(JSON.stringify(params.bcc));
    }
    if (params.subject !== undefined) {
      sets.push(`subject = $${idx++}`);
      values.push(params.subject);
    }
    if (params.text !== undefined) {
      sets.push(`"text" = $${idx++}`);
      values.push(params.text);
    }
    if (params.html !== undefined) {
      sets.push(`html = $${idx++}`);
      values.push(params.html);
    }
    if (params.replyTo !== undefined) {
      sets.push(`reply_to = $${idx++}`);
      values.push(JSON.stringify(params.replyTo));
    }
    if (params.sendAt !== undefined) {
      sets.push(`send_at = $${idx++}`);
      values.push(params.sendAt);
    }

    values.push(draftId, inboxId);
    const { rows } = await this.pool.query(`UPDATE ${this.q('drafts')} SET ${sets.join(', ')} WHERE draft_id = $${idx++} AND inbox_id = $${idx} RETURNING *`, values);
    if (!rows[0]) throw new Error(`Draft not found: ${draftId}`);
    return this.mapDraft(rows[0]);
  }

  async deleteDraft(inboxId: string, draftId: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.q('drafts')} WHERE draft_id = $1 AND inbox_id = $2`, [draftId, inboxId]);
  }

  // ── Webhook ──

  async createWebhook(params: CreateWebhookParams & { webhookId: string; secret: string }): Promise<Webhook> {
    const now = new Date();
    await this.pool.query(
      `INSERT INTO ${this.q('webhooks')} (webhook_id, url, event_types, pod_ids, inbox_ids, secret, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [params.webhookId, params.url, JSON.stringify(params.eventTypes), JSON.stringify(params.podIds), JSON.stringify(params.inboxIds), params.secret, params.clientId],
    );
    return {
      webhookId: params.webhookId,
      url: params.url,
      eventTypes: params.eventTypes,
      podIds: params.podIds,
      inboxIds: params.inboxIds,
      secret: params.secret,
      enabled: true,
      clientId: params.clientId,
      updatedAt: now,
      createdAt: now,
    };
  }

  async getWebhook(webhookId: string): Promise<Webhook | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('webhooks')} WHERE webhook_id = $1`, [webhookId]);
    return rows[0] ? this.mapWebhook(rows[0]) : null;
  }

  async listWebhooks(params: ListWebhooksParams): Promise<ListWebhooksResponse> {
    const limit = params.limit ?? 25;
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('webhooks')} ORDER BY created_at DESC LIMIT $1`, [limit]);
    return { count: rows.length, limit, webhooks: rows.map(this.mapWebhook) };
  }

  async updateWebhook(webhookId: string, params: UpdateWebhookParams): Promise<Webhook> {
    const wh = await this.getWebhook(webhookId);
    if (!wh) throw new Error(`Webhook not found: ${webhookId}`);

    let inboxIds = wh.inboxIds ?? [];
    if (params.addInboxIds) inboxIds = [...inboxIds, ...params.addInboxIds];
    if (params.removeInboxIds) inboxIds = inboxIds.filter((id) => !params.removeInboxIds!.includes(id));

    let podIds = wh.podIds ?? [];
    if (params.addPodIds) podIds = [...podIds, ...params.addPodIds];
    if (params.removePodIds) podIds = podIds.filter((id) => !params.removePodIds!.includes(id));

    const enabled = params.enabled ?? wh.enabled;

    const { rows } = await this.pool.query(
      `UPDATE ${this.q('webhooks')} SET inbox_ids = $2, pod_ids = $3, enabled = $4, updated_at = NOW()
       WHERE webhook_id = $1 RETURNING *`,
      [webhookId, JSON.stringify(inboxIds), JSON.stringify(podIds), enabled],
    );
    return this.mapWebhook(rows[0]);
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.q('webhooks')} WHERE webhook_id = $1`, [webhookId]);
  }

  async getWebhooksForEvent(eventType: EventTypeValue, inboxId: string, podId: string): Promise<Webhook[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.q('webhooks')}
       WHERE enabled = true AND event_types @> $1::jsonb
       AND (inbox_ids IS NULL OR inbox_ids = '[]'::jsonb OR inbox_ids @> $2::jsonb)
       AND (pod_ids IS NULL OR pod_ids = '[]'::jsonb OR pod_ids @> $3::jsonb)`,
      [JSON.stringify([eventType]), JSON.stringify([inboxId]), JSON.stringify([podId])],
    );
    return rows.map(this.mapWebhook);
  }

  // ── Domain ──

  async createDomain(params: CreateDomainParams & { domainId: string; podId?: string; records: VerificationRecord[] }): Promise<Domain> {
    const now = new Date();
    await this.pool.query(
      `INSERT INTO ${this.q('domains')} (domain_id, pod_id, domain, feedback_enabled, records)
       VALUES ($1,$2,$3,$4,$5)`,
      [params.domainId, params.podId, params.domain, params.feedbackEnabled ?? false, JSON.stringify(params.records)],
    );
    return {
      domainId: params.domainId,
      podId: params.podId,
      domain: params.domain,
      status: 'NOT_STARTED',
      feedbackEnabled: params.feedbackEnabled ?? false,
      records: params.records,
      updatedAt: now,
      createdAt: now,
    };
  }

  async getDomain(domainId: string): Promise<Domain | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('domains')} WHERE domain_id = $1`, [domainId]);
    return rows[0] ? this.mapDomain(rows[0]) : null;
  }

  async getDomainByName(domain: string): Promise<Domain | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('domains')} WHERE domain = $1`, [domain.toLowerCase()]);
    return rows[0] ? this.mapDomain(rows[0]) : null;
  }

  async listDomains(params: ListDomainsParams): Promise<ListDomainsResponse> {
    const limit = params.limit ?? 25;
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('domains')} ORDER BY created_at DESC LIMIT $1`, [limit]);
    return { count: rows.length, limit, domains: rows.map(this.mapDomain) };
  }

  async updateDomain(domainId: string, params: UpdateDomainParams): Promise<Domain> {
    const sets = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let idx = 1;
    if (params.feedbackEnabled !== undefined) {
      sets.push(`feedback_enabled = $${idx++}`);
      values.push(params.feedbackEnabled);
    }
    values.push(domainId);
    const { rows } = await this.pool.query(`UPDATE ${this.q('domains')} SET ${sets.join(', ')} WHERE domain_id = $${idx} RETURNING *`, values);
    if (!rows[0]) throw new Error(`Domain not found: ${domainId}`);
    return this.mapDomain(rows[0]);
  }

  async deleteDomain(domainId: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.q('domains')} WHERE domain_id = $1`, [domainId]);
  }

  // ── Attachment ──

  async storeAttachment(messageId: string, attachment: { attachmentId: string; filename?: string; contentType?: string; content: Buffer }): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.q('attachments')} (message_id, attachment_id, filename, content_type, content)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (message_id, attachment_id) DO UPDATE SET content = $5`,
      [messageId, attachment.attachmentId, attachment.filename, attachment.contentType, attachment.content],
    );
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.q('attachments')} WHERE message_id = $1 AND attachment_id = $2`, [messageId, attachmentId]);
    if (!rows[0]) return null;
    return { content: rows[0].content, contentType: rows[0].content_type, filename: rows[0].filename };
  }

  async getAttachmentDownloadUrl(messageId: string, attachmentId: string): Promise<AttachmentResponse | null> {
    const data = await this.getAttachment(messageId, attachmentId);
    if (!data) return null;
    const b64 = data.content.toString('base64');
    const ct = data.contentType ?? 'application/octet-stream';
    return {
      attachmentId,
      filename: data.filename,
      size: data.content.length,
      contentType: ct,
      downloadUrl: `data:${ct};base64,${b64}`,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }

  // ── Mappers ──

  private mapInbox(row: any): Inbox {
    return {
      podId: row.pod_id,
      inboxId: row.inbox_id,
      email: row.email,
      displayName: row.display_name,
      clientId: row.client_id,
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }

  private mapMessage(row: any): Message {
    return {
      inboxId: row.inbox_id,
      threadId: row.thread_id,
      messageId: row.message_id,
      labels: row.labels ?? [],
      timestamp: new Date(row.timestamp),
      from: row.from,
      to: row.to ?? [],
      cc: row.cc,
      bcc: row.bcc,
      replyTo: row.reply_to,
      subject: row.subject,
      preview: row.preview,
      text: row.text,
      html: row.html,
      extractedText: row.extracted_text,
      extractedHtml: row.extracted_html,
      attachments: row.attachments ?? [],
      inReplyTo: row.in_reply_to,
      references: row.references,
      headers: row.headers,
      size: row.size,
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }

  private mapThread(row: any): ThreadItem {
    return {
      inboxId: row.inbox_id,
      threadId: row.thread_id,
      labels: row.labels ?? [],
      timestamp: new Date(row.timestamp),
      receivedTimestamp: row.received_timestamp ? new Date(row.received_timestamp) : undefined,
      sentTimestamp: row.sent_timestamp ? new Date(row.sent_timestamp) : undefined,
      senders: row.senders ?? [],
      recipients: row.recipients ?? [],
      subject: row.subject,
      preview: row.preview,
      attachments: row.attachments ?? [],
      lastMessageId: row.last_message_id,
      messageCount: row.message_count,
      size: row.size,
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }

  private mapDraft(row: any): Draft {
    return {
      inboxId: row.inbox_id,
      draftId: row.draft_id,
      clientId: row.client_id,
      labels: row.labels ?? [],
      replyTo: row.reply_to,
      to: row.to,
      cc: row.cc,
      bcc: row.bcc,
      subject: row.subject,
      text: row.text,
      html: row.html,
      attachments: row.attachments ?? [],
      inReplyTo: row.in_reply_to,
      references: row.references,
      sendStatus: row.send_status,
      sendAt: row.send_at ? new Date(row.send_at) : undefined,
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }

  private mapWebhook(row: any): Webhook {
    return {
      webhookId: row.webhook_id,
      url: row.url,
      eventTypes: row.event_types ?? [],
      podIds: row.pod_ids,
      inboxIds: row.inbox_ids,
      secret: row.secret,
      enabled: row.enabled,
      clientId: row.client_id,
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }

  private mapDomain(row: any): Domain {
    return {
      podId: row.pod_id,
      domainId: row.domain_id,
      domain: row.domain,
      status: row.status,
      feedbackEnabled: row.feedback_enabled,
      records: row.records ?? [],
      clientId: row.client_id,
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }
}
