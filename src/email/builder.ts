import type { TransportSendParams } from '../transport/adapter.js';

/**
 * Build a raw RFC 5322 MIME message from send params.
 *
 * Uses nodemailer's MailComposer for proper MIME construction —
 * handles content-transfer-encoding, RFC 2047 header encoding,
 * multipart boundaries, and attachment encoding correctly.
 */
export async function buildMimeMessage(params: TransportSendParams): Promise<string> {
  // Dynamic import — nodemailer is needed for proper MIME construction
  const MailComposer = (await import('nodemailer/lib/mail-composer.js' as string)).default;

  const mailOptions: Record<string, unknown> = {
    from: params.from,
    to: params.to.join(', '),
    subject: params.subject,
  };

  if (params.cc?.length) mailOptions.cc = params.cc.join(', ');
  if (params.bcc?.length) mailOptions.bcc = params.bcc.join(', ');
  if (params.replyTo?.length) mailOptions.replyTo = params.replyTo.join(', ');
  if (params.text) mailOptions.text = params.text;
  if (params.html) mailOptions.html = params.html;
  if (params.inReplyTo) mailOptions.inReplyTo = params.inReplyTo;
  if (params.references?.length) mailOptions.references = params.references.join(' ');

  if (params.headers) {
    mailOptions.headers = params.headers;
  }

  if (params.attachments?.length) {
    mailOptions.attachments = params.attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
      cid: att.contentId,
      contentDisposition: att.contentDisposition ?? 'attachment',
    }));
  }

  const composer = new MailComposer(mailOptions);

  return new Promise<string>((resolve, reject) => {
    composer.compile().build((err: Error | null, message: Buffer) => {
      if (err) return reject(err);
      resolve(message.toString());
    });
  });
}
