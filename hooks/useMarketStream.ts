"use client";

import { useEffect, useRef } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { updateCryptoPrices, updateStockPrices } from '@/store/slices/marketSlice';
import { binanceWS } from '@/lib/binance-websocket';
import { getFinnhubWS } from '@/lib/finnhub-websocket';

interface MarketStreamOptions {
  crypto?: boolean;
  stocks?: boolean;
  /** Called on every price batch (e.g. to stamp a "last updated" clock). */
  onUpdate?: () => void;
}

/**
 * Connects the singleton market data streams for the lifetime of a page and
 * dispatches updates into the Redux store.
 *
 * Design notes (see docs/AUDIT-REPORT.md, findings S4/M6):
 * - Every page that displays prices must call this hook — previously only the
 *   dashboard connected the streams, so direct navigation to watchlist/portfolio
 *   pages showed "Loading…" / "-" forever.
 * - Streams are singletons and are intentionally left open across client-side
 *   navigations (instant data on the next page); they are closed on page unload.
 * - Cleanup only unsubscribes this page's callbacks, so one page unmounting can
 *   no longer kill another page's subscription (the old `window.__*Cleanup`
 *   pattern raced and leaked).
 */
export function useMarketStream(options: MarketStreamOptions = {}) {
  const { crypto = true, stocks = true } = options;
  const dispatch = useAppDispatch();

  // Keep the latest callback in a ref so callers can pass inline functions
  // without tearing down/resubscribing the streams on every render.
  const onUpdateRef = useRef(options.onUpdate);
  useEffect(() => {
    onUpdateRef.current = options.onUpdate;
  });

  useEffect(() => {
    let unsubCrypto: (() => void) | undefined;
    let unsubStocks: (() => void) | undefined;
    let cancelled = false;

    const notify = () => onUpdateRef.current?.();

    if (crypto) {
      binanceWS.connect();
      unsubCrypto = binanceWS.subscribe((prices) => {
        dispatch(updateCryptoPrices(prices));
        notify();
      });
    }

    if (stocks) {
      (async () => {
        try {
          const ws = await getFinnhubWS();
          if (cancelled) return;
          ws.connect();
          unsubStocks = ws.subscribe((prices) => {
            dispatch(updateStockPrices(prices));
            notify();
          });
        } catch (error) {
          console.error('[MarketStream] Failed to start stock stream:', error);
        }
      })();
    }

    return () => {
      cancelled = true;
      unsubCrypto?.();
      unsubStocks?.();
    };
  }, [dispatch, crypto, stocks]);
}

// Close the streams when the page is actually being torn down (tab close/refresh).
if (typeof window !== 'undefined' && !window.__finnStreamTeardown) {
  window.__finnStreamTeardown = true;
  const teardown = () => {
    try {
      binanceWS.disconnect();
      getFinnhubWS().then((ws) => ws.disconnect()).catch(() => undefined);
    } catch {
      // ignore — page is unloading
    }
  };
  window.addEventListener('pagehide', teardown);
}
