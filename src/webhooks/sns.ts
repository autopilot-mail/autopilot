export interface SnsMessage {
  Type: 'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Subject?: string;
}

export interface SesNotification {
  notificationType: 'Received' | 'Bounce' | 'Complaint' | 'Delivery';
  receipt?: SesReceipt;
  mail: SesMail;
  bounce?: Record<string, unknown>;
  complaint?: Record<string, unknown>;
}

export interface SesReceipt {
  action: { type: string; bucketName: string; objectKey: string };
  recipients: string[];
  spamVerdict: { status: string };
  virusVerdict: { status: string };
  spfVerdict: { status: string };
  dkimVerdict: { status: string };
  dmarcVerdict: { status: string };
}

export interface SesMail {
  messageId: string;
  source: string;
  destination: string[];
  commonHeaders: {
    from: string[];
    to: string[];
    cc?: string[];
    subject: string;
    date: string;
    messageId: string;
  };
}

export function parseSnsMessage(body: string | Buffer | Record<string, unknown>): SnsMessage {
  if (typeof body === 'string') {
    return JSON.parse(body) as SnsMessage;
  }
  if (Buffer.isBuffer(body)) {
    return JSON.parse(body.toString('utf-8')) as SnsMessage;
  }
  return body as unknown as SnsMessage;
}

export function parseSesNotification(message: string): SesNotification {
  return JSON.parse(message) as SesNotification;
}

/**
 * Verify SNS message signature.
 * Fetches the signing certificate and verifies the message signature.
 */
export async function verifySnsSignature(message: SnsMessage): Promise<boolean> {
  try {
    // Validate the signing cert URL is from AWS
    const certUrl = new URL(message.SigningCertURL);
    if (!certUrl.hostname.endsWith('.amazonaws.com') || certUrl.protocol !== 'https:') {
      return false;
    }

    // Build the string to sign
    const fieldsToSign =
      message.Type === 'Notification' ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'TopicArn', 'Type'];

    const msgRecord = message as unknown as Record<string, unknown>;
    const stringToSign =
      fieldsToSign
        .filter((field) => msgRecord[field] !== undefined)
        .map((field) => `${field}\n${msgRecord[field]}`)
        .join('\n') + '\n';

    // Fetch the certificate
    const certResponse = await fetch(message.SigningCertURL);
    const certPem = await certResponse.text();

    // Web Crypto's importKey('spki', ...) expects a SubjectPublicKeyInfo — the public
    // key only, not a full X.509 certificate. AWS SNS's SigningCertURL returns a full
    // cert, so the previous implementation silently failed every verification. Node's
    // createPublicKey parses the cert and extracts the SPKI for us.
    const { createPublicKey, createVerify } = await import('node:crypto');
    const publicKey = createPublicKey(certPem);
    return createVerify('RSA-SHA1').update(stringToSign).verify(publicKey, message.Signature, 'base64');
  } catch {
    return false;
  }
}
