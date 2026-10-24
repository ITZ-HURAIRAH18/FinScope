"use client";

import { useCallback } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { updateCryptoPrices, updateStockPrices } from '@/store/slices/marketSlice';

/**
 * One-shot price snapshot for symbols the live WebSocket streams don't cover
 * (docs/AUDIT-REPORT.md S4).
 *
 * The Binance/Finnhub streams subscribe a FIXED symbol list. Watchlist and
 * portfolio rows can contain any symbol the user ever bought or starred, so
 * anything outside those lists used to render "Loading…"/"-" forever. This
 * hook fills the gaps from REST:
 *   - crypto: one batched `/api/crypto-prices` call (CoinGecko, server-cached)
 *   - stocks: one `/api/finnhub/quote` call per symbol, capped to bound the
 *     free-tier budget (60 calls/min)
 *
 * Snapshots land in the same Redux market store the streams write to, so a
 * later live tick simply overwrites them. Snapshot data is stamped with the
 * real fetch time so UIs can label it as non-live.
 */
const MAX_STOCK_QUOTE_SYMBOLS = 15;

interface SnapshotRequest {
  crypto?: string[];
  stocks?: string[];
}

export function usePriceSnapshot() {
  const dispatch = useAppDispatch();

  return useCallback(
    async ({ crypto = [], stocks = [] }: SnapshotRequest) => {
      // Dedupe + uppercase (legacy watchlist rows may hold mixed casing).
      const cryptoSymbols = [...new Set(crypto.map((s) => s.toUpperCase()))];
      const stockSymbols = [...new Set(stocks.map((s) => s.toUpperCase()))];

      const jobs: Promise<void>[] = [];

      if (cryptoSymbols.length > 0) {
        jobs.push(
          fetch(`/api/crypto-prices?symbols=${cryptoSymbols.join(',')}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.prices) dispatch(updateCryptoPrices(data.prices));
            })
            .catch((error) => {
              console.error('[PriceSnapshot] crypto fetch failed:', error);
            })
        );
      }

      if (stockSymbols.length > 0) {
        const capped = stockSymbols.slice(0, MAX_STOCK_QUOTE_SYMBOLS);
        jobs.push(
          Promise.allSettled(
            capped.map((symbol) =>
              fetch(`/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`).then(
                (res) => (res.ok ? res.json() : null)
              )
            )
          ).then((results) => {
            const prices: Record<string, any> = {};
            results.forEach((result, i) => {
              const symbol = capped[i];
              const quote = result.status === 'fulfilled' ? result.value : null;
              // Finnhub answers c: 0 for unknown symbols — treat as no data.
              if (!quote || typeof quote.c !== 'number' || quote.c <= 0) return;
              prices[symbol] = {
                symbol,
                price: quote.c,
                priceChange: quote.d,
                priceChangePercent: quote.dp,
                open: quote.o,
                high: quote.h,
                low: quote.l,
                previousClose: quote.pc,
                lastUpdate: Date.now(),
              };
            });
            if (Object.keys(prices).length > 0) dispatch(updateStockPrices(prices));
          })
        );
      }

      await Promise.allSettled(jobs);
    },
    [dispatch]
  );
}
