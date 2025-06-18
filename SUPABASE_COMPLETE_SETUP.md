# Complete Supabase Setup Guide for BetterMan

## Current Status
✅ Supabase integration code is ready
✅ TypeScript types fixed to match database schema
✅ Data loading script prepared
✅ API client configured with Supabase fallback

## Step-by-Step Setup Instructions

### 1. Run Database Migration

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/bhpmsekkidrdwjckifbr)
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Copy the entire contents of `supabase/migrations/001_betterman_tables.sql`
5. Paste it into the SQL editor
6. Click **Run** (or press Cmd+Enter)

This will create:
- `documents` table with all man page data
- `search_history`, `view_history`, `favorites` tables for user features
- Search function for efficient querying
- Proper indexes and RLS policies

### 2. Get Your Service Role Key

1. In Supabase Dashboard, go to **Settings** → **API**
2. Find **Service role key** (keep this secret!)
3. Copy it for the next step

### 3. Load Man Pages Data

```bash
# From the project root
cd /Users/amanthanvi/GitRepos/BetterMan

# Install dependencies if needed
npm install

# Load data to Supabase (replace YOUR_SERVICE_ROLE_KEY)
NEXT_PUBLIC_SUPABASE_URL="https://bhpmsekkidrdwjckifbr.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
npx tsx scripts/load-to-supabase.ts
```

This will:
- Read all man pages from `data/enhanced-pages.ts`
- Transform them to match the database schema
- Upload in batches of 50 for efficiency
- Show progress as it uploads

### 4. Update GitHub Secrets

Go to your GitHub repository settings:
1. Navigate to **Settings** → **Secrets and variables** → **Actions**
2. Add these secrets:
   - `VERCEL_TOKEN` - Get from [Vercel Account Settings](https://vercel.com/account/tokens)
   - `VERCEL_ORG_ID` - Get from Vercel project settings
   - `VERCEL_PROJECT_ID` - Get from Vercel project settings

### 5. Update Vercel Environment Variables

Make sure these are set in your Vercel project:
```
NEXT_PUBLIC_SUPABASE_URL=https://bhpmsekkidrdwjckifbr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your anon key]
NEXT_PUBLIC_USE_SUPABASE=true
NEXT_PUBLIC_API_ENABLED=false
```

### 6. Deploy to Vercel

```bash
# Commit your changes
git add .
git commit -m "feat: complete Supabase integration

- Fixed TypeScript types to match database schema
- Updated API client to use Supabase with fallback
- Ready for production deployment

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to trigger deployment
git push origin main
```

### 7. Verify Deployment

Once deployed:
1. Visit your Vercel deployment URL
2. Try searching for commands like "ls", "git", "docker"
3. Click on a command to view its man page
4. Check browser console for any errors

## Troubleshooting

### If Search Returns No Results
1. Check Supabase Dashboard → **Table Editor** → **documents**
2. Verify data was loaded (should see rows)
3. Check browser console for errors
4. Ensure `NEXT_PUBLIC_USE_SUPABASE=true` is set

### If You Get Authentication Errors
1. Verify your Supabase URL and anon key are correct
2. Check RLS policies in Supabase (should allow public read)
3. Make sure you're using the anon key (not service role) in frontend

### If Data Loading Fails
1. Verify your service role key is correct
2. Check that the SQL migration ran successfully
3. Look for error messages in the console
4. Try loading smaller batches by modifying the script

## Next Steps

### Optional: Deploy Edge Functions
If you want to replace the FastAPI backend entirely:

1. Install Supabase CLI:
```bash
brew install supabase/tap/supabase
```

2. Link your project:
```bash
supabase link --project-ref bhpmsekkidrdwjckifbr
```

3. Deploy the search function:
```bash
supabase functions deploy search
```

4. Update your frontend to use the edge function URL

### Optional: Add Authentication
Since you have Supabase, you can easily add auth:

1. Enable Auth providers in Supabase Dashboard
2. Use `@supabase/auth-ui-react` for login UI
3. User favorites and history will work automatically

## Architecture Benefits

Your new architecture:
- **Frontend**: Next.js on Vercel (fast, global CDN)
- **Database**: Supabase PostgreSQL (reliable, scalable)
- **Search**: Direct database queries (no separate backend needed)
- **Future**: Can add Edge Functions for complex logic

This is simpler, more reliable, and cost-effective compared to the DigitalOcean setup!