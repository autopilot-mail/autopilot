# Configuration

Autopilot can be configured programmatically (via `AutopilotServer` constructor) or with a TOML file (for the standalone server).

## TOML Config

The standalone server (`@autopilot-mail/server`) reads `autopilot.toml`:

```toml
[server]
port = 3100
host = "0.0.0.0"
domain = "mail.myapp.com"
api_keys = ["your-secret-key"]

[storage]
adapter = "postgres"
connection_string = "postgresql://user:pass@localhost:5432/autopilot"

[transport]
adapter = "ses"
region = "us-east-1"

[file_storage]
adapter = "s3"
region = "us-east-1"
bucket = "my-autopilot-files"

[s3]
region = "us-east-1"
bucket = "my-ses-inbound"

[webhooks]
dispatch = true
ses_endpoint = "/webhooks/ses"
verify_sns_signature = true

[logging]
level = "info"
```

## Config Reference

### `[server]`

| Key        | Type     | Default     | Description                              |
| ---------- | -------- | ----------- | ---------------------------------------- |
| `port`     | number   | `3100`      | HTTP port                                |
| `host`     | string   | `0.0.0.0`   | Bind address                             |
| `domain`   | string   | `localhost` | Default domain for new inboxes           |
| `pod_id`   | string   | `default`   | Pod ID for multi-tenant isolation        |
| `api_keys` | string[] | none        | Bearer tokens for auth. Omit for no auth |

### `[storage]`

| Key                 | Type   | Options                                         | Description                |
| ------------------- | ------ | ----------------------------------------------- | -------------------------- |
| `adapter`           | string | `postgres`, `mongodb`, `sqlite`, `d1`, `memory` | Database backend           |
| `connection_string` | string |                                                 | Postgres or MongoDB URI    |
| `database`          | string |                                                 | MongoDB database name      |
| `filename`          | string |                                                 | SQLite file path           |
| `schema`            | string | `autopilot`                                     | Postgres schema name       |
| `account_id`        | string |                                                 | Cloudflare account ID (D1) |
| `database_id`       | string |                                                 | D1 database ID             |
| `api_token`         | string |                                                 | Cloudflare API token (D1)  |

### `[transport]`

| Key       | Type    | Options               | Description           |
| --------- | ------- | --------------------- | --------------------- |
| `adapter` | string  | `ses`, `smtp`, `noop` | Email sending backend |
| `region`  | string  |                       | AWS region (SES)      |
| `host`    | string  |                       | SMTP host             |
| `port`    | number  | `587`                 | SMTP port             |
| `secure`  | boolean | `false`               | SMTP TLS              |
| `user`    | string  |                       | SMTP username         |
| `pass`    | string  |                       | SMTP password         |

### `[file_storage]`

| Key                 | Type   | Options                                 | Description                |
| ------------------- | ------ | --------------------------------------- | -------------------------- |
| `adapter`           | string | `s3`, `r2`, `archil`, `local`, `memory` | File storage backend       |
| `region`            | string |                                         | AWS/Cloudflare region      |
| `bucket`            | string |                                         | S3/R2 bucket name          |
| `prefix`            | string | `autopilot`                             | Key prefix                 |
| `account_id`        | string |                                         | Cloudflare account ID (R2) |
| `access_key_id`     | string |                                         | R2 access key              |
| `secret_access_key` | string |                                         | R2 secret key              |
| `disk_name`         | string |                                         | Archil disk name           |
| `auth_token`        | string |                                         | Archil disk token          |
| `directory`         | string |                                         | Local filesystem path      |

### `[webhooks]`

| Key                    | Type    | Default | Description                                |
| ---------------------- | ------- | ------- | ------------------------------------------ |
| `dispatch`             | boolean | `false` | Dispatch events to registered webhook URLs |
| `ses_endpoint`         | string  | none    | Mount SES/SNS webhook handler at this path |
| `verify_sns_signature` | boolean | `true`  | Verify SNS message signatures              |

### `[logging]`

| Key     | Type   | Default | Options                          |
| ------- | ------ | ------- | -------------------------------- |
| `level` | string | `info`  | `debug`, `info`, `warn`, `error` |

## Environment Variables

When no TOML config file is found, the server falls back to environment variables:

| Variable       | Maps to                                                  |
| -------------- | -------------------------------------------------------- |
| `PORT`         | `server.port`                                            |
| `HOST`         | `server.host`                                            |
| `DOMAIN`       | `server.domain`                                          |
| `API_KEYS`     | `server.api_keys` (comma-separated)                      |
| `DATABASE_URL` | `storage.adapter=postgres` + `storage.connection_string` |
| `MONGO_URI`    | `storage.adapter=mongodb` + `storage.connection_string`  |
| `SQLITE_PATH`  | `storage.adapter=sqlite` + `storage.filename`            |
| `SES_REGION`   | `transport.adapter=ses` + `transport.region`             |
| `SMTP_HOST`    | `transport.adapter=smtp` + `transport.host`              |
| `SMTP_PORT`    | `transport.port`                                         |
| `SMTP_USER`    | `transport.user`                                         |
| `SMTP_PASS`    | `transport.pass`                                         |
| `S3_BUCKET`    | `s3.bucket`                                              |
| `S3_REGION`    | `s3.region`                                              |
