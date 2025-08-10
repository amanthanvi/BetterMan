#!/usr/bin/env python3
"""Run database migrations locally with Railway environment variables."""

import os
import sys
import subprocess
from pathlib import Path

def main():
    print("🚀 BetterMan Database Migration Tool")
    print("====================================")
    
    # Check if we're in the right directory
    if not Path("backend").exists():
        print("❌ Error: Must run from BetterMan root directory")
        sys.exit(1)
    
    # Get Railway environment variables
    print("\n1️⃣ Loading Railway environment variables...")
    try:
        result = subprocess.run(
            ["railway", "variables", "export"],
            capture_output=True,
            text=True,
            check=True
        )
        
        # Parse and set environment variables
        for line in result.stdout.strip().split('\n'):
            if '=' in line:
                key, value = line.split('=', 1)
                # Remove quotes if present
                value = value.strip('"').strip("'")
                os.environ[key] = value
                if key == 'DATABASE_URL':
                    print(f"✅ Found DATABASE_URL: {value[:30]}...")
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to get Railway variables: {e}")
        print("Make sure you're logged in to Railway: railway login")
        sys.exit(1)
    
    # Change to backend directory
    os.chdir("backend")
    
    print("\n2️⃣ Select action:")
    print("   1) Run Alembic migrations")
    print("   2) Initialize database with sample data")
    print("   3) Both (migrations + init)")
    print("   4) Check database connection")
    
    choice = input("Enter your choice (1-4): ")
    
    if choice in ['1', '3']:
        print("\n📦 Running Alembic migrations...")
        try:
            subprocess.run(
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                check=True
            )
            print("✅ Migrations completed successfully")
        except subprocess.CalledProcessError as e:
            print(f"❌ Migration failed: {e}")
            sys.exit(1)
    
    if choice in ['2', '3']:
        print("\n🗄️ Initializing database with sample data...")
        try:
            subprocess.run(
                [sys.executable, "-m", "src.db.init_postgres"],
                check=True
            )
            print("✅ Database initialized successfully")
        except subprocess.CalledProcessError as e:
            print(f"❌ Database initialization failed: {e}")
            sys.exit(1)
    
    if choice == '4':
        print("\n🔍 Checking database connection...")
        try:
            # Simple connection test
            import sys
            sys.path.insert(0, '.')
            from src.db.postgres_connection import engine
            
            with engine.connect() as conn:
                result = conn.execute("SELECT 1")
                print("✅ Database connection successful!")
                
                # Try to get table count
                result = conn.execute("""
                    SELECT COUNT(*) 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public'
                """)
                count = result.scalar()
                print(f"📊 Found {count} tables in database")
                
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
            sys.exit(1)
    
    print("\n✅ Operation completed successfully!")

if __name__ == "__main__":
    main()