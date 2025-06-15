# Running Supabase Migrations

## Quick Steps

1. **Open Supabase SQL Editor**
   - Go to: https://app.supabase.com/project/bhpmsekkidrdwjckifbr/sql
   - Or navigate: Dashboard → SQL Editor

2. **Run the Combined Migration**
   - Copy the entire contents of `supabase/migrations/combined_migration.sql`
   - Paste into the SQL Editor
   - Click "Run" button

3. **Verify Migration Success**
   - Check for any errors in the output
   - You should see "Success. No rows returned" for most statements

## Alternative: Run Individual Migrations

If you prefer to run migrations separately:

1. First run `001_create_users_table.sql`
2. Then run `002_update_users_for_supabase_auth.sql`

## What These Migrations Do

### Migration 001: Create Users Table
- Creates core user tables (users, preferences, favorites, etc.)
- Sets up Row Level Security (RLS) policies
- Creates indexes for performance
- Adds triggers for automatic timestamp updates

### Migration 002: Update for Supabase Auth
- Removes Clerk-specific columns
- Updates RLS policies to use Supabase's auth.uid()
- Adds automatic user profile creation on signup
- Links users table to Supabase's auth.users

## Troubleshooting

### If you get "relation already exists" errors:
This means some tables already exist. You can either:
1. Drop all tables first (WARNING: This will delete all data):
   ```sql
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   ```
2. Or modify the migrations to use `CREATE TABLE IF NOT EXISTS`

### If RLS policies fail:
Make sure Row Level Security is enabled in your Supabase project:
- Go to Authentication → Policies
- Enable RLS for all tables

## After Running Migrations

1. Test authentication at http://localhost:5173
2. Try signing up with email/password
3. Check that user profile is automatically created
4. Test OAuth providers (if configured)