# Railway Manual Configuration Fix

## IMPORTANT: Manual Steps Required in Railway Dashboard

The issue is that Railway is using settings from the now-deleted `railway.json` files. You need to clear these settings manually in the Railway dashboard.

### For Backend Service:

1. Go to Backend service → Settings → Deploy
2. **Clear the "Custom Start Command"** field (it currently shows `uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}`)
3. Leave it empty - let the Dockerfile handle it
4. Click "Update" to save

### For Frontend Service:

1. Go to Frontend service → Settings → Deploy  
2. **Clear the "Custom Start Command"** field if it has any value
3. Leave it empty - let the Dockerfile handle it
4. Click "Update" to save

### Also Clear Build Commands:

1. For both services, go to Settings → Build
2. **Clear the "Custom Build Command"** field
3. Let Docker handle the build process
4. Click "Update" to save

## After Clearing Settings:

Once you've cleared these fields, Railway will use the commands from the Dockerfiles:

- **Backend**: Will run `python start.py` which properly handles the PORT variable
- **Frontend**: Will run `npm start` 

## Trigger New Deployment:

After clearing the settings, trigger a new deployment:
1. Either push a small change to the repo
2. Or click "Redeploy" on the latest deployment

## Why This Is Happening:

Railway caches the settings from `railway.json` files. Even after deleting these files, the settings remain in Railway's dashboard. These cached settings override the Dockerfile commands, which is why you're still seeing the old error about `${PORT:-8000}` not being a valid integer.

## Verification:

After deployment, check:
- Backend logs should show: "Starting FastAPI server on port 8000..."
- Frontend should start without build errors

## If Frontend Still Fails:

The frontend build logs are being cut off. If it still fails after clearing settings, check:
1. Generate a public domain for the frontend service
2. Ensure PORT=3000 is set in environment variables
3. Check that all the files are being copied correctly