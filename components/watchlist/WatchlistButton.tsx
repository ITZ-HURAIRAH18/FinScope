"use client";

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { Star, Loader2 } from 'lucide-react';

interface WatchlistButtonProps {
  symbol: string;
  type: 'CRYPTO' | 'STOCK';
  meta?: any;
}

export default function WatchlistButton({ symbol, type, meta }: WatchlistButtonProps) {
  const { data: session } = useSession();
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch watchlist status on mount
  useEffect(() => {
    if (!session?.user) return;

    const checkWatchlistStatus = async () => {
      try {
        const response = await fetch('/api/watchlist');
        if (response.ok) {
          const watchlist = await response.json();
          const exists = watchlist.some(
            (item: any) => item.symbol === symbol && item.type === type
          );
          setIsInWatchlist(exists);
        }
      } catch (error) {
        console.error('Failed to check watchlist status:', error);
      }
    };

    checkWatchlistStatus();
  }, [session?.user, symbol, type]);

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
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
        isInWatchlist
          ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 hover:border-yellow-500/50'
          : 'bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50'
      }`}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          <Star className={`w-4 h-4 ${isInWatchlist ? 'fill-current' : ''}`} />
          <span>{isInWatchlist ? 'Remove' : 'Add to Watchlist'}</span>
        </>
      )}
    </button>
  );
}
