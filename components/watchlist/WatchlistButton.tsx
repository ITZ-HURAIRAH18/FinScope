"use client";

import { useSession } from 'next-auth/react';
import { useState } from 'react';

interface WatchlistButtonProps {
  symbol: string;
  type: 'CRYPTO' | 'STOCK';
  meta?: any;
}

export default function WatchlistButton({ symbol, type, meta }: WatchlistButtonProps) {
  const { data: session } = useSession();
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    if (!session?.user) {
      window.location.href = '/auth/login';
      return;
    }

    setIsLoading(true);

    try {
      if (isInWatchlist) {
        // Remove from watchlist
        await fetch(`/api/watchlist?symbol=${symbol}&type=${type}`, {
          method: 'DELETE',
        });
        setIsInWatchlist(false);
      } else {
        // Add to watchlist
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            symbol,
            type,
meta: meta || {},
          }),
        });
        setIsInWatchlist(true);
      }
    } catch (error) {
      console.error('Watchlist toggle error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`px-6 py-3 rounded-lg font-semibold transition transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed ${
        isInWatchlist
          ? 'bg-red-500/20 border border-red-500 text-red-400 hover:bg-red-500/30'
          : 'bg-blue-500/20 border border-blue-500 text-blue-400 hover:bg-blue-500/30'
      }`}
    >
      {isLoading ? '...' : isInWatchlist ? '⭐ Remove from Watchlist' : '⭐ Add to Watchlist'}
    </button>
  );
}
