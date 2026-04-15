# File Storage Providers

File storage handles raw MIME messages and attachments separately from the database. **Optional** — if not configured, files are stored inline in the storage adapter.

## Available Providers

| Provider      | Package                           | Peer Deps                                     | Presigned URLs |
| ------------- | --------------------------------- | --------------------------------------------- | -------------- |
| AWS S3        | `@autopilot-mail/s3`              | `@aws-sdk/client-s3`                          | Yes            |
| Cloudflare R2 | `@autopilot-mail/r2`              | `@aws-sdk/client-s3`                          | Yes            |
| Archil        | `@autopilot-mail/archil`          | `@archildata/client`, `@archildata/just-bash` | No             |
| Local disk    | `@autopilot-mail/core` (built-in) | none                                          | `file://` URLs |
| In-Memory     | `@autopilot-mail/core` (built-in) | none                                          | `data:` URLs   |

## AWS S3

```bash
npm install @autopilot-mail/s3 @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

```typescript
import { S3FileStorage } from '@autopilot-mail/s3';

const fileStorage = new S3FileStorage({
  region: 'us-east-1',
  bucket: 'my-autopilot-files',
  prefix: 'autopilot', // key prefix (default: 'autopilot')
});
```

Layout: `{prefix}/raw/{messageId}` and `{prefix}/attachments/{messageId}/{attachmentId}`.

## Cloudflare R2

```bash
npm install @autopilot-mail/r2 @aws-sdk/client-s3
```

```typescript
import { R2FileStorage } from '@autopilot-mail/r2';

const fileStorage = new R2FileStorage({
  accountId: 'your-cloudflare-account-id',
  bucket: 'autopilot-files',
  accessKeyId: 'your-r2-access-key',
  secretAccessKey: 'your-r2-secret-key',
  prefix: 'autopilot',
  jurisdiction: 'eu', // optional: 'eu' or 'fedramp'
});
```

S3-compatible via endpoint override. **10 GB free** on Cloudflare's free tier.

## Archil

```bash
npm install @autopilot-mail/archil @archildata/client @archildata/just-bash
```

```typescript
import { ArchilFileStorage } from '@autopilot-mail/archil';

const fileStorage = new ArchilFileStorage({
  region: 'aws-us-east-1',
  diskName: 'myorg/mydisk',
  authToken: process.env.ARCHIL_DISK_TOKEN,
  prefix: '/autopilot',
});
```

Filesystem-based storage on Archil disks. Metadata stored in `.meta` sidecar files.

## Local Disk

```typescript
import { LocalFileStorage } from '@autopilot-mail/core/file-storage/local';

const fileStorage = new LocalFileStorage({
  directory: './autopilot-files',
});
```

## Wiring It Up

Pass `fileStorage` to the server constructor:

```typescript
const server = new AutopilotServer({
  storage: new PostgresStorageAdapter({ ... }),
  transport: new SesTransport({ ... }),
  fileStorage: new S3FileStorage({ ... }),  // <-- here
  defaultDomain: 'mail.myapp.com',
});
```

When configured, raw messages and attachments are stored through the file storage provider instead of inline in the database.

## Custom Provider

```typescript
import type { FileStorageProvider } from '@autopilot-mail/core';

class GCSFileStorage implements FileStorageProvider {
  async putRawMessage(messageId: string, content: Buffer) {
    /* ... */
  }
  async getRawMessage(messageId: string): Promise<Buffer | null> {
    /* ... */
  }
  async putAttachment(messageId, attachmentId, content, metadata?) {
    /* ... */
  }
  async getAttachment(messageId, attachmentId) {
    /* ... */
  }
  async getAttachmentUrl?(messageId, attachmentId, expiresInSeconds?) {
    /* ... */
  }
}
```
