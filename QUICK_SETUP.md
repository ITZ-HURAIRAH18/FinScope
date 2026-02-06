# Quick Setup Guide

## Step 1: Generate Secrets

Run this command to generate random secrets:

```bash
node generate-secrets.js
```

This will output something like:
```
CRON_SECRET=bbac42d29288b1c8e57f62448bc6011a0dcd87b2807d9b10bbabee60956d3217
NEXTAUTH_SECRET=2233ace66a8493b6114d97c2ac032d60a758512430027426ac20cd7cba49ab05
```

## Step 2: Create .env File

Copy `.env.example` to `.env`:

```bash
copy .env.example .env
```

## Step 3: Configure Environment Variables

Edit your `.env` file and add:

### 1. Database URLs
Get these from your database provider (e.g., Vercel Postgres, Supabase, PlanetScale)

```env
DATABASE_URL="your-database-url"
DIRECT_URL="your-direct-database-url"
```

### 2. Secrets (from Step 1)
Paste the generated secrets:

```env
CRON_SECRET=bbac42d29288b1c8e57f62448bc6011a0dcd87b2807d9b10bbabee60956d3217
NEXTAUTH_SECRET=2233ace66a8493b6114d97c2ac032d60a758512430027426ac20cd7cba49ab05
```

### 3. Email Configuration (for OTP)

For **Gmail**:
1. Go to https://myaccount.google.com/security
2. Enable 2-Factor Authentication
3. Go to https://myaccount.google.com/apppasswords
4. Create an app password for "Mail"
5. Use the generated 16-character password

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
```

For **Other Email Providers**:
- **Outlook/Hotmail**: `smtp-mail.outlook.com` port `587`
- **Yahoo**: `smtp.mail.yahoo.com` port `587`
- **SendGrid**: `smtp.sendgrid.net` port `587`
- **Mailgun**: `smtp.mailgun.org` port `587`

### 4. NextAuth URL

```env
NEXTAUTH_URL=http://localhost:3000
```

For production, change to your domain:
```env
NEXTAUTH_URL=https://your-domain.com
```

## Step 4: Run Database Migrations

```bash
npx prisma generate
npx prisma db push
```

## Step 5: Start Development Server

```bash
npm run dev
```

## Step 6: Test the System

1. Go to http://localhost:3000/auth/register
2. Register with a real email address
3. Check your email for the OTP code
4. Enter the code on the verification page
5. Login with your verified account

## What Each Secret Does

### CRON_SECRET
- **Purpose**: Secures the cleanup endpoint that deletes unverified users
- **Used by**: Vercel Cron jobs (or external cron services)
- **Security**: Prevents unauthorized access to the cleanup endpoint
- **How it works**: The cron job sends this secret in the Authorization header

### NEXTAUTH_SECRET
- **Purpose**: Encrypts session tokens and cookies
- **Used by**: NextAuth.js for authentication
- **Security**: Keeps user sessions secure
- **How it works**: Used to sign and verify JWT tokens

## Troubleshooting

### "CRON_SECRET is not defined"
- Make sure you added it to your `.env` file
- Restart your development server after adding it

### "Email not sending"
- Check your email credentials
- Make sure you're using an App Password (not your regular password)
- Check if 2FA is enabled on your email account
- Try sending a test email manually

### "User not being deleted after 10 minutes"
- The cleanup runs every 5 minutes via cron
- Or it runs when someone visits the site (client-side trigger)
- You can manually trigger it: `POST http://localhost:3000/api/cron/cleanup-unverified`

## Production Deployment (Vercel)

1. Go to your Vercel project settings
2. Add all environment variables from your `.env` file
3. Deploy your project
4. Vercel will automatically run the cron job every 5 minutes

## Alternative: Generate Secrets Manually

If you don't want to use the script, you can generate secrets online:
- https://generate-secret.vercel.app/32
- Or use this command: `openssl rand -hex 32`
- Or use any password generator with 32+ characters

## Need Help?

See the detailed documentation:
- `EMAIL_VERIFICATION_SETUP.md` - Complete setup guide
- `IMPLEMENTATION_SUMMARY.md` - Technical overview
