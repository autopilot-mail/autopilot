import type { TransportSendParams } from '../transport/adapter.js';

export function buildMimeMessage(params: TransportSendParams): string {
  const boundary = `----=_Part_${crypto.randomUUID().replace(/-/g, '')}`;
  const lines: string[] = [];

  lines.push(`From: ${params.from}`);
  lines.push(`To: ${params.to.join(', ')}`);
  if (params.cc?.length) lines.push(`Cc: ${params.cc.join(', ')}`);
  lines.push(`Subject: ${params.subject}`);
  if (params.replyTo?.length) lines.push(`Reply-To: ${params.replyTo.join(', ')}`);
  if (params.inReplyTo) lines.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references?.length) lines.push(`References: ${params.references.join(' ')}`);

  if (params.headers) {
    for (const [key, value] of Object.entries(params.headers)) {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push(`MIME-Version: 1.0`);

  const hasAttachments = params.attachments && params.attachments.length > 0;
  const hasHtml = !!params.html;
  const hasText = !!params.text;

  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push('');

    // Text body
    if (hasText) {
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: text/plain; charset=UTF-8`);
      lines.push(`Content-Transfer-Encoding: 7bit`);
      lines.push('');
      lines.push(params.text!);
    }

    // HTML body
    if (hasHtml) {
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: text/html; charset=UTF-8`);
      lines.push(`Content-Transfer-Encoding: 7bit`);
      lines.push('');
      lines.push(params.html!);
    }

    // Attachments
    for (const att of params.attachments!) {
      lines.push(`--${boundary}`);
      const ct = att.contentType ?? 'application/octet-stream';
      if (att.filename) {
        lines.push(`Content-Type: ${ct}; name="${att.filename}"`);
        lines.push(`Content-Disposition: ${att.contentDisposition ?? 'attachment'}; filename="${att.filename}"`);
      } else {
        lines.push(`Content-Type: ${ct}`);
      }
      if (att.contentId) {
        lines.push(`Content-ID: <${att.contentId}>`);
      }
      lines.push(`Content-Transfer-Encoding: base64`);
      lines.push('');
      lines.push(att.content.toString('base64'));
    }

    lines.push(`--${boundary}--`);
  } else if (hasHtml && hasText) {
    const altBoundary = `----=_Alt_${crypto.randomUUID().replace(/-/g, '')}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push('');
    lines.push(`--${altBoundary}`);
    lines.push(`Content-Type: text/plain; charset=UTF-8`);
    lines.push('');
    lines.push(params.text!);
    lines.push(`--${altBoundary}`);
    lines.push(`Content-Type: text/html; charset=UTF-8`);
    lines.push('');
    lines.push(params.html!);
    lines.push(`--${altBoundary}--`);
  } else if (hasHtml) {
    lines.push(`Content-Type: text/html; charset=UTF-8`);
    lines.push('');
    lines.push(params.html!);
  } else {
    lines.push(`Content-Type: text/plain; charset=UTF-8`);
    lines.push('');
    lines.push(params.text ?? '');
  }

  return lines.join('\r\n');
}
