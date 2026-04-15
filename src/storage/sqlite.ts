import type { StorageAdapter } from './adapter.js';
import type { Inbox, CreateInboxParams, UpdateInboxParams, ListInboxesParams, ListInboxesResponse } from '../types/inbox.js';
import type { Message, ListMessagesParams, ListMessagesResponse, UpdateMessageParams } from '../types/message.js';
import type { ThreadItem, Thread, ListThreadsParams, ListThreadsResponse, UpdateThreadParams } from '../types/thread.js';
import type { Draft, CreateDraftParams, UpdateDraftParams, ListDraftsParams, ListDraftsResponse } from '../types/draft.js';
import type { Webhook, CreateWebhookParams, UpdateWebhookParams, ListWebhooksParams, ListWebhooksResponse } from '../types/webhook.js';
import type { Domain, CreateDomainParams, UpdateDomainParams, ListDomainsParams, ListDomainsResponse, VerificationRecord } from '../types/domain.js';
import type { AttachmentData, AttachmentResponse } from '../types/attachment.js';
import type { EventTypeValue } from '../types/event.js';

export interface SqliteStorageConfig {
  filename: string; // path to .db file, or ':memory:'
}

/**
 * SQLite storage adapter using better-sqlite3.
 * Good for single-process deployments and local development.
 */
export class SqliteStorageAdapter implements StorageAdapter {
  private db: any; // better-sqlite3 Database

  constructor(private config: SqliteStorageConfig) {}

  async initialize(): Promise<void> {
    const Database = (await import('better-sqlite3')).default;
    this.db = new Database(this.config.filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inboxes (
        inbox_id TEXT PRIMARY KEY,
        pod_id TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT,
        client_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        message_id TEXT PRIMARY KEY,
        inbox_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        labels TEXT NOT NULL DEFAULT '[]',
        timestamp TEXT NOT NULL,
        "from" TEXT NOT NULL,
        "to" TEXT NOT NULL DEFAULT '[]',
        cc TEXT,
        bcc TEXT,
        reply_to TEXT,
        subject TEXT,
        preview TEXT,
        text_content TEXT,
        html TEXT,
        extracted_text TEXT,
        extracted_html TEXT,
        attachments TEXT DEFAULT '[]',
        in_reply_to TEXT,
        "references" TEXT,
        headers TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS threads (
        thread_id TEXT PRIMARY KEY,
        inbox_id TEXT NOT NULL,
        labels TEXT NOT NULL DEFAULT '[]',
        timestamp TEXT NOT NULL,
        received_timestamp TEXT,
        sent_timestamp TEXT,
        senders TEXT NOT NULL DEFAULT '[]',
        recipients TEXT NOT NULL DEFAULT '[]',
        subject TEXT,
        preview TEXT,
        attachments TEXT DEFAULT '[]',
        last_message_id TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS drafts (
        draft_id TEXT PRIMARY KEY,
        inbox_id TEXT NOT NULL,
        client_id TEXT,
        labels TEXT NOT NULL DEFAULT '[]',
        reply_to TEXT,
        "to" TEXT,
        cc TEXT,
        bcc TEXT,
        subject TEXT,
        text_content TEXT,
        html TEXT,
        attachments TEXT DEFAULT '[]',
        in_reply_to TEXT,
        "references" TEXT,
        send_status TEXT,
        send_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS webhooks (
        webhook_id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        event_types TEXT NOT NULL DEFAULT '[]',
        pod_ids TEXT,
        inbox_ids TEXT,
        secret TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        client_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS domains (
        domain_id TEXT PRIMARY KEY,
        pod_id TEXT,
        domain TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'NOT_STARTED',
        feedback_enabled INTEGER NOT NULL DEFAULT 0,
        records TEXT NOT NULL DEFAULT '[]',
        client_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS raw_messages (
        message_id TEXT PRIMARY KEY,
        raw BLOB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attachments (
        message_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        filename TEXT,
        content_type TEXT,
        content BLOB NOT NULL,
        PRIMARY KEY (message_id, attachment_id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_inbox ON messages(inbox_id);
      CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_messages_in_reply_to ON messages(in_reply_to);
      CREATE INDEX IF NOT EXISTS idx_threads_inbox ON threads(inbox_id);
      CREATE INDEX IF NOT EXISTS idx_drafts_inbox ON drafts(inbox_id);
    `);
  }

  async close(): Promise<void> {
    if (this.db) this.db.close();
  }

  private jp(val: unknown): string {
    return JSON.stringify(val);
  }
  private pp(val: string | null | undefined): unknown {
    return val ? JSON.parse(val) : undefined;
  }

  // ── Inbox ──

  async createInbox(params: CreateInboxParams & { inboxId: string; email: string; podId: string }): Promise<Inbox> {
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT INTO inboxes (inbox_id, pod_id, email, display_name, client_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`)
      .run(params.inboxId, params.podId, params.email.toLowerCase(), params.displayName ?? null, params.clientId ?? null, now, now);
    return { podId: params.podId, inboxId: params.inboxId, email: params.email, displayName: params.displayName, clientId: params.clientId, createdAt: new Date(now), updatedAt: new Date(now) };
  }

  async getInbox(inboxId: string): Promise<Inbox | null> {
    const row = this.db.prepare(`SELECT * FROM inboxes WHERE inbox_id = ?`).get(inboxId);
    return row ? this.mapInbox(row) : null;
  }

  async getInboxByEmail(email: string): Promise<Inbox | null> {
    const row = this.db.prepare(`SELECT * FROM inboxes WHERE email = ?`).get(email.toLowerCase());
    return row ? this.mapInbox(row) : null;
  }

  async listInboxes(params: ListInboxesParams): Promise<ListInboxesResponse> {
    const limit = params.limit ?? 25;
    const rows = this.db.prepare(`SELECT * FROM inboxes ORDER BY created_at DESC LIMIT ?`).all(limit);
    return { count: rows.length, limit, inboxes: rows.map((r: any) => this.mapInbox(r)) };
  }

  async updateInbox(inboxId: string, params: UpdateInboxParams): Promise<Inbox> {
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE inboxes SET display_name = ?, updated_at = ? WHERE inbox_id = ?`).run(params.displayName, now, inboxId);
    const updated = await this.getInbox(inboxId);
    if (!updated) throw new Error(`Inbox not found: ${inboxId}`);
    return updated;
  }

  async deleteInbox(inboxId: string): Promise<void> {
    this.db.prepare(`DELETE FROM inboxes WHERE inbox_id = ?`).run(inboxId);
  }

  // ── Message ──

  async createMessage(message: Message): Promise<Message> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO messages (message_id, inbox_id, thread_id, labels, timestamp, "from", "to", cc, bcc, reply_to,
       subject, preview, text_content, html, extracted_text, extracted_html, attachments, in_reply_to, "references", headers, size, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        message.messageId,
        message.inboxId,
        message.threadId,
        this.jp(message.labels),
        message.timestamp.toISOString(),
        Array.isArray(message.from) ? message.from[0] : message.from,
        this.jp(message.to),
        this.jp(message.cc),
        this.jp(message.bcc),
        this.jp(message.replyTo),
        message.subject ?? null,
        message.preview ?? null,
        message.text ?? null,
        message.html ?? null,
        message.extractedText ?? null,
        message.extractedHtml ?? null,
        this.jp(message.attachments),
        message.inReplyTo ?? null,
        this.jp(message.references),
        this.jp(message.headers),
        message.size,
        now,
        now,
      );
    return message;
  }

  async getMessage(inboxId: string, messageId: string): Promise<Message | null> {
    const row = this.db.prepare(`SELECT * FROM messages WHERE message_id = ? AND inbox_id = ?`).get(messageId, inboxId);
    return row ? this.mapMessage(row) : null;
  }

  async listMessages(inboxId: string, params: ListMessagesParams): Promise<ListMessagesResponse> {
    const limit = params.limit ?? 25;
    const order = params.ascending ? 'ASC' : 'DESC';
    const rows = this.db.prepare(`SELECT * FROM messages WHERE inbox_id = ? ORDER BY timestamp ${order} LIMIT ?`).all(inboxId, limit);
    return { count: rows.length, limit, messages: rows.map((r: any) => this.mapMessage(r)) };
  }

  async updateMessage(inboxId: string, messageId: string, params: UpdateMessageParams): Promise<Message> {
    const msg = await this.getMessage(inboxId, messageId);
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    let labels = msg.labels;
    if (params.addLabels) labels = [...new Set([...labels, ...params.addLabels])];
    if (params.removeLabels) labels = labels.filter((l) => !params.removeLabels!.includes(l));
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE messages SET labels = ?, updated_at = ? WHERE message_id = ? AND inbox_id = ?`).run(this.jp(labels), now, messageId, inboxId);
    return { ...msg, labels, updatedAt: new Date(now) };
  }

  async deleteMessage(inboxId: string, messageId: string): Promise<void> {
    this.db.prepare(`DELETE FROM messages WHERE message_id = ? AND inbox_id = ?`).run(messageId, inboxId);
  }

  async storeRawMessage(messageId: string, raw: Buffer): Promise<void> {
    this.db.prepare(`INSERT OR REPLACE INTO raw_messages (message_id, raw) VALUES (?,?)`).run(messageId, raw);
  }

  async getRawMessage(messageId: string): Promise<Buffer | null> {
    const row = this.db.prepare(`SELECT raw FROM raw_messages WHERE message_id = ?`).get(messageId);
    return row ? Buffer.from(row.raw) : null;
  }

  async resolveThread(inboxId: string, inReplyTo?: string, references?: string[]): Promise<string | null> {
    if (inReplyTo) {
      const row = this.db.prepare(`SELECT thread_id FROM messages WHERE message_id = ? AND inbox_id = ? LIMIT 1`).get(inReplyTo, inboxId);
      if (row) return row.thread_id;
    }
    if (references?.length) {
      for (const ref of references) {
        const row = this.db.prepare(`SELECT thread_id FROM messages WHERE message_id = ? AND inbox_id = ? LIMIT 1`).get(ref, inboxId);
        if (row) return row.thread_id;
      }
    }
    return null;
  }

  // ── Thread ──

  async createThread(thread: ThreadItem): Promise<ThreadItem> {
    this.db
      .prepare(
        `INSERT INTO threads (thread_id, inbox_id, labels, timestamp, senders, recipients, subject, preview, attachments, last_message_id, message_count, size, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        thread.threadId,
        thread.inboxId,
        this.jp(thread.labels),
        thread.timestamp.toISOString(),
        this.jp(thread.senders),
        this.jp(thread.recipients),
        thread.subject ?? null,
        thread.preview ?? null,
        this.jp(thread.attachments),
        thread.lastMessageId,
        thread.messageCount,
        thread.size,
        thread.createdAt.toISOString(),
        thread.updatedAt.toISOString(),
      );
    return thread;
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const row = this.db.prepare(`SELECT * FROM threads WHERE thread_id = ?`).get(threadId);
    if (!row) return null;
    const item = this.mapThread(row);
    const msgRows = this.db.prepare(`SELECT * FROM messages WHERE thread_id = ? ORDER BY timestamp ASC`).all(threadId);
    return { ...item, messages: msgRows.map((r: any) => this.mapMessage(r)) };
  }

  async getThreadByInbox(inboxId: string, threadId: string): Promise<Thread | null> {
    const thread = await this.getThread(threadId);
    if (thread && thread.inboxId === inboxId) return thread;
    return null;
  }

  async listThreads(params: ListThreadsParams & { inboxId?: string }): Promise<ListThreadsResponse> {
    const limit = params.limit ?? 25;
    const order = params.ascending ? 'ASC' : 'DESC';
    let query = `SELECT * FROM threads`;
    const whereArgs: unknown[] = [];
    if (params.inboxId) {
      query += ` WHERE inbox_id = ?`;
      whereArgs.push(params.inboxId);
    }
    query += ` ORDER BY timestamp ${order} LIMIT ?`;
    whereArgs.push(limit);
    const rows = this.db.prepare(query).all(...whereArgs);
    return { count: rows.length, limit, threads: rows.map((r: any) => this.mapThread(r)) };
  }

  async updateThread(threadId: string, params: UpdateThreadParams): Promise<ThreadItem> {
    const thread = await this.getThread(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    let labels = thread.labels;
    if (params.addLabels) labels = [...new Set([...labels, ...params.addLabels])];
    if (params.removeLabels) labels = labels.filter((l) => !params.removeLabels!.includes(l));
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE threads SET labels = ?, updated_at = ? WHERE thread_id = ?`).run(this.jp(labels), now, threadId);
    return { ...thread, labels, updatedAt: new Date(now) };
  }

  async updateThreadOnNewMessage(threadId: string, message: Message): Promise<void> {
    const thread = this.db.prepare(`SELECT * FROM threads WHERE thread_id = ?`).get(threadId);
    if (!thread) return;
    const from = Array.isArray(message.from) ? message.from : [message.from];
    const to = Array.isArray(message.to) ? message.to : [message.to];
    const senders = [...new Set([...(JSON.parse(thread.senders) as string[]), ...from])];
    const recipients = [...new Set([...(JSON.parse(thread.recipients) as string[]), ...to])];
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE threads SET senders = ?, recipients = ?, last_message_id = ?, message_count = message_count + 1,
       size = size + ?, timestamp = ?, preview = ?, updated_at = ? WHERE thread_id = ?`,
      )
      .run(this.jp(senders), this.jp(recipients), message.messageId, message.size, message.timestamp.toISOString(), message.preview ?? null, now, threadId);
  }

  async deleteThread(threadId: string): Promise<void> {
    this.db.prepare(`DELETE FROM messages WHERE thread_id = ?`).run(threadId);
    this.db.prepare(`DELETE FROM threads WHERE thread_id = ?`).run(threadId);
  }

  // ── Draft (simplified) ──

  async createDraft(inboxId: string, params: CreateDraftParams & { draftId: string }): Promise<Draft> {
    const now = new Date();
    this.db
      .prepare(
        `INSERT INTO drafts (draft_id, inbox_id, client_id, labels, reply_to, "to", cc, bcc, subject, text_content, html, in_reply_to, send_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        params.draftId,
        inboxId,
        params.clientId ?? null,
        this.jp(params.labels ?? []),
        this.jp(params.replyTo),
        this.jp(params.to),
        this.jp(params.cc),
        this.jp(params.bcc),
        params.subject ?? null,
        params.text ?? null,
        params.html ?? null,
        params.inReplyTo ?? null,
        params.sendAt?.toISOString() ?? null,
        now.toISOString(),
        now.toISOString(),
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
      attachments: [],
      inReplyTo: params.inReplyTo,
      sendAt: params.sendAt,
      updatedAt: now,
      createdAt: now,
    };
  }

  async getDraft(inboxId: string, draftId: string): Promise<Draft | null> {
    const row = this.db.prepare(`SELECT * FROM drafts WHERE draft_id = ? AND inbox_id = ?`).get(draftId, inboxId);
    return row ? this.mapDraft(row) : null;
  }

  async getDraftGlobal(draftId: string): Promise<Draft | null> {
    const row = this.db.prepare(`SELECT * FROM drafts WHERE draft_id = ?`).get(draftId);
    return row ? this.mapDraft(row) : null;
  }

  async listDrafts(inboxId: string, params: ListDraftsParams): Promise<ListDraftsResponse> {
    const limit = params.limit ?? 25;
    const rows = this.db.prepare(`SELECT * FROM drafts WHERE inbox_id = ? ORDER BY created_at DESC LIMIT ?`).all(inboxId, limit);
    return { count: rows.length, limit, drafts: rows.map((r: any) => this.mapDraft(r)) };
  }

  async listDraftsGlobal(params: ListDraftsParams): Promise<ListDraftsResponse> {
    const limit = params.limit ?? 25;
    const rows = this.db.prepare(`SELECT * FROM drafts ORDER BY created_at DESC LIMIT ?`).all(limit);
    return { count: rows.length, limit, drafts: rows.map((r: any) => this.mapDraft(r)) };
  }

  async updateDraft(inboxId: string, draftId: string, params: UpdateDraftParams): Promise<Draft> {
    const draft = await this.getDraft(inboxId, draftId);
    if (!draft) throw new Error(`Draft not found: ${draftId}`);
    const now = new Date().toISOString();
    const updated = { ...draft, ...params, updatedAt: new Date(now) };
    this.db
      .prepare(
        `UPDATE drafts SET "to"=?, cc=?, bcc=?, subject=?, text_content=?, html=?, reply_to=?, send_at=?, updated_at=?
       WHERE draft_id=? AND inbox_id=?`,
      )
      .run(
        this.jp(updated.to),
        this.jp(updated.cc),
        this.jp(updated.bcc),
        updated.subject ?? null,
        updated.text ?? null,
        updated.html ?? null,
        this.jp(updated.replyTo),
        updated.sendAt?.toISOString() ?? null,
        now,
        draftId,
        inboxId,
      );
    return updated;
  }

  async deleteDraft(inboxId: string, draftId: string): Promise<void> {
    this.db.prepare(`DELETE FROM drafts WHERE draft_id = ? AND inbox_id = ?`).run(draftId, inboxId);
  }

  // ── Webhook ──

  async createWebhook(params: CreateWebhookParams & { webhookId: string; secret: string }): Promise<Webhook> {
    const now = new Date();
    this.db
      .prepare(`INSERT INTO webhooks (webhook_id, url, event_types, pod_ids, inbox_ids, secret, client_id) VALUES (?,?,?,?,?,?,?)`)
      .run(params.webhookId, params.url, this.jp(params.eventTypes), this.jp(params.podIds), this.jp(params.inboxIds), params.secret, params.clientId ?? null);
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
    const row = this.db.prepare(`SELECT * FROM webhooks WHERE webhook_id = ?`).get(webhookId);
    return row ? this.mapWebhook(row) : null;
  }

  async listWebhooks(params: ListWebhooksParams): Promise<ListWebhooksResponse> {
    const limit = params.limit ?? 25;
    const rows = this.db.prepare(`SELECT * FROM webhooks ORDER BY created_at DESC LIMIT ?`).all(limit);
    return { count: rows.length, limit, webhooks: rows.map((r: any) => this.mapWebhook(r)) };
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
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE webhooks SET inbox_ids=?, pod_ids=?, enabled=?, updated_at=? WHERE webhook_id=?`).run(this.jp(inboxIds), this.jp(podIds), enabled ? 1 : 0, now, webhookId);
    return { ...wh, inboxIds, podIds, enabled, updatedAt: new Date(now) };
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    this.db.prepare(`DELETE FROM webhooks WHERE webhook_id = ?`).run(webhookId);
  }

  async getWebhooksForEvent(eventType: EventTypeValue, inboxId: string, podId: string): Promise<Webhook[]> {
    const rows = this.db.prepare(`SELECT * FROM webhooks WHERE enabled = 1`).all();
    return (rows as any[])
      .map((r: any) => this.mapWebhook(r))
      .filter((wh) => {
        if (!wh.eventTypes.includes(eventType)) return false;
        if (wh.inboxIds?.length && !wh.inboxIds.includes(inboxId)) return false;
        if (wh.podIds?.length && !wh.podIds.includes(podId)) return false;
        return true;
      });
  }

  // ── Domain ──

  async createDomain(params: CreateDomainParams & { domainId: string; podId?: string; records: VerificationRecord[] }): Promise<Domain> {
    const now = new Date();
    this.db
      .prepare(`INSERT INTO domains (domain_id, pod_id, domain, feedback_enabled, records) VALUES (?,?,?,?,?)`)
      .run(params.domainId, params.podId ?? null, params.domain, params.feedbackEnabled ? 1 : 0, this.jp(params.records));
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
    const row = this.db.prepare(`SELECT * FROM domains WHERE domain_id = ?`).get(domainId);
    return row ? this.mapDomain(row) : null;
  }

  async getDomainByName(domain: string): Promise<Domain | null> {
    const row = this.db.prepare(`SELECT * FROM domains WHERE domain = ?`).get(domain.toLowerCase());
    return row ? this.mapDomain(row) : null;
  }

  async listDomains(params: ListDomainsParams): Promise<ListDomainsResponse> {
    const limit = params.limit ?? 25;
    const rows = this.db.prepare(`SELECT * FROM domains ORDER BY created_at DESC LIMIT ?`).all(limit);
    return { count: rows.length, limit, domains: rows.map((r: any) => this.mapDomain(r)) };
  }

  async updateDomain(domainId: string, params: UpdateDomainParams): Promise<Domain> {
    const now = new Date().toISOString();
    if (params.feedbackEnabled !== undefined) {
      this.db.prepare(`UPDATE domains SET feedback_enabled=?, updated_at=? WHERE domain_id=?`).run(params.feedbackEnabled ? 1 : 0, now, domainId);
    }
    const updated = await this.getDomain(domainId);
    if (!updated) throw new Error(`Domain not found: ${domainId}`);
    return updated;
  }

  async deleteDomain(domainId: string): Promise<void> {
    this.db.prepare(`DELETE FROM domains WHERE domain_id = ?`).run(domainId);
  }

  // ── Attachment ──

  async storeAttachment(messageId: string, attachment: { attachmentId: string; filename?: string; contentType?: string; content: Buffer }): Promise<void> {
    this.db
      .prepare(`INSERT OR REPLACE INTO attachments (message_id, attachment_id, filename, content_type, content) VALUES (?,?,?,?,?)`)
      .run(messageId, attachment.attachmentId, attachment.filename ?? null, attachment.contentType ?? null, attachment.content);
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData | null> {
    const row = this.db.prepare(`SELECT * FROM attachments WHERE message_id = ? AND attachment_id = ?`).get(messageId, attachmentId);
    if (!row) return null;
    return { content: Buffer.from(row.content), contentType: row.content_type, filename: row.filename };
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
      displayName: row.display_name ?? undefined,
      clientId: row.client_id ?? undefined,
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }

  private mapMessage(row: any): Message {
    return {
      inboxId: row.inbox_id,
      threadId: row.thread_id,
      messageId: row.message_id,
      labels: JSON.parse(row.labels ?? '[]'),
      timestamp: new Date(row.timestamp),
      from: row.from,
      to: JSON.parse(row.to ?? '[]'),
      cc: this.pp(row.cc) as any,
      bcc: this.pp(row.bcc) as any,
      replyTo: this.pp(row.reply_to) as any,
      subject: row.subject ?? undefined,
      preview: row.preview ?? undefined,
      text: row.text_content ?? undefined,
      html: row.html ?? undefined,
      extractedText: row.extracted_text ?? undefined,
      extractedHtml: row.extracted_html ?? undefined,
      attachments: JSON.parse(row.attachments ?? '[]'),
      inReplyTo: row.in_reply_to ?? undefined,
      references: this.pp(row.references) as any,
      headers: this.pp(row.headers) as any,
      size: row.size,
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }

  private mapThread(row: any): ThreadItem {
    return {
      inboxId: row.inbox_id,
      threadId: row.thread_id,
      labels: JSON.parse(row.labels ?? '[]'),
      timestamp: new Date(row.timestamp),
      receivedTimestamp: row.received_timestamp ? new Date(row.received_timestamp) : undefined,
      sentTimestamp: row.sent_timestamp ? new Date(row.sent_timestamp) : undefined,
      senders: JSON.parse(row.senders ?? '[]'),
      recipients: JSON.parse(row.recipients ?? '[]'),
      subject: row.subject ?? undefined,
      preview: row.preview ?? undefined,
      attachments: JSON.parse(row.attachments ?? '[]'),
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
      clientId: row.client_id ?? undefined,
      labels: JSON.parse(row.labels ?? '[]'),
      replyTo: this.pp(row.reply_to) as any,
      to: this.pp(row.to) as any,
      cc: this.pp(row.cc) as any,
      bcc: this.pp(row.bcc) as any,
      subject: row.subject ?? undefined,
      text: row.text_content ?? undefined,
      html: row.html ?? undefined,
      attachments: JSON.parse(row.attachments ?? '[]'),
      inReplyTo: row.in_reply_to ?? undefined,
      references: this.pp(row.references) as any,
      sendStatus: row.send_status ?? undefined,
      sendAt: row.send_at ? new Date(row.send_at) : undefined,
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }

  private mapWebhook(row: any): Webhook {
    return {
      webhookId: row.webhook_id,
      url: row.url,
      eventTypes: JSON.parse(row.event_types ?? '[]'),
      podIds: this.pp(row.pod_ids) as any,
      inboxIds: this.pp(row.inbox_ids) as any,
      secret: row.secret,
      enabled: !!row.enabled,
      clientId: row.client_id ?? undefined,
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }

  private mapDomain(row: any): Domain {
    return {
      podId: row.pod_id ?? undefined,
      domainId: row.domain_id,
      domain: row.domain,
      status: row.status as any,
      feedbackEnabled: !!row.feedback_enabled,
      records: JSON.parse(row.records ?? '[]'),
      clientId: row.client_id ?? undefined,
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }
}
