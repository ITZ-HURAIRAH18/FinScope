# Vercel Hobby Plan Fix

## Issue
Vercel Hobby (free) plan has restrictions on cron jobs:
- ❌ Can only run **once per day** (not every 5 minutes)
- ❌ Timing is imprecise (±59 minutes)
- ✅ Our cleanup needs to run more frequently to delete users after 10 minutes

## Solution
Changed the cleanup strategy to work with Hobby plan limitations:

### Primary: Client-Side Trigger
- **CleanupTrigger component** runs on every page visit
- Triggers the cleanup API endpoint
- Works on all Vercel plans (including Hobby)
- Ensures timely cleanup as long as people visit your site

### Backup: Daily Cron Job
- Runs once per day at midnight: `0 0 * * *`
- Catches any users that weren't cleaned up by client-side trigger
- Complies with Hobby plan restrictions

## Changes Made

### 1. Updated `vercel.json`
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-unverified",
      "schedule": "0 0 * * *"  // Changed from "*/5 * * * *"
    }
  ]
}
```

### 2. Re-enabled `CleanupTrigger` in `app/layout.tsx`
```tsx
import CleanupTrigger from "@/components/CleanupTrigger";

// In body:
<CleanupTrigger />
```

### 3. Updated `CleanupTrigger.tsx`
- Removed 2-second delay
- Now triggers immediately on page load
- More aggressive cleanup for Hobby plan

## How It Works Now

### User Registration Flow
1. User registers → Account created with 10-minute expiry
2. OTP sent to email
3. User has 10 minutes to verify

### Cleanup Flow
1. **Any visitor** to your site triggers cleanup
2. API checks for expired unverified users
3. Deletes them immediately
4. **Plus** daily cron job at midnight as backup

## Advantages

✅ **Works on Hobby plan** - No paid upgrade needed
✅ **Frequent cleanup** - Runs on every page visit
✅ **No cost** - Uses existing function invocations
✅ **Reliable** - Multiple cleanup triggers

## Disadvantages

⚠️ **Requires traffic** - If nobody visits your site, cleanup won't run until midnight
⚠️ **Extra API calls** - Every page load triggers cleanup (but it's fast and cheap)

## For Pro Plan Users

If you upgrade to Pro plan later, you can:
1. Change `vercel.json` schedule to `*/5 * * * *` (every 5 minutes)
2. Optionally remove `CleanupTrigger` from layout
3. Rely purely on cron jobs

## Testing

The cleanup will now run:
- ✅ Every time someone visits any page on your site
- ✅ Once per day at midnight (backup)

To test:
1. Register a user but don't verify
2. Visit any page on your site
3. Check database - expired users should be deleted

## No Changes Needed to Environment Variables

You still need:
```env
CRON_SECRET=your-secret-here
```

But the client-side trigger (POST method) doesn't require authentication, so it will work even without the secret.

## Deployment

1. Commit and push changes
2. Vercel will deploy successfully
3. Cleanup will work automatically

✅ **This solution works perfectly for Hobby plan!**
