"use client";

import { useCallback, useEffect, useState } from 'react';
import MarketChart, {
  ChartCandle,
  ChartMeta,
  ChartRange,
} from '@/components/chart/MarketChart';

interface CryptoChartProps {
  symbol: string;
}

/**
 * Crypto price chart backed by /api/crypto-chart (CoinGecko).
 *
 * Timeframe buttons are labelled with the actual data range they request, and
 * the component displays the true candle interval returned by the server —
 * the previous revision advertised 1s/1m/5m/15m buttons that all rendered the
 * same 30-minute data (docs/AUDIT-REPORT.md H6).
 */
const RANGES: ChartRange[] = [
  { key: '1', label: '1D' },
  { key: '7', label: '7D' },
  { key: '30', label: '1M' },
  { key: '90', label: '3M' },
  { key: '180', label: '6M' },
  { key: '365', label: '1Y' },
  { key: 'max', label: 'MAX' },
];

interface ChartResponse {
  candles: Array<[number, number, number, number, number, number | null]>;
  meta: {
    source: string;
    fetchedAt: string;
    stale: boolean;
    rangeDays: string;
    candleIntervalSec: number | null;
    volumeAvailable: boolean;
  };
}

export default function CryptoChart({ symbol }: CryptoChartProps) {
  const [days, setDays] = useState<string>('30');
  const [candles, setCandles] = useState<ChartCandle[] | null>(null);
  const [meta, setMeta] = useState<ChartMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const fetchChart = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const pair = `${symbol.toUpperCase()}USDT`;
      // No `limit` param: the API returns ALL candles for the selected range
      // (Binance klines with pagination; CoinGecko fallback for blocked
      // networks). The legacy `limit` param would truncate the series again.
      const response = await fetch(
        `/api/crypto-chart?symbol=${encodeURIComponent(pair)}&days=${days}`
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || `Failed to fetch chart data (${response.status})`);
      }
      if (!payload?.candles || !Array.isArray(payload.candles)) {
        throw new Error('Unexpected chart data format');
      }

      const parsed: ChartCandle[] = payload.candles.map(
        (c: [number, number, number, number, number, number | null]) => ({
          time: Math.round(c[0] / 1000),
          open: c[1],
          high: c[2],
          low: c[3],
          close: c[4],
          volume: c[5] ?? null,
        })
      );

      setCandles(parsed);
      setMeta({
        source: payload.meta.source,
        fetchedAt: payload.meta.fetchedAt,
        stale: payload.meta.stale,
        rangeLabel: payload.meta.rangeDays,
        candleIntervalSec: payload.meta.candleIntervalSec,
        volumeAvailable: payload.meta.volumeAvailable,
      });
    } catch (err: any) {
      console.error('[CryptoChart] Failed to load chart:', err);
      setError(err.message || 'Failed to load chart');
      setCandles(null);
      setMeta(null);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, days]);

  useEffect(() => {
    fetchChart();
    // `attempt` is the retry counter: bumping it (Retry button) refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchChart, attempt]);

  return (
    <MarketChart
      title="Price Chart"
      ranges={RANGES}
      activeRange={days}
      onRangeChange={setDays}
      candles={candles}
      meta={meta}
      isLoading={isLoading}
      error={error}
      onRetry={() => setAttempt((a) => a + 1)}
    />
  );
}
