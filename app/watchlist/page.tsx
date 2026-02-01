"use client";

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { useAppSelector } from '@/store/hooks';
import { formatCurrency, formatPercentage, getPriceChangeColor } from '@/lib/utils';
import LoadingScreen from '@/components/LoadingScreen';

interface WatchlistItem {
  id: string;
  symbol: string;
  type: string;
  meta: any;
  createdAt: string;
}

export default function WatchlistPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { cryptoPrices, stockPrices } = useAppSelector((state) => state.market);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchWatchlist();
    }
  }, [session]);

  const fetchWatchlist = async () => {
    try {
      const response = await fetch('/api/watchlist');
      const data = await response.json();
      setWatchlist(data.watchlist || []);
    } catch (error) {
      console.error('Failed to fetch watchlist:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (symbol: string, type: string) => {
    try {
      await fetch(`/api/watchlist?symbol=${symbol}&type=${type}`, {
        method: 'DELETE',
      });
      setWatchlist((prev) => prev.filter((item) => !(item.symbol === symbol && item.type === type)));
    } catch (error) {
      console.error('Failed to remove from watchlist:', error);
    }
  };

  const handleNavigate = (symbol: string, type: string) => {
    if (type === 'CRYPTO') {
      router.push(`/crypto/${symbol.toLowerCase()}`);
    } else {
      router.push(`/stocks/${symbol}`);
    }
  };

  if (status === 'loading' || isLoading) {
    return <LoadingScreen />;
  }

  const cryptoItems = watchlist.filter((item) => item.type === 'CRYPTO');
  const stockItems = watchlist.filter((item) => item.type === 'STOCK');

  return (
    <main className="min-h-screen bg-black">
      {/* Header */}
      <Header activePage="watchlist" />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">My Watchlist</h1>
          <p className="text-gray-400">Track your favorite assets in one place</p>
        </div>

        {watchlist.length === 0 ? (
          <div className="glass-card p-12 rounded-2xl text-center">
            <div className="text-2xl text-gray-400 mb-4">Your watchlist is empty</div>
            <p className="text-gray-500 mb-6">Start adding crypto and stocks to track them here</p>
            <a
              href="/dashboard"
              className="inline-block px-6 py-3 bg-gradient-to-r from-red-600 via-red-500 to-pink-500 rounded-lg text-white font-semibold hover:shadow-lg transition"
            >
              Browse Markets
            </a>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Crypto Watchlist */}
            {cryptoItems.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                  <span className="mr-2">₿</span> Cryptocurrency
                </h2>
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left px-6 py-4 text-gray-400 font-semibold">Symbol</th>
                          <th className="text-right px-6 py-4 text-gray-400 font-semibold">Price</th>
                          <th className="text-right px-6 py-4 text-gray-400 font-semibold">24h Change</th>
                          <th className="text-right px-6 py-4 text-gray-400 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cryptoItems.map((item) => {
                          const priceData = cryptoPrices[item.symbol];
                          return (
                            <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition">
                              <td
                                className="px-6 py-4 cursor-pointer"
                                onClick={() => handleNavigate(item.symbol, item.type)}
                              >
                                <div className="text-white font-semibold">{item.symbol}</div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="text-white font-mono">
                                  {priceData ? formatCurrency(priceData.price) : 'Loading...'}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {priceData && (
                                  <div className={`font-mono font-semibold ${getPriceChangeColor(priceData.priceChangePercent24h)}`}>
                                    {formatPercentage(priceData.priceChangePercent24h)}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  onClick={() => handleRemove(item.symbol, item.type)}
                                  className="text-red-400 hover:text-red-300 transition"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Stock Watchlist */}
            {stockItems.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                  <span className="mr-2">📈</span> Stocks
                </h2>
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left px-6 py-4 text-gray-400 font-semibold">Symbol</th>
                          <th className="text-right px-6 py-4 text-gray-400 font-semibold">Price</th>
                          <th className="text-right px-6 py-4 text-gray-400 font-semibold">Change</th>
                          <th className="text-right px-6 py-4 text-gray-400 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockItems.map((item) => {
                          const priceData = stockPrices[item.symbol];
                          return (
                            <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition">
                              <td
                                className="px-6 py-4 cursor-pointer"
                                onClick={() => handleNavigate(item.symbol, item.type)}
                              >
                                <div className="text-white font-semibold">{item.symbol}</div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="text-white font-mono">
                                  {priceData ? formatCurrency(priceData.price) : 'Loading...'}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {priceData && (
                                  <div className={`font-mono font-semibold ${getPriceChangeColor(priceData.priceChangePercent)}`}>
                                    {formatPercentage(priceData.priceChangePercent)}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  onClick={() => handleRemove(item.symbol, item.type)}
                                  className="text-red-400 hover:text-red-300 transition"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
