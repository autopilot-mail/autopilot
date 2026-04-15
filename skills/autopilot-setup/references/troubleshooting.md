# Troubleshooting

## DNS Issues

### DKIM verification stuck on "PENDING"

- DNS propagation can take up to 72 hours (usually under 1 hour)
- Verify records exist: `dig CNAME {token}._domainkey.mail.myapp.com`
- Ensure no conflicting CNAME records exist
- Check the correct region — DKIM tokens are region-specific

### SPF failing

- Verify TXT record: `dig TXT mail.myapp.com`
- Must contain `include:amazonses.com`
- Only one SPF record per domain — merge if you have existing ones

### MX record not working

- Verify: `dig MX mail.myapp.com`
- Must point to the SES inbound endpoint for your region
- MX records take time to propagate — test with `nslookup -type=mx mail.myapp.com`

## SES Issues

### Sandbox mode — can only send to verified addresses

```bash
# Check account status
aws sesv2 get-account --region us-east-1 --query 'ProductionAccessEnabled'

# If false, request production access
aws sesv2 put-account-details \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url "https://myapp.com" \
  --use-case-description "Agent email platform" \
  --region us-east-1
```

Production access approval typically takes 24-48 hours.

### "Email address is not verified" error

```bash
# Verify the domain (not individual addresses)
aws sesv2 get-email-identity \
  --email-identity mail.myapp.com \
  --region us-east-1 \
  --query 'VerifiedForSendingStatus'
```

### Emails going to spam

- Ensure SPF, DKIM, and DMARC are all configured
- Warm up sending volume gradually (don't blast 10k emails day 1)
- Use a configuration set to track bounces/complaints:

```bash
aws sesv2 create-configuration-set \
  --configuration-set-name autopilot-tracking \
  --region us-east-1
```

### Bounce rate too high

SES suspends accounts with bounce rates above 5%. Monitor:

```bash
aws sesv2 get-account --region us-east-1 \
  --query 'SendQuota'
```

## S3 / Inbound Email Issues

### Inbound emails not arriving in S3

1. Check receipt rule is active:

```bash
aws ses describe-active-receipt-rule-set --region us-east-1
```

2. Check MX record points to SES:

```bash
dig MX mail.myapp.com
```

3. Check S3 bucket policy allows SES writes (see setup guide)

4. Send a test email to `test@mail.myapp.com` and check:

```bash
aws s3 ls s3://myapp-autopilot-inbound/inbound/ --region us-east-1
```

### SNS not triggering webhook

1. Check subscription is confirmed:

```bash
aws sns list-subscriptions-by-topic --topic-arn $TOPIC_ARN --region us-east-1
```

2. Ensure the server was running when the subscription was created (Autopilot auto-confirms)

3. Re-subscribe if the confirmation expired:

```bash
aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol https \
  --notification-endpoint "https://your-server.com/webhooks/ses" \
  --region us-east-1
```

## Database Issues

### PostgreSQL connection refused

- Check the connection string format: `postgresql://user:pass@host:5432/dbname`
- For RDS: ensure the security group allows inbound on port 5432
- For Neon: append `?sslmode=require` to the connection string

### Schema not created

Autopilot creates tables automatically on `server.initialize()`. If tables are missing:

1. Check the schema name (default: `autopilot`)
2. Ensure the database user has CREATE permissions
3. Check server logs for initialization errors

## Webhook Issues

### SNS signature verification failing

If you're behind a reverse proxy (nginx, CloudFront), ensure:

- The proxy passes the full body without modification
- Content-Type header is preserved (`text/plain` for SNS)
- The server's public URL matches the subscription endpoint

To temporarily disable verification (not recommended for production):

```toml
[webhooks]
verify_sns_signature = false
```

### Webhook delivery to external URLs failing

Check server logs for delivery errors. Common issues:

- Target URL is not accessible from your server's network
- Target returns non-2xx status codes
- DNS resolution failure for webhook URL
