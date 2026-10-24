"use client";

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { Star, Loader2 } from 'lucide-react';

interface WatchlistButtonProps {
  symbol: string;
  type: 'CRYPTO' | 'STOCK';
  meta?: any;
}

/**
 * Star toggle for the watchlist (audit S2 fixes):
 * - Reads the membership flag from `GET /api/watchlist?symbol&type`
 *   (`{ inWatchlist }`). The old code called `.some()` on the API's
 *   `{ watchlist: [...] }` wrapper → TypeError swallowed by catch → the star
 *   could never show "Remove".
 * - Mutations are checked with `response.ok`; on failure the optimistic flip
 *   is rolled back and the server's message surfaced, so the UI can no longer
 *   claim a change the API rejected.
 * - Membership is a single indexed lookup, not a full-list download (N+1).
 */
export default function WatchlistButton({ symbol, type, meta }: WatchlistButtonProps) {
  const { data: session } = useSession();
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session?.user) {
      setIsInWatchlist(false);
      return;
    }

    let cancelled = false;
    const checkWatchlistStatus = async () => {
      try {
        const response = await fetch(
          `/api/watchlist?symbol=${encodeURIComponent(symbol)}&type=${type}`
        );
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && typeof data.inWatchlist === 'boolean') {
          setIsInWatchlist(data.inWatchlist);
        }
      } catch (error) {
        console.error('Failed to check watchlist status:', error);
      }
    };

    checkWatchlistStatus();
    return () => {
      cancelled = true;
    };
  }, [session?.user, symbol, type]);

  const handleToggle = async () => {
    if (!session?.user) {
      window.location.href = '/auth/login';
      return;
    }

    setIsLoading(true);
    setError('');

    // Optimistic flip — rolled back below if the API rejects it.
    const wasIn = isInWatchlist;
    setIsInWatchlist(!wasIn);

    try {
      const response = wasIn
        ? await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}&type=${type}`, {
            method: 'DELETE',
          })
        : await fetch('/api/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, type, meta: meta || {} }),
          });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setIsInWatchlist(wasIn); // rollback
        setError(data.error || 'Could not update watchlist');
      }
    } catch (error) {
      console.error('Watchlist toggle error:', error);
      setIsInWatchlist(wasIn); // rollback
      setError('Network error — try again');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleToggle}
        disabled={isLoading}
        aria-pressed={isInWatchlist}
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
      {error && <span className="text-xs text-error">{error}</span>}
    </div>
  );
}
