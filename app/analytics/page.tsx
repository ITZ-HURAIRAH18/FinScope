"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { binanceWS } from '@/lib/binance-websocket';
import { getFinnhubWS } from '@/lib/finnhub-websocket';
import { formatCurrency, formatPercentage, getPriceChangeColor } from '@/lib/utils';
import { updateCryptoPrices, updateStockPrices } from '@/store/slices/marketSlice';

export default function AnalyticsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { cryptoPrices, stockPrices } = useAppSelector((state) => state.market);

  useEffect(() => {
    // Initialize WebSocket connections
    binanceWS.connect();
    const unsubBinance = binanceWS.subscribe((prices) => {
      dispatch(updateCryptoPrices(prices));
    });

    const finnhubAPIKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';
    const finnhubWS = getFinnhubWS(finnhubAPIKey);
    finnhubWS.connect();
    const unsubFinnhub = finnhubWS.subscribe((prices) => {
      dispatch(updateStockPrices(prices));
    });

    return () => {
      unsubBinance();
      unsubFinnhub();
    };
  }, [dispatch]);

  // Get top gainers and losers
  const cryptoArray = Object.values(cryptoPrices) as any[];
  const stockArray = Object.values(stockPrices) as any[];

  const topCryptoGainers = [...cryptoArray]
    .sort((a, b) => b.priceChangePercent24h - a.priceChangePercent24h)
    .slice(0, 5);

  const topCryptoLosers = [...cryptoArray]
    .sort((a, b) => a.priceChangePercent24h - b.priceChangePercent24h)
    .slice(0, 5);

  const topStockGainers = [...stockArray]
    .sort((a, b) => (b.priceChangePercent || 0) - (a.priceChangePercent || 0))
    .slice(0, 5);

  const topStockLosers = [...stockArray]
    .sort((a, b) => (a.priceChangePercent || 0) - (b.priceChangePercent || 0))
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-black/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">F</span>
              </div>
              <span className="text-2xl font-bold gradient-text">FinScope</span>
            </div>
            <nav className="flex items-center space-x-6">
              <a href="/" className="text-gray-300 hover:text-white transition">Home</a>
              <a href="/dashboard" className="text-gray-300 hover:text-white transition">Markets</a>
              <a href="/analytics" className="text-white font-semibold">Analytics</a>
              <a href="/watchlist" className="text-gray-300 hover:text-white transition">Watchlist</a>
              <a href="/auth/login" className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 transition">
                Login
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Market Analytics</h1>
          <p className="text-gray-400">Real-time market insights and trends</p>
        </div>

        {/* Market Overview */}
        <div className="glass-card p-8 rounded-2xl mb-8">
          <h2 className="text-2xl font-bold text-white mb-6">Market Overview</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-gray-400 mb-2">Total Cryptocurrencies Tracked</div>
              <div className="text-3xl font-bold text-white">{cryptoArray.length}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-2">Total Stocks Tracked</div>
              <div className="text-3xl font-bold text-white">{stockArray.length}</div>
            </div>
          </div>
        </div>

        {/* Cryptocurrency Top Movers */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
            <span className="mr-2">₿</span> Cryptocurrency Top Movers
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Top Gainers */}
            <div className="glass-card p-6 rounded-2xl">
              <h3 className="text-xl font-bold text-green-400 mb-4">🚀 Top Gainers</h3>
              <div className="space-y-3">
                {topCryptoGainers.map((crypto, index) => (
                  <div
                    key={crypto.symbol}
                    onClick={() => router.push(`/crypto/${crypto.symbol.toLowerCase()}`)}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition cursor-pointer"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="text-gray-400 font-semibold">#{index + 1}</div>
                      <div>
                        <div className="text-white font-semibold">{crypto.symbol}</div>
                        <div className="text-sm text-gray-400">{formatCurrency(crypto.price)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-green-400 font-mono font-semibold">
                        {formatPercentage(crypto.priceChangePercent24h)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Losers */}
            <div className="glass-card p-6 rounded-2xl">
              <h3 className="text-xl font-bold text-red-400 mb-4">📉 Top Losers</h3>
              <div className="space-y-3">
                {topCryptoLosers.map((crypto, index) => (
                  <div
                    key={crypto.symbol}
                    onClick={() => router.push(`/crypto/${crypto.symbol.toLowerCase()}`)}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition cursor-pointer"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="text-gray-400 font-semibold">#{index + 1}</div>
                      <div>
                        <div className="text-white font-semibold">{crypto.symbol}</div>
                        <div className="text-sm text-gray-400">{formatCurrency(crypto.price)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-red-400 font-mono font-semibold">
                        {formatPercentage(crypto.priceChangePercent24h)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stock Top Movers */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
            <span className="mr-2">📈</span> Stock Market Top Movers
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Top Gainers */}
            <div className="glass-card p-6 rounded-2xl">
              <h3 className="text-xl font-bold text-green-400 mb-4">🚀 Top Gainers</h3>
              <div className="space-y-3">
                {topStockGainers.length > 0 ? (
                  topStockGainers.map((stock, index) => (
                    <div
                      key={stock.symbol}
                      onClick={() => router.push(`/stocks/${stock.symbol}`)}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition cursor-pointer"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="text-gray-400 font-semibold">#{index + 1}</div>
                        <div>
                          <div className="text-white font-semibold">{stock.symbol}</div>
                          <div className="text-sm text-gray-400">{formatCurrency(stock.price)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-green-400 font-mono font-semibold">
                          {formatPercentage(stock.priceChangePercent || 0)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-400 text-center py-4">Waiting for data...</div>
                )}
              </div>
            </div>

            {/* Top Losers */}
            <div className="glass-card p-6 rounded-2xl">
              <h3 className="text-xl font-bold text-red-400 mb-4">📉 Top Losers</h3>
              <div className="space-y-3">
                {topStockLosers.length > 0 ? (
                  topStockLosers.map((stock, index) => (
                    <div
                      key={stock.symbol}
                      onClick={() => router.push(`/stocks/${stock.symbol}`)}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition cursor-pointer"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="text-gray-400 font-semibold">#{index + 1}</div>
                        <div>
                          <div className="text-white font-semibold">{stock.symbol}</div>
                          <div className="text-sm text-gray-400">{formatCurrency(stock.price)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-red-400 font-mono font-semibold">
                          {formatPercentage(stock.priceChangePercent || 0)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-400 text-center py-4">Waiting for data...</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info Note */}
        <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg text-center">
          <p className="text-gray-300">
            💡 Data updates in real-time via WebSocket connections
          </p>
        </div>
      </div>
    </main>
  );
}
