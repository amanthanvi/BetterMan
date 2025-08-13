#!/usr/bin/env python3
"""
Direct database test to verify man pages are accessible
"""

import os
import psycopg2
from urllib.parse import urlparse

# Parse the database URL
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:ZCuxzQlaSTETGewtXMBrtrOzCHLKxKgADxwAiqBRJCkdvBmTjQJOdXJgLGfDxXQk@postgres.railway.internal:5432/railway')

if 'railway.internal' in DATABASE_URL:
    # Use public URL if available for external testing
    DATABASE_URL = os.environ.get('DATABASE_PUBLIC_URL', DATABASE_URL)
    print(f"Note: Using DATABASE_PUBLIC_URL for external connection")

print(f"Connecting to database...")
parsed = urlparse(DATABASE_URL)

try:
    # Connect to PostgreSQL
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # Check if man_pages table exists
    cur.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'man_pages'
        );
    """)
    table_exists = cur.fetchone()[0]
    
    if table_exists:
        print("✓ man_pages table exists")
        
        # Count total man pages
        cur.execute("SELECT COUNT(*) FROM man_pages;")
        total = cur.fetchone()[0]
        print(f"✓ Total man pages: {total}")
        
        # Get some sample commands
        cur.execute("""
            SELECT name, section, category 
            FROM man_pages 
            WHERE name IN ('ls', 'grep', 'curl', 'git', 'tar')
            ORDER BY name;
        """)
        
        results = cur.fetchall()
        if results:
            print("\n✓ Sample commands found:")
            for name, section, category in results:
                print(f"  - {name}({section}) - {category}")
        else:
            print("✗ No common commands found in database")
        
        # Check categories
        cur.execute("""
            SELECT category, COUNT(*) as count 
            FROM man_pages 
            GROUP BY category 
            ORDER BY count DESC 
            LIMIT 10;
        """)
        
        categories = cur.fetchall()
        if categories:
            print("\n✓ Categories:")
            for cat, count in categories:
                print(f"  - {cat}: {count} pages")
    else:
        print("✗ man_pages table does not exist!")
        
        # Check what tables do exist
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        
        tables = cur.fetchall()
        if tables:
            print("\nExisting tables:")
            for table in tables:
                print(f"  - {table[0]}")
    
    cur.close()
    conn.close()
    print("\n✓ Database connection successful")
    
except Exception as e:
    print(f"✗ Database error: {e}")
    
    # Try to provide helpful information
    if "railway.internal" in str(e):
        print("\nNote: railway.internal domains only work inside Railway.")
        print("For external testing, set DATABASE_PUBLIC_URL environment variable.")
    elif "password authentication failed" in str(e):
        print("\nNote: Database credentials may have changed.")
        print("Check Railway dashboard for current DATABASE_URL.")