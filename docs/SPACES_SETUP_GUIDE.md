# DigitalOcean Spaces Setup Guide

## Important: API Token vs Spaces Keys

There are two different types of credentials in DigitalOcean:

1. **API Token** (starts with `dop_v1_...`)
   - Used for doctl and DigitalOcean API
   - Manages droplets, apps, databases, etc.
   - NOT for Spaces

2. **Spaces Access Keys** (starts with `DO...`)
   - Used for S3-compatible API
   - Manages Spaces buckets and objects
   - Required for backups

## Step 1: Create Spaces Bucket

1. Go to [DigitalOcean Spaces](https://cloud.digitalocean.com/spaces)
2. Click **"Create a Spaces Bucket"**
3. Configure:
   - **Choose a datacenter region**: NYC3
   - **Choose a unique name**: `betterman-backups`
   - **File Listing**: Restrict File Listing (recommended)
   - **CDN**: Leave disabled for now
4. Click **"Create a Spaces Bucket"**

## Step 2: Generate Spaces Access Keys

1. Go to [API Tokens - Spaces Keys](https://cloud.digitalocean.com/account/api/spaces)
2. Click **"Generate New Key"**
3. Enter a name: `betterman-backend`
4. Click **"Generate Key"**
5. **IMPORTANT**: Save both keys immediately!
   - **Access Key**: Starts with `DO` (example: `DO00EXAMPLE5KEY8ID`)
   - **Secret Key**: Long random string

⚠️ **Warning**: The secret key is only shown once. Save it now!

## Step 3: Configure AWS CLI (Optional)

If you want to manage Spaces from command line:

```bash
# Install AWS CLI
brew install awscli

# Configure for DigitalOcean
aws configure --profile digitalocean

# Enter:
# AWS Access Key ID: <your DO spaces access key>
# AWS Secret Access Key: <your DO spaces secret key>
# Default region name: nyc3
# Default output format: json

# Test connection
aws s3 ls --endpoint-url https://nyc3.digitaloceanspaces.com --profile digitalocean

# Create bucket (if not created via UI)
aws s3 mb s3://betterman-backups --endpoint-url https://nyc3.digitaloceanspaces.com --profile digitalocean
```

## Step 4: Using s3cmd (Alternative)

```bash
# Install s3cmd
brew install s3cmd

# Configure
s3cmd --configure

# Enter:
# Access Key: <your DO spaces access key>
# Secret Key: <your DO spaces secret key>
# Default Region: US
# S3 Endpoint: nyc3.digitaloceanspaces.com
# DNS-style: %(bucket)s.nyc3.digitaloceanspaces.com
# Use HTTPS: Yes

# Test
s3cmd ls
```

## Common Issues

### Wrong Key Type
- ❌ `dop_v1_...` - This is an API token, not for Spaces
- ✅ `DO...` - This is a Spaces access key

### Region Mismatch
- Make sure bucket region matches endpoint:
  - NYC3: `https://nyc3.digitaloceanspaces.com`
  - SFO3: `https://sfo3.digitaloceanspaces.com`
  - etc.

### Access Denied
- Check key permissions
- Verify bucket name is correct
- Ensure region matches

## Python/Boto3 Configuration

For the backend to work:

```python
import boto3

s3_client = boto3.client(
    's3',
    endpoint_url='https://nyc3.digitaloceanspaces.com',
    aws_access_key_id='DO00EXAMPLE5KEY8ID',
    aws_secret_access_key='your_secret_key_here'
)

# List buckets
response = s3_client.list_buckets()
print(response['Buckets'])
```

## Security Best Practices

1. **Never commit keys** to Git
2. **Use environment variables** for production
3. **Rotate keys regularly**
4. **Use bucket policies** to restrict access
5. **Enable versioning** for important data

## Next Steps

After setting up Spaces:
1. Update app environment variables with keys
2. Test backup functionality
3. Set up lifecycle rules for old backups
4. Consider enabling CDN for public assets