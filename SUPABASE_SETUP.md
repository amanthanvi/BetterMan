# BetterMan Supabase Setup Guide

Since you already have Supabase configured, let's use it for everything!

## Step 1: Set Up Database Tables

1. Go to your Supabase dashboard
2. Click on **SQL Editor** (left sidebar)
3. Click **New query**
4. Copy and paste the contents of `supabase/migrations/001_betterman_tables.sql`
5. Click **Run** (or Cmd+Enter)

This creates all the tables needed for BetterMan with proper indexes and security.

## Step 2: Load Man Pages Data

### Option A: Using the Script (Recommended)
```bash
# Install dependencies if needed
npm install

# Run the loader script
NEXT_PUBLIC_SUPABASE_URL="https://bhpmsekkidrdwjckifbr.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
npx tsx scripts/load-to-supabase.ts
```

### Option B: Manual Upload via Dashboard
1. Go to **Table Editor** → **documents**
2. Click **Import data via CSV**
3. We'll need to convert the JSON to CSV first

## Step 3: Update Frontend to Use Supabase Directly

Since you're already using Supabase, let's update the frontend to query it directly:

### Update your API client (`lib/api/client.ts`):

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function searchManPages(query: string, options?: {
  section?: number
  limit?: number
}) {
  let dbQuery = supabase
    .from('documents')
    .select('*')
    .limit(options?.limit || 20)

  if (query) {
    dbQuery = dbQuery.or(`name.ilike.%${query}%,title.ilike.%${query}%,description.ilike.%${query}%`)
  }

  if (options?.section) {
    dbQuery = dbQuery.eq('section', options.section)
  }

  const { data, error } = await dbQuery

  if (error) throw error

  return {
    query,
    count: data?.length || 0,
    results: data || []
  }
}

export async function getManPage(name: string, section?: number) {
  let query = supabase
    .from('documents')
    .select('*')
    .eq('name', name)

  if (section) {
    query = query.eq('section', section)
  }

  const { data, error } = await query.single()

  if (error) throw error
  return data
}
```

## Step 4: Deploy Edge Functions (Optional - Replace Backend)

If you want to completely replace the FastAPI backend:

1. Install Supabase CLI:
```bash
brew install supabase/tap/supabase
```

2. Link your project:
```bash
supabase link --project-ref bhpmsekkidrdwjckifbr
```

3. Deploy the edge function:
```bash
supabase functions deploy search
```

## Step 5: Update GitHub Actions

Since we're using Supabase, we can simplify the deployment:

1. Remove the Render deployment steps
2. Keep only Vercel frontend deployment
3. Man pages will be loaded directly to Supabase

## Step 6: Get Your Database Password

To connect your backend to Supabase PostgreSQL:

1. Go to **Settings** → **Database**
2. Find **Connection string** → **URI**
3. Copy the password from there
4. Update `backend/.env.supabase` with the password

## Advantages of This Setup

1. **Simpler Architecture**: No need for separate backend hosting
2. **Built-in Auth**: Use Supabase Auth for user management
3. **Real-time**: Get real-time updates for free
4. **One Bill**: Everything under Supabase (free tier is generous)
5. **Better Performance**: Edge functions run closer to users

## Next Steps

1. Run the SQL migration
2. Load the man pages data
3. Update your frontend to use Supabase directly
4. (Optional) Set up Edge Functions to replace backend
5. Deploy to Vercel

Would you like me to help you with any of these steps?