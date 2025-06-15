# Supabase Security Configuration

## Security Warnings Addressed

### 1. Function Search Path Mutable ✓
- **Issue**: Functions without explicit search_path can be vulnerable to injection
- **Fix**: Migration created to add `SET search_path = public` to all functions
- **Files**: `/supabase/migrations/20250115_fix_function_search_paths.sql`

### 2. Leaked Password Protection
- **Issue**: Currently disabled in Supabase settings
- **Fix**: Enable in Supabase Dashboard → Authentication → Password Settings
- **Action**: Check "Prevent use of leaked passwords"

### 3. OTP Long Expiry
- **Current**: 86400 seconds (24 hours)
- **Recommended**: 3600 seconds (1 hour)
- **Action**: Update in Supabase Dashboard → Authentication → Email Settings

## How to Apply Fixes

### Database Functions
1. Go to Supabase Dashboard → SQL Editor
2. Run the migration script from `/supabase/migrations/20250115_fix_function_search_paths.sql`
3. Verify functions are updated

### Authentication Settings
1. Go to Authentication → Password Settings
2. Enable "Prevent use of leaked passwords"
3. Go to Authentication → Email Settings
4. Change OTP expiration to 3600 seconds

## Security Best Practices Applied

✓ Email confirmation required
✓ Secure email change (confirmation on both addresses)
✓ Secure password change (recent login required)
✓ Minimum password length: 8 characters
✓ Password complexity requirements enabled
✓ Database functions secured with explicit search paths

## Remaining Action Items

1. Enable leaked password protection in Supabase Dashboard
2. Reduce OTP expiration time to 1 hour
3. Run the database migration to fix function search paths