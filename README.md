# FinScope – Real-Time Crypto & Stock Analytics Dashboard

A production-style financial analytics platform built with **Next.js 14**, **TypeScript**, **Redux Toolkit**, and **Tailwind CSS** that integrates real-time cryptocurrency and stock market data via WebSocket connections.

![FinScope Dashboard](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## 🎯 Features

- **Real-Time Market Data** - Live cryptocurrency prices via Binance WebSocket and stock prices via Finnhub WebSocket
- **Interactive Dashboard** - Toggle between crypto, stocks, or both markets with real-time updates
- **Search & Filter** - Instant search across thousands of assets
- **User Authentication** - Secure login with NextAuth.js
- **Personal Watchlists** - Save and track your favorite assets
- **Interactive Charts** - Beautiful responsive charts with multiple timeframes
- **Analytics** - Top movers, heatmaps, and market insights
- **Dark Mode** - Stunning dark theme with glassmorphism design
- **Responsive Design** - Optimized for desktop, tablet, and mobile

## 🏗️ Tech Stack

### Frontend
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Redux Toolkit** (State Management)
- **React Query** (Server State)
- **Recharts** (Data Visualization)

### Backend
- **Next.js API Routes**
- **Prisma ORM**
- **PostgreSQL**
- **NextAuth.js** (Authentication)

### Real-Time Data
- **Binance WebSocket** - Cryptocurrency prices
- **Finnhub WebSocket** - Stock market data

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL database (or use free tier from Supabase/Neon/Railway)
- Finnhub API key (free from [finnhub.io](https://finnhub.io))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/finscope.git
   cd finscope
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Copy `.env.example` to `.env.local` and fill in your values:
   ```bash
   cp .env.example .env.local
   ```

   Update the following variables:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/finscope"
   NEXTAUTH_SECRET="your-secret-key"  # Generate with: openssl rand -base64 32
   NEXTAUTH_URL="http://localhost:3000"
   FINNHUB_API_KEY="your-finnhub-api-key"
   NEXT_PUBLIC_FINNHUB_API_KEY="your-finnhub-api-key"
   ```

4. **Set up the database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
├── app/                    # Next.js app directory
│   ├── dashboard/         # Markets dashboard
│   ├── crypto/[id]/       # Crypto detail pages
│   ├── stocks/[symbol]/   # Stock detail pages
│   ├── watchlist/         # User watchlist
│   ├── analytics/         # Analytics page
│   └── auth/              # Authentication pages
├── components/            # React components
│   ├── markets/          # Market table components
│   ├── charts/           # Chart components
│   └── layout/           # Layout components
├── store/                 # Redux store
│   └── slices/           # Redux slices
├── lib/                   # Utility libraries
│   ├── binance-websocket.ts    # Binance WebSocket client
│   ├── finnhub-websocket.ts    # Finnhub WebSocket client
│   ├── prisma.ts               # Prisma client
│   └── utils.ts                # Utility functions
├── prisma/               # Database schema
└── public/               # Static assets
```

## 🔑 API Keys

### Finnhub (Stock Data)
1. Sign up at [finnhub.io](https://finnhub.io)
2. Get your free API key
3. Add to `.env.local`

### Binance (Crypto Data)
- No API key required
- Uses public WebSocket streams

## 📊 Available Markets

### Cryptocurrencies
- Bitcoin (BTC)
- Ethereum (ETH)
- Binance Coin (BNB)
- Solana (SOL)
- XRP, Cardano (ADA), Dogecoin, and more...

### Stocks
- AAPL, GOOGL, MSFT, TSLA
- AMZN, META, NVDA, AMD
- NFLX, DIS, and more...

## 🎨 Features Breakdown

### Landing Page
- Hero section with gradient background
- Feature highlights
- Market preview
- Call-to-action buttons

### Dashboard
- Real-time price tables
- Color-coded price changes
- Market type filters (Crypto/Stocks/Both)
- Search functionality
- Click rows to view details

### Detail Pages
- Live price charts with multiple timeframes
- Key metrics (market cap, volume, etc.)
- 24-hour price statistics
- Add to watchlist functionality

### Watchlist (Protected)
- Save favorite assets
- Quick price overview
- Easy management

## 🛠️ Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint

# Database commands
npx prisma studio        # Open Prisma Studio
npx prisma generate      # Generate Prisma Client
npx prisma db push       # Push schema to database
```

## 🚢 Deployment

### Vercel (Recommended)
1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy!

### Environment Variables on Vercel
Make sure to add all variables from `.env.local` to your Vercel project settings.

## 📝 License

MIT License - feel free to use this project for your portfolio or personal projects.

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 📧 Contact

Built by [Your Name]
- GitHub: [@yourusername](https://github.com/yourusername)
- LinkedIn: [Your Profile](https://linkedin.com/in/yourprofile)

---

**Note**: This project is for educational and portfolio purposes. Not financial advice!
