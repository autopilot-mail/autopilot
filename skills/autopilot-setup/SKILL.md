---
name: autopilot-setup
description: Step-by-step guide to provision all cloud infrastructure needed to run Autopilot — AWS SES domain verification, S3 bucket for inbound email, SNS topic wiring, DNS records (SPF/DKIM/DMARC), PostgreSQL database, and Docker deployment. Use when setting up a new Autopilot instance from scratch, configuring AWS for email sending/receiving, or debugging DNS/deliverability issues.
license: MIT
metadata:
  author: autopilot-mail
  version: '0.1'
---

# Autopilot Setup Guide

This guide provisions everything needed to run a self-hosted Autopilot email server. Follow the sections relevant to your stack.

## Prerequisites

- AWS CLI v2 installed and configured (`aws configure`)
- A domain you own (e.g. `mail.myapp.com`)
- Node.js 18+ or Docker

```bash
# Verify AWS CLI
aws sts get-caller-identity

# Install Autopilot
npm install @autopilot-mail/core
```

## 1. AWS SES — Domain Verification

SES requires domain verification before you can send or receive email.

```bash
DOMAIN="mail.myapp.com"
REGION="us-east-1"

# Verify the domain identity
aws sesv2 create-email-identity \
  --email-identity "$DOMAIN" \
  --region "$REGION"

# Get DKIM tokens (you'll add these as DNS records)
aws sesv2 get-email-identity \
  --email-identity "$DOMAIN" \
  --region "$REGION" \
  --query 'DkimAttributes.Tokens'
```

This returns 3 DKIM tokens. Add these DNS records:

| Type  | Name                                 | Value                         |
| ----- | ------------------------------------ | ----------------------------- |
| CNAME | `{token1}._domainkey.mail.myapp.com` | `{token1}.dkim.amazonses.com` |
| CNAME | `{token2}._domainkey.mail.myapp.com` | `{token2}.dkim.amazonses.com` |
| CNAME | `{token3}._domainkey.mail.myapp.com` | `{token3}.dkim.amazonses.com` |

Wait for verification (usually 1-72 hours):

```bash
# Check verification status
aws sesv2 get-email-identity \
  --email-identity "$DOMAIN" \
  --region "$REGION" \
  --query 'DkimAttributes.Status'
# Should return "SUCCESS"
```

### SPF and DMARC DNS Records

Add these to your domain's DNS:

| Type | Name                    | Value                                                     |
| ---- | ----------------------- | --------------------------------------------------------- |
| TXT  | `mail.myapp.com`        | `v=spf1 include:amazonses.com ~all`                       |
| TXT  | `_dmarc.mail.myapp.com` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@mail.myapp.com` |

### Request Production Access

New SES accounts are in sandbox mode (can only send to verified addresses). Request production access:

```bash
aws sesv2 put-account-details \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url "https://myapp.com" \
  --use-case-description "AI agent email infrastructure for customer communication" \
  --region "$REGION"
```

## 2. S3 Bucket — Inbound Email Storage

SES stores raw inbound emails in S3 before Autopilot processes them.

```bash
BUCKET="myapp-autopilot-inbound"
REGION="us-east-1"

# Create bucket
aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION"

# Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

# Set lifecycle to auto-delete raw emails after 30 days (optional)
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET" \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "autopilot-cleanup",
      "Status": "Enabled",
      "Filter": {"Prefix": "inbound/"},
      "Expiration": {"Days": 30}
    }]
  }'

# Grant SES permission to write to the bucket
aws s3api put-bucket-policy \
  --bucket "$BUCKET" \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ses.amazonaws.com"},
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::'"$BUCKET"'/*",
      "Condition": {
        "StringEquals": {"AWS:SourceAccount": "YOUR_AWS_ACCOUNT_ID"}
      }
    }]
  }'
```

## 3. SNS Topic — Webhook Notifications

SNS connects SES inbound receipts to your Autopilot webhook endpoint.

```bash
REGION="us-east-1"

# Create SNS topic
TOPIC_ARN=$(aws sns create-topic \
  --name "autopilot-ses-inbound" \
  --region "$REGION" \
  --query 'TopicArn' \
  --output text)

echo "Topic ARN: $TOPIC_ARN"

# Subscribe your Autopilot webhook endpoint
# Replace with your actual server URL
WEBHOOK_URL="https://your-server.com/webhooks/ses"

aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol https \
  --notification-endpoint "$WEBHOOK_URL" \
  --region "$REGION"
```

Autopilot auto-confirms SNS subscriptions — just make sure the server is running when you create the subscription.

## 4. SES Receipt Rule — Route Inbound Email

This tells SES to store inbound emails in S3 and notify via SNS.

```bash
DOMAIN="mail.myapp.com"
BUCKET="myapp-autopilot-inbound"
REGION="us-east-1"

# Create receipt rule set (if you don't have one)
aws ses create-receipt-rule-set \
  --rule-set-name "autopilot-rules" \
  --region "$REGION"

# Activate it
aws ses set-active-receipt-rule-set \
  --rule-set-name "autopilot-rules" \
  --region "$REGION"

# Create receipt rule
aws ses create-receipt-rule \
  --rule-set-name "autopilot-rules" \
  --region "$REGION" \
  --rule '{
    "Name": "autopilot-inbound",
    "Enabled": true,
    "Recipients": ["'"$DOMAIN"'"],
    "Actions": [
      {
        "S3Action": {
          "BucketName": "'"$BUCKET"'",
          "ObjectKeyPrefix": "inbound/"
        }
      },
      {
        "SNSAction": {
          "TopicArn": "'"$TOPIC_ARN"'",
          "Encoding": "UTF-8"
        }
      }
    ],
    "ScanEnabled": true
  }'
```

### MX Record

Add an MX record so email for your domain routes to SES:

| Type | Name             | Priority | Value                                  |
| ---- | ---------------- | -------- | -------------------------------------- |
| MX   | `mail.myapp.com` | 10       | `inbound-smtp.us-east-1.amazonaws.com` |

The MX endpoint varies by region. Common values:

- us-east-1: `inbound-smtp.us-east-1.amazonaws.com`
- us-west-2: `inbound-smtp.us-west-2.amazonaws.com`
- eu-west-1: `inbound-smtp.eu-west-1.amazonaws.com`

## 5. Database — PostgreSQL

### Option A: Neon (serverless, free tier)

```bash
# Sign up at https://neon.tech, create a project, get connection string
# Format: postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
```

### Option B: Supabase (free tier)

```bash
# Sign up at https://supabase.com, create a project
# Connection string is in Settings → Database → Connection string → URI
```

### Option C: AWS RDS

```bash
aws rds create-db-instance \
  --db-instance-identifier autopilot-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username autopilot \
  --master-user-password "$(openssl rand -base64 24)" \
  --allocated-storage 20 \
  --region "$REGION"

# Wait for it to be available
aws rds wait db-instance-available \
  --db-instance-identifier autopilot-db \
  --region "$REGION"

# Get the endpoint
aws rds describe-db-instances \
  --db-instance-identifier autopilot-db \
  --region "$REGION" \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text
```

### Option D: Docker (local dev)

```bash
docker run -d \
  --name autopilot-postgres \
  -e POSTGRES_USER=autopilot \
  -e POSTGRES_PASSWORD=autopilot \
  -e POSTGRES_DB=autopilot \
  -p 5432:5432 \
  postgres:16-alpine
```

## 6. File Storage (Optional)

### S3 for attachments

```bash
BUCKET="myapp-autopilot-files"

aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION"
```

### Archil

```bash
npm install @archildata/client @archildata/just-bash

# Create a disk via the Archil dashboard or API
# Get a disk token from https://console.archil.com
```

## 7. Configure Autopilot

Create `autopilot.toml`:

```toml
[server]
port = 3100
host = "0.0.0.0"
domain = "mail.myapp.com"
api_keys = ["your-secret-api-key"]

[storage]
adapter = "postgres"
connection_string = "postgresql://autopilot:pass@localhost:5432/autopilot"

[transport]
adapter = "ses"
region = "us-east-1"

[file_storage]
adapter = "s3"
region = "us-east-1"
bucket = "myapp-autopilot-files"

[s3]
region = "us-east-1"
bucket = "myapp-autopilot-inbound"

[webhooks]
dispatch = true
ses_endpoint = "/webhooks/ses"
verify_sns_signature = true

[logging]
level = "info"
```

## 8. Run Autopilot

### Direct

```bash
npx autopilot --config ./autopilot.toml
```

### Docker

```bash
docker build -t autopilot .
docker run -p 3100:3100 \
  -v ./autopilot.toml:/etc/autopilot/config.toml \
  -e AWS_ACCESS_KEY_ID=xxx \
  -e AWS_SECRET_ACCESS_KEY=xxx \
  autopilot
```

### Docker Compose

```yaml
version: '3.8'
services:
  autopilot:
    build: .
    ports:
      - '3100:3100'
    volumes:
      - ./autopilot.toml:/etc/autopilot/config.toml
    environment:
      - AWS_ACCESS_KEY_ID
      - AWS_SECRET_ACCESS_KEY
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: autopilot
      POSTGRES_PASSWORD: autopilot
      POSTGRES_DB: autopilot
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - '5432:5432'

volumes:
  pgdata:
```

## 9. Verify Setup

```bash
# Health check
curl http://localhost:3100/health

# Create an inbox
curl -X POST http://localhost:3100/v0/inboxes \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "display_name": "Test Agent"}'

# Send a test email
INBOX_ID="<inbox_id from above>"
curl -X POST "http://localhost:3100/v0/inboxes/$INBOX_ID/messages/send" \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@gmail.com",
    "subject": "Autopilot is live!",
    "text": "Sent from my self-hosted email server."
  }'
```

## Troubleshooting

See the [troubleshooting reference](references/troubleshooting.md) for common issues with DNS, SES sandbox, deliverability, and webhook connectivity.

## Reference files

- `references/troubleshooting.md` — DNS propagation, SES sandbox, bounce handling, SNS connectivity issues
- `references/iam-policies.md` — Minimal IAM policies for SES, S3, and SNS
