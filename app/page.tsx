"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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
    { name: 'Binance Coin', symbol: 'BNB' },
    { name: 'Cardano', symbol: 'ADA' },
    { name: 'Solana', symbol: 'SOL' }
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
          <div className="flex flex-wrap justify-center gap-6 pt-8">
            <div className="glass-card px-8 py-4 rounded-full flex items-center gap-4 hover:scale-105 transition duration-300 cursor-pointer">
              <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-lg shadow-red-500/20">
                <Image 
                  src="https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&w=128&q=80"
                  alt="Real-time"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xl font-semibold text-red-400">Real-time Data</span>
            </div>
            <div className="glass-card px-8 py-4 rounded-full flex items-center gap-4 hover:scale-105 transition duration-300 cursor-pointer">
              <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-lg shadow-pink-500/20">
                <Image 
                  src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=128&q=80"
                  alt="Charts"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xl font-semibold text-pink-400">Interactive Charts</span>
            </div>
            <div className="glass-card px-8 py-4 rounded-full flex items-center gap-4 hover:scale-105 transition duration-300 cursor-pointer">
              <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-lg shadow-rose-500/20">
                <Image 
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=128&q=80"
                  alt="Watchlists"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xl font-semibold text-rose-400">Watchlists</span>
            </div>
            <div className="glass-card px-8 py-4 rounded-full flex items-center gap-4 hover:scale-105 transition duration-300 cursor-pointer">
               <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-lg shadow-pink-500/20">
                <Image 
                  src="https://images.unsplash.com/photo-1551808525-51a94da548ce?auto=format&fit=crop&w=128&q=80"
                  alt="Analytics"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xl font-semibold text-pink-400">Analytics</span>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-gradient-to-r from-red-600 via-red-500 to-pink-500 rounded-lg text-white font-semibold text-lg hover:shadow-lg hover:shadow-red-500/50 transition transform hover:-translate-y-1"
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
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:shadow-xl hover:shadow-red-500/20 transition group">
            <div className="w-full h-48 relative rounded-xl overflow-hidden mb-4">
              <Image
                src="https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&w=800&q=80"
                alt="Live Market Data"
                fill
                className="object-cover group-hover:scale-110 transition duration-500"
              />
            </div>
            <h3 className="text-2xl font-bold text-white">Live Market Data</h3>
            <p className="text-gray-400">
              Track real-time prices for thousands of cryptocurrencies and stocks
              with WebSocket connections for instant updates
            </p>
          </div>

          {/* Feature 2 */}
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:shadow-xl hover:shadow-pink-500/20 transition group">
            <div className="w-full h-48 relative rounded-xl overflow-hidden mb-4">
               <Image
                src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80"
                alt="Interactive Charts"
                fill
                className="object-cover group-hover:scale-110 transition duration-500"
              />
            </div>
            <h3 className="text-2xl font-bold text-white">Interactive Charts</h3>
            <p className="text-gray-400">
              Analyze trends with beautiful, responsive charts featuring multiple
              timeframes and technical indicators
            </p>
          </div>

          {/* Feature 3 */}
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:shadow-xl hover:shadow-rose-500/20 transition group">
            <div className="w-full h-48 relative rounded-xl overflow-hidden mb-4">
               <Image
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80"
                alt="Personal Watchlists"
                fill
                className="object-cover group-hover:scale-110 transition duration-500"
              />
            </div>
            <h3 className="text-2xl font-bold text-white">Personal Watchlists</h3>
            <p className="text-gray-400">
              Create and manage custom watchlists to keep track of your favorite
              assets all in one place
            </p>
          </div>
        </div>
      </section>

      {/* Market Preview with Charts */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Markets at a Glance
          </h2>
          <p className="text-gray-400 text-lg">
            Real-time market updates with live charts
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Crypto Chart */}
          <div className="glass-card p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                <div className="relative w-8 h-8 rounded-full overflow-hidden bg-orange-500 flex items-center justify-center">
                  <Image 
                    src="https://cryptologos.cc/logos/bitcoin-btc-logo.png"
                    alt="Crypto"
                    width={24}
                    height={24}
                    className="object-contain"
                  />
                </div>
                Cryptocurrency
              </h3>
            </div>
            
            {/* Live Prices */}
            <div className="space-y-4 mb-6">
              {cryptoSymbols.map(({ name, symbol }) => {
                const priceData = cryptoPrices[symbol];
                return (
                  <div key={symbol} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition">
                    <div>
                      <div className="text-white font-semibold">{name}</div>
                      <div className="text-gray-400 text-sm">{symbol}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-mono font-semibold">
                        {priceData ? formatCurrency(priceData.price) : 'Loading...'}
                      </div>
                      {priceData && (
                        <div className={`text-sm font-semibold ${getPriceChangeColor(priceData.priceChangePercent24h)}`}>
                          {formatPercentage(priceData.priceChangePercent24h)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <Link
              href="/dashboard?tab=crypto"
              className="mt-4 block w-full text-center py-3 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition font-semibold"
            >
              View all crypto →
            </Link>
          </div>

          {/* Stocks Chart */}
          <div className="glass-card p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                <div className="relative w-8 h-8 rounded-full overflow-hidden bg-pink-500/20 flex items-center justify-center">
                  <span className="text-pink-400 font-bold text-xl">$</span>
                </div>
                Stocks
              </h3>
            </div>
            
            {/* Live Prices */}
            <div className="space-y-4 mb-6">
              {stockSymbols.map((symbol) => {
                const priceData = stockPrices[symbol];
                return (
                  <div key={symbol} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition">
                    <div>
                      <div className="text-white font-semibold">{symbol}</div>
                      <div className="text-gray-400 text-sm">Stock</div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-mono font-semibold">
                        {priceData ? formatCurrency(priceData.price) : 'Loading...'}
                      </div>
                      {priceData && (
                        <div className={`text-sm font-semibold ${getPriceChangeColor(priceData.priceChangePercent)}`}>
                          {formatPercentage(priceData.priceChangePercent)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <Link
              href="/dashboard?tab=stocks"
              className="mt-4 block w-full text-center py-3 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition font-semibold"
            >
              View all stocks →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-400">
          <p>© {new Date().getFullYear()} FinScope. All rights reserved.</p>
          <p className="mt-2">Developed by M Abu Hurairah</p>
        </div>
      </footer>
    </main>
  );
}
