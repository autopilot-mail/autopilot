import { simpleParser, type ParsedMail } from 'mailparser';
import { generateId } from '../util/id.js';

export interface ParsedEmail {
  messageId?: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  subject?: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  headers: Record<string, string>;
  attachments: Array<{
    attachmentId: string;
    filename?: string;
    contentType?: string;
    contentId?: string;
    contentDisposition?: string;
    size: number;
    content: Buffer;
  }>;
  date?: Date;
  size: number;
}

export async function parseRawEmail(raw: Buffer | string): Promise<ParsedEmail> {
  const parsed: ParsedMail = await simpleParser(raw);

  const headers: Record<string, string> = {};
  if (parsed.headers) {
    for (const [key, value] of parsed.headers) {
      headers[key] = typeof value === 'string' ? value : String(value);
    }
  }

  const from = parsed.from?.value?.[0]?.address ?? parsed.from?.text ?? '';

  const to = parsed.to ? ((Array.isArray(parsed.to) ? parsed.to : [parsed.to]).flatMap((addr) => addr.value.map((v) => v.address ?? v.name)).filter(Boolean) as string[]) : [];

  const cc = parsed.cc ? ((Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]).flatMap((addr) => addr.value.map((v) => v.address ?? v.name)).filter(Boolean) as string[]) : undefined;

  const replyTo = parsed.replyTo ? (parsed.replyTo.value.map((v) => v.address).filter(Boolean) as string[]) : undefined;

  const attachments = (parsed.attachments ?? []).map((att) => ({
    attachmentId: generateId('attachment'),
    filename: att.filename,
    contentType: att.contentType,
    contentId: att.cid,
    contentDisposition: att.contentDisposition,
    size: att.size,
    content: att.content,
  }));

  const rawStr = typeof raw === 'string' ? raw : raw.toString('utf-8');

  return {
    messageId: parsed.messageId,
    from,
    to,
    cc,
    replyTo,
    subject: parsed.subject,
    text: typeof parsed.text === 'string' ? parsed.text : undefined,
    html: typeof parsed.html === 'string' ? parsed.html : undefined,
    inReplyTo: parsed.inReplyTo ? (typeof parsed.inReplyTo === 'string' ? parsed.inReplyTo : String(parsed.inReplyTo)) : undefined,
    references: parsed.references ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references]) : undefined,
    headers,
    attachments,
    date: parsed.date,
    size: rawStr.length,
  };
}

export function createPreview(text?: string, html?: string, maxLength = 200): string {
  const source = text ?? html?.replace(/<[^>]*>/g, '') ?? '';
  return source.slice(0, maxLength).trim();
}
