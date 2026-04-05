"use client";

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { useAppSelector } from '@/store/hooks';
import { formatCurrency, formatPercentage, getPriceChangeColor } from '@/lib/utils';
import LoadingScreen from '@/components/LoadingScreen';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui';

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
    <main className="min-h-screen bg-background">
      <Header activePage="watchlist" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 animate-fade-in">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              My Watchlist
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track your favorite assets in one place
            </p>
          </div>
        </div>

        {watchlist.length === 0 ? (
          <Card className="rounded-lg">
            <CardContent className="py-16 text-center">
              <svg className="w-12 h-12 mx-auto mb-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <h3 className="text-sm font-medium text-foreground mb-1">Your watchlist is empty</h3>
              <p className="text-xs text-muted-foreground mb-5">Start adding crypto and stocks to track them here</p>
              <a href="/dashboard">
                <Button variant="primary" size="sm">Browse Markets</Button>
              </a>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Crypto Watchlist */}
            {cryptoItems.length > 0 && (
              <div className="animate-slide-up">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H11.5v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.65c.1 1.7 1.36 2.66 2.85 2.97V19h1.75v-1.68c1.52-.29 2.72-1.18 2.72-2.77-.01-2.03-1.7-2.79-3.66-3.41z"/>
                    </svg>
                  </div>
                  <h2 className="text-base font-medium text-foreground tracking-tight">Cryptocurrency</h2>
                </div>
                <Card className="rounded-lg">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-card-border">
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Symbol</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Price</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">24h Change</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cryptoItems.map((item) => {
                            const priceData = cryptoPrices[item.symbol];
                            return (
                              <tr key={item.id} className="border-b border-card-border/50 last:border-0 hover:bg-accent/50 transition-colors duration-150">
                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => handleNavigate(item.symbol, item.type)}
                                    className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                                  >
                                    {item.symbol}
                                  </button>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="text-sm font-mono text-foreground">
                                    {priceData ? formatCurrency(priceData.price) : 'Loading...'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {priceData && (
                                    <span className={`text-sm font-mono font-medium ${getPriceChangeColor(priceData.priceChangePercent24h)}`}>
                                      {formatPercentage(priceData.priceChangePercent24h)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => handleRemove(item.symbol, item.type)}
                                    className="text-xs text-error hover:text-error/80 transition-colors font-medium"
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
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Stock Watchlist */}
            {stockItems.length > 0 && (
              <div className="animate-slide-up animate-delay-100">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 13h2v8H3v-8zm4-4h2v12H7V9zm4-4h2v16h-2V5zm4 8h2v8h-2v-8zm4-6h2v14h-2V7z"/>
                    </svg>
                  </div>
                  <h2 className="text-base font-medium text-foreground tracking-tight">Stocks</h2>
                </div>
                <Card className="rounded-lg">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-card-border">
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Symbol</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Price</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Change</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockItems.map((item) => {
                            const priceData = stockPrices[item.symbol];
                            return (
                              <tr key={item.id} className="border-b border-card-border/50 last:border-0 hover:bg-accent/50 transition-colors duration-150">
                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => handleNavigate(item.symbol, item.type)}
                                    className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                                  >
                                    {item.symbol}
                                  </button>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="text-sm font-mono text-foreground">
                                    {priceData ? formatCurrency(priceData.price) : 'Loading...'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {priceData && (
                                    <span className={`text-sm font-mono font-medium ${getPriceChangeColor(priceData.priceChangePercent)}`}>
                                      {formatPercentage(priceData.priceChangePercent)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => handleRemove(item.symbol, item.type)}
                                    className="text-xs text-error hover:text-error/80 transition-colors font-medium"
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
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
