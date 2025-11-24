"use client";

import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setActiveMarket, setSearchQuery, setSortField, updateCryptoPrices, updateStockPrices } from '@/store/slices/marketSlice';
import { binanceWS } from '@/lib/binance-websocket';
import { getFinnhubWS } from '@/lib/finnhub-websocket';
import MarketTable from '@/components/markets/MarketTable';

export default function DashboardPage() {
  const dispatch = useAppDispatch();
  const { activeMarket, searchQuery } = useAppSelector(state => state.market);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize WebSocket connections
    console.log('Initializing WebSocket connections...');
    
    // Connect to Binance
    binanceWS.connect(); 
    const unsubBinance = binanceWS.subscribe((prices) => {
      dispatch(updateCryptoPrices(prices));
    });

    // Connect to Finnhub
    const finnhubAPIKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';
    const finnhubWS = getFinnhubWS(finnhubAPIKey);
    finnhubWS.connect();
    const unsubFinnhub = finnhubWS.subscribe((prices) => {
      dispatch(updateStockPrices(prices));
    });

    setIsInitialized(true);

    // Cleanup
    return () => {
      unsubBinance();
      unsubFinnhub();
      binanceWS.disconnect();
      finnhubWS.disconnect();
    };
  }, [dispatch]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-black/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">F</span>
              </div>
              <span className="text-2xl font-bold gradient-text">FinScope</span>
            </div>

            {/* Navigation */}
            <nav className="flex items-center space-x-6">
              <a href="/" className="text-gray-300 hover:text-white transition">
                Home
              </a>
              <a href="/dashboard" className="text-white font-semibold">
                Markets
              </a>
              <a href="/analytics" className="text-gray-300 hover:text-white transition">
                Analytics
              </a>
              <a href="/watchlist" className="text-gray-300 hover:text-white transition">
                Watchlist
              </a>
              <a href="/auth/login" className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 transition">
                Login
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Markets Dashboard</h1>
          <p className="text-gray-400">Real-time cryptocurrency and stock market data</p>
        </div>

        {/* Filters */}
        <div className="glass-card p-6 rounded-2xl mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            {/* Market Type Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => dispatch(setActiveMarket('crypto'))}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  activeMarket === 'crypto'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                Crypto
              </button>
              <button
                onClick={() => dispatch(setActiveMarket('stocks'))}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  activeMarket === 'stocks'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                Stocks
              </button>
              <button
                onClick={() => dispatch(setActiveMarket('both'))}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  activeMarket === 'both'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                Both
              </button>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search symbols..."
                value={searchQuery}
                onChange={(e) => dispatch(setSearchQuery(e.target.value))}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Market Tables */}
        {!isInitialized ? (
          <div className="glass-card p-12 rounded-2xl text-center">
            <div className="animate-pulse">
              <div className="text-2xl text-gray-400">Connecting to markets...</div>
              <div className="text-gray-500 mt-2">Establishing WebSocket connections</div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {(activeMarket === 'crypto' || activeMarket === 'both') && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                  <span className="mr-2">₿</span> Cryptocurrency Markets
                </h2>
                <MarketTable type="crypto" />
              </div>
            )}

            {(activeMarket === 'stocks' || activeMarket === 'both') && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                  <span className="mr-2">📈</span> Stock Markets
                </h2>
                <MarketTable type="stocks" />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
