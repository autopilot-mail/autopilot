import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
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

/**
 * Extract email addresses from a mailparser AddressObject.
 * mailparser returns AddressObject | AddressObject[] for to/cc/bcc fields.
 */
function extractAddresses(field: AddressObject | AddressObject[] | undefined): string[] {
  if (!field) return [];
  const objects = Array.isArray(field) ? field : [field];
  return objects.flatMap((obj) => obj.value.map((entry) => entry.address).filter((addr): addr is string => !!addr));
}

/**
 * Parse a raw RFC 5322 MIME email into a structured ParsedEmail.
 * Uses mailparser's simpleParser for all heavy lifting.
 */
export async function parseRawEmail(raw: Buffer | string): Promise<ParsedEmail> {
  const parsed: ParsedMail = await simpleParser(raw);

  // Extract headers as a flat key-value map
  const headers: Record<string, string> = {};
  if (parsed.headers) {
    for (const [key, value] of parsed.headers) {
      headers[key] = typeof value === 'string' ? value : typeof value === 'object' && value !== null && 'text' in value ? (value as { text: string }).text : String(value);
    }
  }

  // Use mailparser's parsed address fields directly
  const from = parsed.from?.value?.[0]?.address ?? parsed.from?.text ?? '';
  const to = extractAddresses(parsed.to);
  const cc = extractAddresses(parsed.cc);
  const bcc = extractAddresses(parsed.bcc);
  const replyTo = parsed.replyTo ? parsed.replyTo.value.map((v) => v.address).filter((a): a is string => !!a) : undefined;

  // Use mailparser's attachment parsing — it handles all MIME content-transfer-encodings
  const attachments = (parsed.attachments ?? []).map((att) => ({
    attachmentId: generateId('attachment'),
    filename: att.filename,
    contentType: att.contentType,
    contentId: att.cid,
    contentDisposition: att.contentDisposition,
    size: att.size,
    content: att.content,
  }));

  // mailparser handles text/html extraction, charset decoding, and content-transfer-encoding
  const rawBytes = typeof raw === 'string' ? Buffer.from(raw) : raw;

  return {
    messageId: parsed.messageId,
    from,
    to,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    replyTo,
    subject: parsed.subject,
    text: parsed.text ?? undefined,
    html: typeof parsed.html === 'string' ? parsed.html : undefined,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references]) : undefined,
    headers,
    attachments,
    date: parsed.date,
    size: rawBytes.length,
  };
}

/**
 * Create a short preview from the text or HTML body.
 */
export function createPreview(text?: string, html?: string, maxLength = 200): string {
  const source = text ?? html?.replace(/<[^>]*>/g, '') ?? '';
  return source.slice(0, maxLength).trim();
}
