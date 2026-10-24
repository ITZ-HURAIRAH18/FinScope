"use client";

import { useCallback, useEffect, useState } from 'react';
import MarketChart, {
  ChartCandle,
  ChartMeta,
  ChartRange,
} from '@/components/chart/MarketChart';

interface StockChartProps {
  symbol: string;
}

/**
 * Stock price chart backed by /api/stock-chart (Yahoo Finance).
 * Shares the unified MarketChart with the crypto chart — candle/line modes,
 * real volume bars, crosshair legend and honest interval/source labelling.
 *
 * Interval per range is the FINEST Yahoo serves reliably for that span, so
 * every timeframe shows all candles for its range instead of a ~200-point
 * downsample (user report: "charts show only 200 candles"). MAX deliberately
 * uses the period1=0 form: Yahoo's `range=max` auto-buckets any interval down
 * to ~169 points, while an explicit period returns the FULL daily history
 * (verified live: AAPL ≈ 11,500 daily candles back to 1980).
 */
const RANGES: Array<
  ChartRange & { yahooRange?: string; interval: string; fullHistory?: boolean }
> = [
  { key: '1d', label: '1D', yahooRange: '1d', interval: '5m' },
  { key: '5d', label: '5D', yahooRange: '5d', interval: '5m' },
  { key: '1mo', label: '1M', yahooRange: '1mo', interval: '30m' },
  { key: '3mo', label: '3M', yahooRange: '3mo', interval: '60m' },
  { key: '6mo', label: '6M', yahooRange: '6mo', interval: '60m' },
  { key: '1y', label: '1Y', yahooRange: '1y', interval: '60m' },
  { key: 'max', label: 'MAX', interval: '1d', fullHistory: true },
];

interface ChartResponse {
  candles: Array<[number, number, number, number, number, number | null]>;
  meta: {
    source: string;
    fetchedAt: string;
    stale: boolean;
    rangeLabel: string;
    candleIntervalSec: number | null;
    volumeAvailable: boolean;
  };
}

export default function StockChart({ symbol }: StockChartProps) {
  const [rangeKey, setRangeKey] = useState<string>('1mo');
  const [candles, setCandles] = useState<ChartCandle[] | null>(null);
  const [meta, setMeta] = useState<ChartMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const fetchChart = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const config = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2];
      // MAX uses the explicit-period form: Yahoo's `range=max` buckets any
      // interval down to ~169 points, while period1=0 returns the symbol's
      // complete daily history.
      const url = config.fullHistory
        ? `/api/stock-chart?symbol=${encodeURIComponent(symbol)}&interval=${config.interval}` +
          `&period1=0&period2=${Math.floor(Date.now() / 1000)}`
        : `/api/stock-chart?symbol=${encodeURIComponent(symbol)}&interval=${config.interval}&range=${config.yahooRange}`;
      const response = await fetch(url);
      const payload: ChartResponse | { error: string } | null = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        const message = (payload as { error?: string })?.error;
        throw new Error(message || `Failed to fetch chart data (${response.status})`);
      }

      const data = payload as ChartResponse;
      if (!data?.candles || !Array.isArray(data.candles)) {
        throw new Error('Unexpected chart data format');
      }

      setCandles(
        data.candles.map((c) => ({
          time: c[0],
          open: c[1],
          high: c[2],
          low: c[3],
          close: c[4],
          volume: c[5] ?? null,
        }))
      );
      setMeta({
        source: data.meta.source,
        fetchedAt: data.meta.fetchedAt,
        stale: data.meta.stale,
        rangeLabel: data.meta.rangeLabel,
        candleIntervalSec: data.meta.candleIntervalSec,
        volumeAvailable: data.meta.volumeAvailable,
      });
    } catch (err: any) {
      console.error('[StockChart] Failed to load chart:', err);
      setError(err.message || 'Failed to load chart');
      setCandles(null);
      setMeta(null);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, rangeKey]);

  useEffect(() => {
    fetchChart();
    // `attempt` is the retry counter: bumping it (Retry button) refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchChart, attempt]);

  return (
    <MarketChart
      title="Price Chart"
      ranges={RANGES}
      activeRange={rangeKey}
      onRangeChange={setRangeKey}
      candles={candles}
      meta={meta}
      isLoading={isLoading}
      error={error}
      onRetry={() => setAttempt((a) => a + 1)}
    />
  );
}
