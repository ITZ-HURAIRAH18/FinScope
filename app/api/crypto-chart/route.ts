import { NextRequest, NextResponse } from 'next/server';
import {
  coingecko,
  coinIdForSymbol,
  SYMBOL_TO_COINGECKO,
  UpstreamError,
} from '@/lib/coingecko';

/**
 * Crypto chart kline proxy — CoinGecko (free tier, no key required).
 *
 * Usage:
 *   GET /api/crypto-chart?symbol=BTCUSDT&days=30
 *   (legacy: &interval=1h — still accepted, mapped to a day range)
 *
 * Fixes vs. the previous revision (docs/AUDIT-REPORT.md C1/H4/H5/H6):
 * - Volume is NEVER fabricated. Previous code injected
 *   `Math.random() * 4000 + 1000` as candle volume. Now volume comes from
 *   CoinGecko's real `market_chart.total_volumes`, aligned to candle
 *   timestamps; when unavailable every candle carries `volume: null` and the
 *   UI must hide the volume pane.
 * - Response includes `meta` with the provider, real fetch time, staleness
 *   and the ACTUAL candle interval so the UI can label charts honestly
 *   (the old "1m/5m/1h" buttons all showed different data than advertised).
 * - Upstream 429s serve last-known-good data flagged `stale: true`.
 */

/** Valid CoinGecko OHLC ranges (days). */
const ALLOWED_DAYS = new Set([1, 7, 14, 30, 90, 180, 365, 'max']);

/** Legacy interval → day range mapping (kept only for old cached clients). */
const LEGACY_INTERVAL_TO_DAYS: Record<string, number | 'max'> = {
  '1s': 1,
  '1m': 1,
  '5m': 1,
  '15m': 1,
  '1h': 7,
  '1d': 365,
};

function resolveDays(searchParams: URLSearchParams): number | 'max' {
  const daysParam = searchParams.get('days');
  if (daysParam) {
    const parsed = daysParam === 'max' ? 'max' : parseInt(daysParam, 10);
    if (ALLOWED_DAYS.has(parsed)) return parsed as number | 'max';
    return 30; // sane default for invalid input
  }
  const interval = searchParams.get('interval');
  if (interval && LEGACY_INTERVAL_TO_DAYS[interval]) {
    return LEGACY_INTERVAL_TO_DAYS[interval];
  }
  return 30;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '500', 10) || 500, 1), 1000);

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter is required' }, { status: 400 });
  }

  const coinId = coinIdForSymbol(symbol);
  if (!coinId) {
    return NextResponse.json(
      {
        error: `Unsupported symbol: ${symbol}. Supported: ${Object.keys(
          SYMBOL_TO_COINGECKO
        ).join(', ')}`,
      },
      { status: 400 }
    );
  }

  const days = resolveDays(searchParams);

  try {
    // Fetch candles; volume in parallel and degrade gracefully if it fails.
    const [ohlcResult, chartResult] = await Promise.allSettled([
      coingecko.ohlc(coinId, days as number),
      coingecko.marketChart(coinId, days === 'max' ? 365 : (days as number)),
    ]);

    if (ohlcResult.status === 'rejected') {
      const err = ohlcResult.reason as UpstreamError;
      return NextResponse.json(
        {
          error:
            err instanceof UpstreamError && err.status === 429
              ? 'CoinGecko rate limit reached. Please retry in a few seconds.'
              : 'Failed to fetch chart data from CoinGecko',
          retryAfterSec: err instanceof UpstreamError ? err.retryAfterSec : undefined,
        },
        { status: 502 }
      );
    }

    const ohlc = ohlcResult.value;
    const candlesRaw = ohlc.data;

    // Build a timestamp → real volume lookup from market_chart (may be absent).
    const volumeByTime = new Map<number, number>();
    if (chartResult.status === 'fulfilled') {
      for (const [t, v] of chartResult.value.data.total_volumes ?? []) {
        volumeByTime.set(Math.round(t), v);
      }
    }
    const volumeAvailable = volumeByTime.size > 0;

    const sliced = candlesRaw.slice(-limit);

    // Actual candle spacing (ms) — used by the UI to label the chart honestly.
    const spacingMs =
      sliced.length > 1 ? sliced[1][0] - sliced[0][0] : null;

    const candles = sliced.map((c: number[]) => {
      const [timestamp, open, high, low, close] = c;
      let volume: number | null = null;
      if (volumeAvailable) {
        // Match the candle to the closest real volume point. CoinGecko's
        // volume buckets align with OHLC buckets for the same range; allow
        // half-interval tolerance before giving up (→ null, not fake data).
        const tolerance = spacingMs ? spacingMs / 2 : 90 * 60 * 1000;
        let best: number | null = null;
        let bestDelta = Infinity;
        for (const [t, v] of volumeByTime) {
          const delta = Math.abs(t - timestamp);
          if (delta < bestDelta) {
            bestDelta = delta;
            best = v;
          }
          // volumeByTime is unordered — full scan is fine (≤ 365*24 points)
          if (best !== null && bestDelta === 0) break;
        }
        if (best !== null && bestDelta <= tolerance) volume = best;
      }
      return [timestamp, open, high, low, close, volume];
    });

    const rangeLabel = days === 'max' ? 'MAX' : `${days}D`;

    return NextResponse.json(
      {
        candles,
        meta: {
          source: 'CoinGecko',
          fetchedAt: new Date(ohlc.fetchedAt).toISOString(),
          stale: ohlc.stale,
          rangeDays: rangeLabel,
          candleIntervalSec: spacingMs ? Math.round(spacingMs / 1000) : null,
          volumeAvailable,
          volumeSource:
            volumeAvailable && chartResult.status === 'fulfilled'
              ? 'CoinGecko market_chart (real)'
              : null,
        },
      },
      { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' } }
    );
  } catch (error) {
    console.error('[Crypto Chart API] Request failed:', error);
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
  }
}
