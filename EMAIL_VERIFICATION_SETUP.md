# Email Verification Setup

This project now includes a complete email verification system with OTP (One-Time Password) and automatic cleanup of unverified users.

## Features

1. **OTP Email Verification**: Users receive a 6-digit OTP code via email after registration
2. **Login Protection**: Unverified users are redirected to OTP verification when attempting to login
3. **Auto-Cleanup**: Unverified users are automatically deleted after 10 minutes if they don't verify their email
4. **Countdown Timer**: Users can see how much time they have left to verify their email
5. **Resend OTP**: Users can request a new OTP code if needed

## Environment Variables

Add the following environment variables to your `.env` file:

```env
# Email Configuration (for sending OTP emails)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Cron Job Secret (for securing the cleanup endpoint)
CRON_SECRET=your-random-secret-key-here

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret
```

### Getting Email Credentials

For Gmail:
1. Go to your Google Account settings
2. Enable 2-Factor Authentication
3. Generate an App Password: https://myaccount.google.com/apppasswords
4. Use the generated password as `EMAIL_PASSWORD`

## Automatic Cleanup

The system uses Vercel Cron Jobs to clean up unverified users:

### 1. Vercel Cron Job (Primary Method)

If you're deploying to Vercel, the `vercel.json` file is already configured to run the cleanup job every 5 minutes.

**No additional setup needed** - Vercel will automatically run the cron job.

### 2. Client-Side Trigger (Optional - Not Currently Enabled)

You can optionally add a `CleanupTrigger` component to run cleanup when users visit the site. This serves as a backup mechanism.

To enable it:
1. Import in `app/layout.tsx`: `import CleanupTrigger from "@/components/CleanupTrigger";`
2. Add to the body: `<CleanupTrigger />`

**Note:** This is disabled by default since Vercel Cron handles it automatically.

### 3. Manual Trigger (Development)

You can manually trigger the cleanup by calling:

```bash
# With authentication (for cron)
curl -X GET http://localhost:3000/api/cron/cleanup-unverified \
  -H "Authorization: Bearer your-cron-secret"

# Without authentication (client-side trigger)
curl -X POST http://localhost:3000/api/cron/cleanup-unverified
```

## User Flow

### Registration Flow
1. User fills out registration form
2. User is created with `emailVerified: null` and `tokenExpires: now + 10 minutes`
3. OTP email is sent
4. User is redirected to `/auth/verify-email?email=user@example.com`
5. User enters OTP code
6. If correct, `emailVerified` is set to current timestamp
7. User is redirected to login page

### Login Flow (Unverified User)
1. User attempts to login
2. System checks if `emailVerified` is null
3. If unverified, user is redirected to `/auth/verify-otp?email=user@example.com`
4. User can enter OTP or request a new one
5. After verification, user is redirected to login page

### Cleanup Flow
1. Cron job runs every 5 minutes (or client triggers on page load)
2. Finds all users where `emailVerified: null` AND `tokenExpires < now`
3. Deletes those users from the database
4. Returns count of deleted users

## Database Schema

The `User` model includes these fields for email verification:

```prisma
model User {
  id                     String    @id @default(cuid())
  email                  String    @unique
  emailVerified          DateTime? // null until verified
  emailVerificationToken String?   @unique // 6-digit OTP
  tokenExpires           DateTime? // 10 minutes from creation
  // ... other fields
}
```

## Testing

### Test the Email Verification Flow

1. Register a new user
2. Check your email for the OTP code
3. Enter the code on the verification page
4. Verify the countdown timer is working
5. Try logging in before verification (should redirect to OTP page)
6. Complete verification and login

### Test the Cleanup

1. Register a user but don't verify
2. Wait 10 minutes (or manually change `tokenExpires` in database)
3. Trigger the cleanup endpoint or wait for cron
4. Verify the user is deleted from the database

## Troubleshooting

### Emails Not Sending

- Check your email credentials in `.env`
- Verify 2FA is enabled and you're using an App Password
- Check the server logs for email errors
- Try using a different SMTP provider (SendGrid, Mailgun, etc.)

### Cleanup Not Running

- Check Vercel logs for cron job execution
- Verify `CRON_SECRET` is set correctly
- Manually trigger the cleanup endpoint to test
- Check that `CleanupTrigger` component is in the layout

### Timer Not Working

- Check browser console for JavaScript errors
- Verify the component is properly mounted
- Check that `tokenExpires` is set correctly in the database

## Production Deployment

### Vercel

1. Add all environment variables in Vercel dashboard
2. Deploy your application
3. Vercel will automatically run the cron job based on `vercel.json`

### Other Platforms

If not using Vercel, you'll need to set up a cron job manually:

```bash
# Add to crontab (runs every 5 minutes)
*/5 * * * * curl -X GET https://your-domain.com/api/cron/cleanup-unverified \
  -H "Authorization: Bearer your-cron-secret"
```

Or use a service like:
- **Cron-job.org**: Free cron job service
- **EasyCron**: Scheduled HTTP requests
- **GitHub Actions**: Scheduled workflows

## Security Considerations

1. **CRON_SECRET**: Keep this secret and never commit it to version control
2. **Rate Limiting**: Consider adding rate limiting to the cleanup endpoint
3. **Email Validation**: The system validates email format on registration
4. **OTP Expiration**: OTP codes expire after 10 minutes
5. **Secure Cookies**: Session cookies are httpOnly and secure in production

## Future Enhancements

- Add rate limiting for OTP requests
- Implement email verification link as alternative to OTP
- Add SMS verification option
- Send reminder email at 5 minutes remaining
- Add admin dashboard to view pending verifications
