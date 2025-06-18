# DigitalOcean Spaces Key Visual Guide

This guide shows you exactly where to find and how to identify the correct keys.

## Understanding the Two Key Types

### 1. API Token (NOT for Spaces)
```
Location: Account → API → Tokens
Format:   dop_v1_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
Purpose:  Managing DigitalOcean resources (droplets, apps, etc.)
Usage:    doctl CLI, terraform, API calls
```

### 2. Spaces Access Keys (What You Need)
```
Location: Account → API → Spaces Keys
Format:   Access Key: DO00ABCDEFGHIJK12345
          Secret Key: xYz123aBc456dEf789gHi012jKl345mNo678pQr
Purpose:  S3-compatible storage access
Usage:    AWS CLI, boto3, S3 SDKs
```

## Step-by-Step Visual Guide

### Step 1: Navigate to Spaces Keys

1. Log in to DigitalOcean
2. Click your avatar (top right)
3. Select "API" from dropdown
4. Look for TWO tabs at the top:
   - "Tokens" (for API access)
   - "Spaces Keys" (for Spaces access)
5. **Click "Spaces Keys" tab**

### Step 2: Generate Spaces Keys

On the Spaces Keys page:

```
┌─────────────────────────────────────────────────┐
│ Spaces access keys                              │
│                                                 │
│ Spaces access keys provide API access to        │
│ Spaces, DigitalOcean's object storage.         │
│                                                 │
│ [Generate New Key]                              │
│                                                 │
│ Your keys:                                      │
│ (No keys yet)                                   │
└─────────────────────────────────────────────────┘
```

Click "Generate New Key"

### Step 3: Name Your Key

```
┌─────────────────────────────────────────────────┐
│ Generate Spaces access key                      │
│                                                 │
│ Name: [betterman-backend                   ]    │
│                                                 │
│ [Cancel] [Generate Key]                         │
└─────────────────────────────────────────────────┘
```

### Step 4: Save Your Keys IMMEDIATELY

After clicking "Generate Key":

```
┌─────────────────────────────────────────────────┐
│ ⚠️  Save these credentials now!                 │
│                                                 │
│ Access Key: DO00K5XY8H3EXAMPLE789              │
│                                                 │
│ Secret Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCY... │
│            EXAMPLEKEY+123456789012345678       │
│                                                 │
│ The secret key will not be shown again.        │
│                                                 │
│ [Done]                                          │
└─────────────────────────────────────────────────┘
```

## Key Format Examples

### ✅ CORRECT Spaces Keys:
```bash
# Access Key (always starts with DO)
DO00K5XY8H3N4P7Q2R9S

# Secret Key (40+ character random string)
wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY123
```

### ❌ WRONG (API Tokens):
```bash
# This is an API token, NOT a Spaces key
dop_v1_6d4f8a5b2c7e9d1f3a8b5c2d7e4f9a1b6c3d8e5f
```

## Common Mistakes

### Mistake 1: Wrong Page
- ❌ Going to: Account → API → Tokens
- ✅ Should go to: Account → API → Spaces Keys

### Mistake 2: Using API Token
```bash
# Script prompt:
Enter Spaces Access Key (starts with DO): dop_v1_abc123...
# ❌ ERROR: This is an API token!
```

### Mistake 3: Not Saving Secret Key
- The secret key is shown ONLY ONCE
- If you don't save it, you must generate new keys

## Where Keys Are Used

### In Setup Script:
```bash
Enter Spaces Access Key (starts with DO): DO00K5XY8H3N4P7Q2R9S
Enter Spaces Secret Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

### In AWS CLI:
```bash
aws configure --profile digitalocean
# AWS Access Key ID: DO00K5XY8H3N4P7Q2R9S
# AWS Secret Access Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

### In Application:
```python
s3_client = boto3.client(
    's3',
    endpoint_url='https://nyc3.digitaloceanspaces.com',
    aws_access_key_id='DO00K5XY8H3N4P7Q2R9S',
    aws_secret_access_key='wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
)
```

## Quick Reference URLs

- **Spaces Keys**: https://cloud.digitalocean.com/account/api/spaces
- **API Tokens**: https://cloud.digitalocean.com/account/api/tokens
- **Spaces Dashboard**: https://cloud.digitalocean.com/spaces

## Still Confused?

If you're still unsure:
1. Look for keys that start with "DO" (not "dop_v1")
2. Spaces keys are found under the "Spaces Keys" tab
3. API tokens are found under the "Tokens" tab
4. Spaces keys have two parts: Access Key and Secret Key
5. API tokens are a single long string