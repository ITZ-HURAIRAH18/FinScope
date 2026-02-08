# Google OAuth Setup Guide

This guide will help you set up Google OAuth authentication for your FinScope application.

## Prerequisites

- A Google account
- Access to Google Cloud Console

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on **"Select a project"** at the top
3. Click **"NEW PROJECT"**
4. Enter a project name (e.g., "FinScope")
5. Click **"CREATE"**

## Step 2: Enable Google+ API

1. In your project, go to **"APIs & Services"** > **"Library"**
2. Search for **"Google+ API"**
3. Click on it and press **"ENABLE"**

## Step 3: Configure OAuth Consent Screen

1. Go to **"APIs & Services"** > **"OAuth consent screen"**
2. Select **"External"** user type (unless you have a Google Workspace account)
3. Click **"CREATE"**
4. Fill in the required fields:
   - **App name**: FinScope
   - **User support email**: Your email
   - **Developer contact information**: Your email
5. Click **"SAVE AND CONTINUE"**
6. On the **Scopes** page, click **"ADD OR REMOVE SCOPES"**
7. Select the following scopes:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
8. Click **"UPDATE"** then **"SAVE AND CONTINUE"**
9. On **Test users** page, click **"SAVE AND CONTINUE"**
10. Review your settings and click **"BACK TO DASHBOARD"**

## Step 4: Create OAuth Credentials

1. Go to **"APIs & Services"** > **"Credentials"**
2. Click **"CREATE CREDENTIALS"** > **"OAuth client ID"**
3. Select **"Web application"** as the application type
4. Enter a name (e.g., "FinScope Web Client")
5. Add **Authorized JavaScript origins** (click "ADD URI" to add multiple):
   - `http://localhost:3000` (for local development)
   - `https://finscope-hub.vercel.app` (for production - NO trailing slash!)
6. Add **Authorized redirect URIs** (click "ADD URI" to add multiple):
   - `http://localhost:3000/api/auth/callback/google` (for local development)
   - `https://finscope-hub.vercel.app/api/auth/callback/google` (for production)
7. Click **"CREATE"**
8. Copy the **Client ID** and **Client Secret** (you'll need these for the next step)

## Step 5: Add Credentials to Your Application

1. Open your `.env` or `.env.local` file in your project root
2. Add the following variables:

```env
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

3. Replace `your-client-id-here` and `your-client-secret-here` with the actual values from Step 4

## Step 6: Test the Integration

1. Restart your development server:
   ```bash
   npm run dev
   ```

2. Navigate to the login or register page
3. Click **"Continue with Google"**
4. Sign in with your Google account
5. You should be redirected back to your application and logged in

## Important Security Notes

- **Never commit your `.env` file to version control**
- Keep your `GOOGLE_CLIENT_SECRET` secure
- Use different credentials for development and production
- Regularly rotate your OAuth credentials
- Review the OAuth consent screen periodically

## Troubleshooting

### "Error 400: redirect_uri_mismatch"
- Make sure the redirect URI in Google Cloud Console exactly matches: `http://localhost:3000/api/auth/callback/google`
- Check for trailing slashes or http vs https mismatches

### "Access blocked: This app's request is invalid"
- Complete the OAuth consent screen configuration
- Add test users if your app is not yet verified
- Make sure you've enabled the Google+ API

### User not getting default balance
- The application automatically assigns a $100,000 starting balance to new OAuth users
- Check your database to verify the user was created correctly

## Production Deployment (Vercel)

Your production site is at: `https://finscope-hub.vercel.app`

### Vercel Environment Variables

Add these environment variables in your Vercel project settings:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** > **Environment Variables**
3. Add the following variables:

```
NEXTAUTH_URL=https://finscope-hub.vercel.app
NEXTAUTH_SECRET=your-nextauth-secret-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

4. Make sure to set them for **Production**, **Preview**, and **Development** environments
5. Redeploy your application after adding the variables

### Google Cloud Console Setup

1. Make sure you've added the production URLs to your OAuth credentials (see Step 4 above)
2. JavaScript origin: `https://finscope-hub.vercel.app`
3. Redirect URI: `https://finscope-hub.vercel.app/api/auth/callback/google`
4. Consider submitting your app for Google OAuth verification for better user trust

## Support

If you encounter any issues, refer to:
- [NextAuth.js Documentation](https://next-auth.js.org/providers/google)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
