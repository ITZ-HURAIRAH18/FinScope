# FinScope - Getting Started Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Next.js, React, TypeScript
- Redux Toolkit for state management
- NextAuth for authentication
- Prisma for database
- Recharts for charts
- WebSocket libraries for real-time data

### 2. Setup Your Database

You'll need a PostgreSQL database. Get a free one from:
- **Supabase**: https://supabase.com (recommended)
- **Neon**: https://neon.tech
- **Railway**: https://railway.app

After creating your database, you'll get a connection URL that looks like:
```
postgresql://user:password@host:5432/database
```

### 3. Configure Environment Variables

Copy the example file:
```bash
copy .env.example .env.local
```

Edit `.env.local` with your values:

```env
# Database - use your PostgreSQL connection string
DATABASE_URL="postgresql://user:password@host:5432/finscope"

# NextAuth - generate a secret with: openssl rand -base64 32
# Or use any random 32-character string
NEXTAUTH_SECRET="your-generated-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Finnhub API - already provided
FINNHUB_API_KEY="d4hffe9r01qgvvc7gjv0d4hffe9r01qgvvc7gjvg"
NEXT_PUBLIC_FINNHUB_API_KEY="d4hffe9r01qgvvc7gjv0d4hffe9r01qgvvc7gjvg"
```

### 4. Setup the Database Schema

```bash
npx prisma generate
npx prisma db push
```

This creates the necessary tables (`User`, `Account`, `Session`, `Watchlist`) in your database.

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser!

## What You'll See

### Landing Page (/)
- Beautiful hero section with gradient background
- Feature highlights
- Market previews
- Call-to-action buttons

### Dashboard (/dashboard)
- Real-time crypto prices from Binance WebSocket
- Real-time stock prices from Finnhub WebSocket
- Toggle between Crypto/Stocks/Both
- Search functionality
- Click any row to see details

### Detail Pages
- `/crypto/btc` - Bitcoin detail page with stats
- `/stocks/AAPL` - Apple stock detail page
- Real-time price updates
- Add to watchlist button

### Watchlist (/watchlist)
- Protected page (requires login)
- Shows your saved assets
- Real-time price updates
- Quick navigation to detail pages

### Analytics (/analytics)
- Top crypto gainers/losers
- Top stock gainers/losers
- Market overview statistics

### Authentication (/auth/login, /auth/register)
- Create an account
- Login to access watchlist
- Secure password hashing with bcrypt

## Project Structure

```
├── app/                    # Next.js pages
│   ├── dashboard/         # Markets dashboard
│   ├── crypto/[id]/       # Crypto detail pages
│   ├── stocks/[symbol]/   # Stock detail pages
│   ├── watchlist/         # Protected watchlist
│   ├── analytics/         # Analytics page
│   ├── auth/              # Login/Register
│   └── api/               # API routes
├── components/            # Reusable components
│   ├── markets/          # Market table
│   └── watchlist/        # Watchlist button
├── lib/                   # Utilities
│   ├── binance-websocket.ts   # Crypto WebSocket
│   ├── finnhub-websocket.ts   # Stock WebSocket
│   ├── auth.ts                # NextAuth config
│   ├── prisma.ts              # Database client
│   └── utils.ts               # Helper functions
├── store/                 # Redux state
│   └── slices/           # Theme & Market slices
└── prisma/               # Database schema
```

## Key Features

✅ **Real-Time Data** - WebSocket connections for live prices  
✅ **Authentication** - Secure login with NextAuth  
✅ **Watchlist** - Save and track favorite assets  
✅ **Redux Toolkit** - Modern state management  
✅ **Dark Mode** - Beautiful glassmorphism UI  
✅ **Responsive** - Works on all devices  
✅ **TypeScript** - Full type safety  

## Tip

Open your browser DevTools → Network → WS to see the WebSocket connections in action!

## Common Issues

### "Cannot find module" errors
Run: `npm install`

### WebSocket not connecting
- Check that dev server is running
- Make sure Finnhub API key is in `.env.local`
- Check browser console for errors

### Database errors
- Verify `DATABASE_URL` in `.env.local`
- Run `npx prisma db push` again
- Check database is accessible

### NextAuth errors
- Make sure `NEXTAUTH_SECRET` is set
- Verify `NEXTAUTH_URL` matches your dev server

## Next Steps

- Customize the color scheme in `tailwind.config.ts`
- Add more cryptocurrencies in `lib/binance-websocket.ts`
- Add more stocks in `lib/finnhub-websocket.ts`
- Implement price charts with Recharts
- Add price alerts feature
- Deploy to Vercel

Enjoy building with FinScope! 🚀
