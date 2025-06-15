# Vercel Deployment Checklist

## ✅ What's Ready

1. **Next.js App** - Fully configured at project root
2. **Database Schema** - Supabase tables created successfully
3. **Sample Data** - Basic man page data for testing
4. **Search Indexes** - Pre-built for instant search

## 🔧 Required Vercel Settings

### 1. Environment Variables (Update in Vercel Dashboard)

**Remove these old variables:**
- ❌ `DATABASE_URL` 
- ❌ `VITE_NODE_ENV`
- ❌ `VITE_API_URL`
- ❌ `VITE_SUPABASE_ANON_KEY` 
- ❌ `VITE_SUPABASE_URL`
- ❌ `SECRET_KEY`
- ❌ `CORS_ORIGINS`

**Keep/Add these variables:**
- ✅ `NEXT_PUBLIC_SUPABASE_URL=https://bhpmsekkidrdwjckifbr.supabase.co`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJocG1zZWtraWRyZHdqY2tpZmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5NDcyNzcsImV4cCI6MjA2NTUyMzI3N30.hIFatNn4xx2bw2ssjsPSYuFt2ssEl1x0driemcfLAsw`
- ✅ `SUPABASE_SERVICE_ROLE_KEY=` (keep existing)
- ✅ `NEXT_PUBLIC_APP_URL=https://betterman.sh`

### 2. Build & Development Settings

In Vercel Project Settings → General:

**Framework Preset:** Next.js (not "Other")
**Build Command:** `npm run build`
**Output Directory:** `.next`
**Install Command:** `npm install`
**Development Command:** `npm run dev`
**Root Directory:** Leave empty

### 3. Clear Build Cache

Since settings reverted, you need to:
1. Go to Settings → Advanced
2. Click "Delete Build Cache"
3. Trigger new deployment

## 🚀 Deploy Steps

1. **Update Environment Variables** as shown above
2. **Change Framework Preset** to Next.js
3. **Clear Build Cache**
4. **Redeploy** from Vercel dashboard

## 📝 Current Status

- ✅ Next.js app is at project root
- ✅ vercel.json is configured correctly
- ✅ Database schema is set up
- ✅ Sample data created
- ✅ Old folders moved to .old-app/

## 🔍 Verify After Deployment

1. Homepage loads without errors
2. Search works (try searching "ls")
3. Click on "ls" command to view documentation
4. Authentication pages load

## 🐛 Troubleshooting

If build still uses old settings:
1. Check if there's a "Production Override" in build settings
2. Remove any overrides
3. Ensure Root Directory is empty (not "frontend")
4. Clear cache and redeploy

## 📚 To Add Real Man Pages

After deployment succeeds:
1. SSH into a Linux machine
2. Run: `npm run parse-man-pages`
3. Run: `npm run build-search-index`
4. Commit and push the generated files