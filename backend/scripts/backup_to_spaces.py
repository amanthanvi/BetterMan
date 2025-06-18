#!/usr/bin/env python3
"""
Backup SQLite database to DigitalOcean Spaces
"""
import os
import boto3
from datetime import datetime
import gzip
import shutil
from pathlib import Path

# Configuration
DATABASE_PATH = os.getenv('DATABASE_PATH', '/data/betterman.db')
SPACES_ACCESS_KEY = os.getenv('SPACES_ACCESS_KEY')
SPACES_SECRET_KEY = os.getenv('SPACES_SECRET_KEY')
SPACES_BUCKET_NAME = os.getenv('SPACES_BUCKET_NAME', 'betterman-backups')
SPACES_REGION = os.getenv('SPACES_REGION', 'nyc3')
SPACES_ENDPOINT = f'https://{SPACES_REGION}.digitaloceanspaces.com'

def compress_file(file_path):
    """Compress file using gzip"""
    compressed_path = f"{file_path}.gz"
    
    with open(file_path, 'rb') as f_in:
        with gzip.open(compressed_path, 'wb') as f_out:
            shutil.copyfileobj(f_in, f_out)
    
    return compressed_path

def backup_to_spaces():
    """Backup SQLite database to DO Spaces"""
    if not all([SPACES_ACCESS_KEY, SPACES_SECRET_KEY]):
        print("❌ Missing Spaces credentials")
        return False
    
    if not Path(DATABASE_PATH).exists():
        print(f"❌ Database not found at {DATABASE_PATH}")
        return False
    
    print(f"🔄 Starting backup of {DATABASE_PATH}...")
    
    # Create S3 client for DO Spaces
    s3_client = boto3.client(
        's3',
        endpoint_url=SPACES_ENDPOINT,
        aws_access_key_id=SPACES_ACCESS_KEY,
        aws_secret_access_key=SPACES_SECRET_KEY
    )
    
    # Create backup filename with timestamp
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_filename = f"betterman_backup_{timestamp}.db"
    
    # Copy database to temp location (to avoid locking issues)
    temp_backup = f"/tmp/{backup_filename}"
    shutil.copy2(DATABASE_PATH, temp_backup)
    
    # Compress the backup
    print("📦 Compressing backup...")
    compressed_backup = compress_file(temp_backup)
    compressed_filename = f"{backup_filename}.gz"
    
    # Upload to Spaces
    print(f"☁️  Uploading to {SPACES_BUCKET_NAME}...")
    try:
        with open(compressed_backup, 'rb') as data:
            s3_client.put_object(
                Bucket=SPACES_BUCKET_NAME,
                Key=f"backups/{compressed_filename}",
                Body=data,
                ACL='private',
                ContentType='application/gzip'
            )
        
        print(f"✅ Backup uploaded: {compressed_filename}")
        
        # Clean up temp files
        os.remove(temp_backup)
        os.remove(compressed_backup)
        
        # List recent backups
        print("\n📋 Recent backups:")
        response = s3_client.list_objects_v2(
            Bucket=SPACES_BUCKET_NAME,
            Prefix='backups/',
            MaxKeys=10
        )
        
        if 'Contents' in response:
            backups = sorted(response['Contents'], key=lambda x: x['LastModified'], reverse=True)
            for backup in backups[:5]:
                size_mb = backup['Size'] / (1024 * 1024)
                print(f"  - {backup['Key']}: {size_mb:.2f} MB")
        
        # Clean up old backups (keep last 7 days)
        cleanup_old_backups(s3_client)
        
        return True
        
    except Exception as e:
        print(f"❌ Upload failed: {e}")
        return False

def cleanup_old_backups(s3_client, days_to_keep=7):
    """Remove backups older than specified days"""
    print(f"\n🧹 Cleaning up backups older than {days_to_keep} days...")
    
    cutoff_date = datetime.now().timestamp() - (days_to_keep * 24 * 60 * 60)
    
    try:
        response = s3_client.list_objects_v2(
            Bucket=SPACES_BUCKET_NAME,
            Prefix='backups/'
        )
        
        if 'Contents' not in response:
            return
        
        deleted_count = 0
        for obj in response['Contents']:
            if obj['LastModified'].timestamp() < cutoff_date:
                s3_client.delete_object(
                    Bucket=SPACES_BUCKET_NAME,
                    Key=obj['Key']
                )
                deleted_count += 1
                print(f"  🗑️  Deleted: {obj['Key']}")
        
        if deleted_count > 0:
            print(f"✅ Cleaned up {deleted_count} old backups")
        else:
            print("✅ No old backups to clean up")
            
    except Exception as e:
        print(f"⚠️  Cleanup error: {e}")

def restore_from_spaces(backup_name):
    """Restore database from Spaces backup"""
    print(f"🔄 Restoring from {backup_name}...")
    
    s3_client = boto3.client(
        's3',
        endpoint_url=SPACES_ENDPOINT,
        aws_access_key_id=SPACES_ACCESS_KEY,
        aws_secret_access_key=SPACES_SECRET_KEY
    )
    
    # Download backup
    temp_file = f"/tmp/{backup_name}"
    s3_client.download_file(
        SPACES_BUCKET_NAME,
        f"backups/{backup_name}",
        temp_file
    )
    
    # Decompress if needed
    if temp_file.endswith('.gz'):
        print("📦 Decompressing backup...")
        with gzip.open(temp_file, 'rb') as f_in:
            with open(temp_file.replace('.gz', ''), 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        temp_file = temp_file.replace('.gz', '')
    
    # Restore database
    shutil.copy2(temp_file, DATABASE_PATH)
    os.remove(temp_file)
    
    print("✅ Database restored successfully")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == 'restore':
        if len(sys.argv) < 3:
            print("Usage: backup_to_spaces.py restore <backup_filename>")
            sys.exit(1)
        restore_from_spaces(sys.argv[2])
    else:
        backup_to_spaces()