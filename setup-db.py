#!/usr/bin/env python3
"""Setup database directly using Railway DATABASE_URL."""

import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

def main():
    print("🚀 BetterMan Database Setup")
    print("===========================")
    
    # Check for DATABASE_URL
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("\n❌ DATABASE_URL not found in environment")
        print("\n📝 To set it up:")
        print("1. Go to your Railway dashboard")
        print("2. Select your backend service")
        print("3. Go to Variables tab")
        print("4. Copy the DATABASE_URL value")
        print("5. Run this command:")
        print('   export DATABASE_URL="your-database-url-here"')
        print("6. Then run this script again")
        sys.exit(1)
    
    print(f"✅ Found DATABASE_URL: {database_url[:30]}...")
    
    # Set other required environment variables if not present
    os.environ.setdefault('ENVIRONMENT', 'production')
    os.environ.setdefault('SECRET_KEY', 'your-secret-key-here')
    
    print("\n📋 Select action:")
    print("1) Test database connection")
    print("2) Create tables (using SQLAlchemy)")
    print("3) Run Alembic migrations")
    print("4) Initialize with sample data")
    print("5) All of the above")
    
    choice = input("\nEnter your choice (1-5): ")
    
    if choice in ['1', '5']:
        print("\n🔍 Testing database connection...")
        try:
            from backend.src.db.postgres_connection import engine
            with engine.connect() as conn:
                result = conn.execute("SELECT 1")
                print("✅ Database connection successful!")
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            if 'asyncpg' in str(e):
                print("💡 This error is from asyncpg. The synchronous connection should work fine.")
            sys.exit(1)
    
    if choice in ['2', '5']:
        print("\n📦 Creating database tables...")
        try:
            from backend.src.db.postgres_connection import init_db
            init_db()
            print("✅ Tables created successfully!")
        except Exception as e:
            print(f"❌ Table creation failed: {e}")
            if 'already exists' in str(e).lower():
                print("💡 Tables might already exist. This is normal.")
    
    if choice in ['3', '5']:
        print("\n🔄 Running Alembic migrations...")
        try:
            os.chdir("backend")
            import subprocess
            result = subprocess.run(
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                print("✅ Migrations completed successfully!")
            else:
                print(f"⚠️ Migration output: {result.stdout}")
                print(f"⚠️ Migration errors: {result.stderr}")
            os.chdir("..")
        except Exception as e:
            print(f"❌ Migration failed: {e}")
            os.chdir("..")
    
    if choice in ['4', '5']:
        print("\n🗄️ Initializing database with sample data...")
        try:
            from backend.src.db.init_postgres import main as init_main
            init_main()
            print("✅ Sample data loaded successfully!")
        except Exception as e:
            print(f"❌ Data initialization failed: {e}")
            if 'duplicate key' in str(e).lower():
                print("💡 Some data might already exist. This is normal.")
    
    print("\n✅ Setup completed!")
    print("\n📊 Database Status:")
    try:
        from backend.src.db.postgres_connection import engine
        with engine.connect() as conn:
            # Count tables
            result = conn.execute("""
                SELECT COUNT(*) 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            table_count = result.scalar()
            print(f"   Tables: {table_count}")
            
            # Count man pages if table exists
            try:
                result = conn.execute("SELECT COUNT(*) FROM man_pages")
                page_count = result.scalar()
                print(f"   Man Pages: {page_count}")
            except:
                pass
    except Exception as e:
        print(f"   Status check failed: {e}")

if __name__ == "__main__":
    main()