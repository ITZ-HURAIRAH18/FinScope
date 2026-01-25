"use client";

import { useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { updateCryptoPrices, updateStockPrices } from "@/store/slices/marketSlice";
import { binanceWS } from "@/lib/binance-websocket";
import { getFinnhubWS } from "@/lib/finnhub-websocket";
import { formatCurrency, formatPercentage, getPriceChangeColor } from "@/lib/utils";

export default function HomePage() {
  const dispatch = useAppDispatch();
  const { cryptoPrices, stockPrices } = useAppSelector((state) => state.market);

  useEffect(() => {
    // Initialize WebSocket connections
    console.log("Homepage: Initializing WebSocket connections...");

    // Connect to Binance for crypto
    binanceWS.connect();
    const unsubBinance = binanceWS.subscribe((prices) => {
      dispatch(updateCryptoPrices(prices));
    });

    // Connect to Finnhub for stocks
    const finnhubAPIKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || "";
    const finnhubWS = getFinnhubWS(finnhubAPIKey);
    finnhubWS.connect();
    const unsubFinnhub = finnhubWS.subscribe((prices) => {
      dispatch(updateStockPrices(prices));
    });

    // Cleanup
    return () => {
      unsubBinance();
      unsubFinnhub();
      binanceWS.disconnect();
      finnhubWS.disconnect();
    };
  }, [dispatch]);

  // Market preview data
  const cryptoSymbols = [
    { name: 'Bitcoin', symbol: 'BTC' },
    { name: 'Ethereum', symbol: 'ETH' },
    { name: 'Binance Coin', symbol: 'BNB' }
  ];

  const stockSymbols = ['AAPL', 'GOOGL', 'TSLA', 'GLD', 'SLV'];
  return (
    <main className="min-h-screen bg-black">
      {/* Header */}
      <Header activePage="home" />

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center space-y-8">
          {/* Title */}
          <div className="space-y-4 animate-fadeIn">
            <h1 className="text-5xl md:text-7xl font-bold text-white">
              Track Crypto & Stocks
            </h1>
            <h2 className="text-4xl md:text-6xl font-bold gradient-text">
              In One Place
            </h2>
          </div>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto">
            Real-time market data, interactive charts, and powerful analytics
            for cryptocurrencies and stocks
          </p>

          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <div className="glass-card px-6 py-3 rounded-full">
              <span className="text-blue-400">⚡ Real-time Data</span>
            </div>
            <div className="glass-card px-6 py-3 rounded-full">
              <span className="text-purple-400">📊 Interactive Charts</span>
            </div>
            <div className="glass-card px-6 py-3 rounded-full">
              <span className="text-green-400">⭐ Watchlists</span>
            </div>
            <div className="glass-card px-6 py-3 rounded-full">
              <span className="text-pink-400">📈 Analytics</span>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-semibold text-lg hover:shadow-lg hover:shadow-blue-500/50 transition transform hover:-translate-y-1"
            >
              View Markets
            </Link>
            <Link
              href="/auth/register"
              className="px-8 py-4 glass-card rounded-lg text-white font-semibold text-lg hover:shadow-lg transition transform hover:-translate-y-1"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:shadow-xl hover:shadow-blue-500/20 transition">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <span className="text-3xl">📊</span>
            </div>
            <h3 className="text-2xl font-bold text-white">Live Market Data</h3>
            <p className="text-gray-400">
              Track real-time prices for thousands of cryptocurrencies and stocks
              with WebSocket connections for instant updates
            </p>
          </div>

          {/* Feature 2 */}
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:shadow-xl hover:shadow-purple-500/20 transition">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <span className="text-3xl">📈</span>
            </div>
            <h3 className="text-2xl font-bold text-white">Interactive Charts</h3>
            <p className="text-gray-400">
              Analyze trends with beautiful, responsive charts featuring multiple
              timeframes and technical indicators
            </p>
          </div>

          {/* Feature 3 */}
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:shadow-xl hover:shadow-green-500/20 transition">
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
              <span className="text-3xl">⭐</span>
            </div>
            <h3 className="text-2xl font-bold text-white">Personal Watchlists</h3>
            <p className="text-gray-400">
              Create and manage custom watchlists to keep track of your favorite
              assets all in one place
            </p>
          </div>
        </div>
      </section>

      {/* Market Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Markets at a Glance
          </h2>
          <p className="text-gray-400 text-lg">
            See what&apos;s moving in crypto and stock markets
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Crypto Preview */}
          <div className="glass-card p-6 rounded-2xl">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
              <span className="mr-2">₿</span> Cryptocurrency
            </h3>
            
            {/* Table Header */}
            <div className="grid grid-cols-3 gap-4 pb-3 border-b border-white/10 mb-4">
              <div className="text-gray-400 text-sm font-semibold">Symbol</div>
              <div className="text-gray-400 text-sm font-semibold text-right">Price</div>
              <div className="text-gray-400 text-sm font-semibold text-right">24h Change</div>
            </div>
            
            {/* Table Rows */}
            <div className="space-y-3">
              {cryptoSymbols.map(({ name, symbol }) => {
                const priceData = cryptoPrices[symbol];
                return (
                  <div key={symbol} className="grid grid-cols-3 gap-4 items-center py-1">
                    <div className="text-white font-medium">{name}</div>
                    <div className="text-white font-mono text-right">
                      {priceData ? formatCurrency(priceData.price) : 'Loading...'}
                    </div>
                    <div className="text-right">
                      {priceData && (
                        <span className={`font-semibold ${getPriceChangeColor(priceData.priceChangePercent24h)}`}>
                          {formatPercentage(priceData.priceChangePercent24h)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <Link
              href="/dashboard?tab=crypto"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300 transition"
            >
              View all crypto →
            </Link>
          </div>

          {/* Stocks Preview */}
          <div className="glass-card p-6 rounded-2xl">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
              <span className="mr-2">📈</span> Stocks
            </h3>
            
            {/* Table Header */}
            <div className="grid grid-cols-3 gap-4 pb-3 border-b border-white/10 mb-4">
              <div className="text-gray-400 text-sm font-semibold">Symbol</div>
              <div className="text-gray-400 text-sm font-semibold text-right">Price</div>
              <div className="text-gray-400 text-sm font-semibold text-right">Change</div>
            </div>
            
            {/* Table Rows */}
            <div className="space-y-3">
              {stockSymbols.map((symbol) => {
                const priceData = stockPrices[symbol];
                return (
                  <div key={symbol} className="grid grid-cols-3 gap-4 items-center py-1">
                    <div className="text-white font-medium">{symbol}</div>
                    <div className="text-white font-mono text-right">
                      {priceData ? formatCurrency(priceData.price) : 'Loading...'}
                    </div>
                    <div className="text-right">
                      {priceData && (
                        <span className={`font-semibold ${getPriceChangeColor(priceData.priceChangePercent)}`}>
                          {formatPercentage(priceData.priceChangePercent)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <Link
              href="/dashboard?tab=stocks"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300 transition "
            >
              View all stocks →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-400">
          <p>© 2024 FinScope. All rights reserved.</p>
          <p className="mt-2">Developed by M Abu Hurairah</p>
        </div>
      </footer>
    </main>
  );
}
