# IAM Policies for Autopilot

Minimal IAM policies for running Autopilot with AWS services.

## Combined Policy (SES + S3 + SNS)

Attach this to the IAM user or role running Autopilot:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AutopilotSES",
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail", "sesv2:SendEmail"],
      "Resource": "*"
    },
    {
      "Sid": "AutopilotS3Read",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR_INBOUND_BUCKET/*"
    },
    {
      "Sid": "AutopilotS3Files",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_FILES_BUCKET/*"
    }
  ]
}
```

Replace `YOUR_INBOUND_BUCKET` and `YOUR_FILES_BUCKET` with your actual bucket names.

## SES-Only Policy (send only, no inbound)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail", "sesv2:SendEmail"],
      "Resource": "*"
    }
  ]
}
```

## S3 Presigned URL Policy

If using S3FileStorage with presigned download URLs, the role needs `s3:GetObject` on the files bucket. This is already included in the combined policy above.

## IAM Role for EC2 / ECS / EKS

If running on AWS compute, use an IAM instance role instead of access keys:

```bash
# Create role
aws iam create-role \
  --role-name autopilot-server \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach the policy
aws iam put-role-policy \
  --role-name autopilot-server \
  --policy-name autopilot-access \
  --policy-document file://autopilot-policy.json
```

No access keys needed — the SDK picks up credentials from the instance metadata.

## Archil IAM (for Archil file storage with S3 mounts)

If your Archil disk mounts an S3 bucket, Archil handles the IAM automatically via disk tokens. No additional AWS IAM configuration is needed for the Autopilot process — just set the `auth_token` in your config.
