import { NextRequest, NextResponse } from 'next/server';
import {
  cachedJson,
  coingecko,
  coinIdForSymbol,
  SYMBOL_TO_COINGECKO,
  UpstreamError,
} from '@/lib/coingecko';

/**
 * Crypto chart klines proxy.
 *
 * Primary source: Binance public klines REST API (keyless, the same provider
 * the app already streams prices from). Why Binance over CoinGecko OHLC
 * (user report: "charts show only ~200 candles"):
 * - CoinGecko's free OHLC endpoint returns a provider-FIXED coarse granularity
 *   per range (30 days ≈ 180 candles at 4h spacing) and rate-limits long
 *   ranges (90D+ frequently 429 on the free tier).
 * - Binance lets us pick the interval per range AND paginate with `endTime`,
 *   so every range returns ALL candles for that span (e.g. 30D → 720 × 1h,
 *   1Y → ~2190 × 4h, MAX → full daily history) with real per-candle volume.
 *
 * Fallback: CoinGecko OHLC (previous behaviour) is used automatically when
 * Binance is unreachable/blocked (e.g. geo-restricted networks) or returns no
 * data for the symbol — the response `meta.source` always names which
 * provider actually served the candles.
 *
 * Contract (unchanged):
 *   GET /api/crypto-chart?symbol=BTCUSDT&days=30
 *   → { candles: [[timeMs, o, h, l, c, volume|null], ...], meta: {...} }
 *
 * Honesty guarantees (docs/AUDIT-REPORT.md C1/H5/H6):
 * - Volume is NEVER fabricated (the old Math.random() volume is long gone);
 *   Binance volume is the exchange's real traded volume, and the CoinGecko
 *   fallback only attaches volume within a half-interval tolerance.
 * - `meta` carries the real fetch time, staleness and the ACTUAL candle
 *   interval derived from the data, so the UI labels charts honestly.
 * - Upstream 429s serve last-known-good data flagged `stale: true`.
 *
 * Backward compatibility: the legacy `limit` parameter is still accepted and
 * truncates the series when explicitly provided; with no `limit`, the full
 * series for the range is returned.
 */

/** Valid CoinGecko-style day ranges (kept for URL compatibility). */
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

/**
 * Range → Binance kline interval.
 *
 * Chosen so every range yields a dense, fully-fetched series:
 *   1D  → 5m  = 288 candles
 *   7D  → 1h  = 168      14D → 2h = 168
 *   30D → 1h  = 720      90D → 4h = 540
 *   180D→ 8h  = 540      365D→ 4h ≈ 2190 (paginated)
 *   MAX → 1d  = full daily history (paginated, capped at MAX_TOTAL_CANDLES)
 */
const RANGE_TO_BINANCE_INTERVAL: Record<string, string> = {
  '1': '5m',
  '7': '1h',
  '14': '2h',
  '30': '1h',
  '90': '4h',
  '180': '8h',
  '365': '4h',
  max: '1d',
};

/** Hard ceiling on total candles served (MAX range of very old coins). */
const MAX_TOTAL_CANDLES = 5000;
/** Binance klines page size (their documented maximum per request). */
const PAGE_SIZE = 1000;
/** Safety bound: pages per request series (1000 × this = total ceiling). */
const MAX_PAGES = Math.ceil(MAX_TOTAL_CANDLES / PAGE_SIZE);

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

interface BinanceKline {
  data: Array<Array<number | string>>;
  fetchedAt: number;
  stale: boolean;
}

/**
 * Fetch ALL Binance klines for a range by paginating backwards with endTime.
 * Returns candles oldest-first, or throws when nothing could be fetched.
 */
async function fetchBinanceKlines(
  symbol: string,
  interval: string,
  rangeDays: number | 'max'
): Promise<BinanceKline> {
  const rangeStartMs =
    rangeDays === 'max' ? null : Date.now() - (rangeDays as number) * 86_400_000;

  const pages: Array<Array<Array<number | string>>> = [];
  let endTime: number | undefined;
  let newestFetchedAt = 0;
  let newestStale = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
      `&interval=${interval}&limit=${PAGE_SIZE}` +
      (endTime !== undefined ? `&endTime=${endTime}` : '');

    const result = await cachedJson<BinanceKline['data']>(url, { ttlMs: 60_000 });
    newestFetchedAt = Math.max(newestFetchedAt, result.fetchedAt);
    newestStale = newestStale || result.stale;

    const rows = result.data ?? [];
    if (rows.length === 0) break; // no more data in this direction

    pages.unshift(rows);

    // Stop when we've covered the range start, ran out of data, or hit the cap.
    const oldestOpenMs = Number(rows[0][0]);
    if (rangeStartMs !== null && oldestOpenMs <= rangeStartMs) break;
    if (rows.length < PAGE_SIZE) break; // last page from the exchange
    if (totalCandles(pages) >= MAX_TOTAL_CANDLES) break;

    // Next page: everything strictly before the oldest candle we already have.
    endTime = oldestOpenMs - 1;
  }

  if (pages.length === 0 || totalCandles(pages) === 0) {
    throw new UpstreamError(`Binance returned no klines for ${symbol}`, 404);
  }

  return {
    data: pages.flat(),
    fetchedAt: newestFetchedAt || Date.now(),
    stale: newestStale,
  };
}

function totalCandles(pages: Array<Array<Array<number | string>>>): number {
  return pages.reduce((sum, p) => sum + p.length, 0);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  // Legacy truncation: only applied when the caller explicitly asks for it.
  const explicitLimit = searchParams.get('limit');
  const limit = explicitLimit
    ? Math.min(Math.max(parseInt(explicitLimit, 10) || 1, 1), MAX_TOTAL_CANDLES)
    : null;

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
  const rangeLabel = days === 'max' ? 'MAX' : `${days}D`;

  // ---------------------------------------------------------------------
  // Primary: Binance klines (all candles for the range, real volume).
  // ---------------------------------------------------------------------
  try {
    const interval = RANGE_TO_BINANCE_INTERVAL[String(days)] ?? '1h';
    const klines = await fetchBinanceKlines(symbol.toUpperCase(), interval, days);

    const rangeStartMs =
      days === 'max' ? null : Date.now() - (days as number) * 86_400_000;

    // Map + clip to the range (the first page may start before it).
    let candles = klines.data
      .map((k) => {
        const timeMs = Number(k[0]);
        const open = Number(k[1]);
        const high = Number(k[2]);
        const low = Number(k[3]);
        const close = Number(k[4]);
        const volume = Number(k[5]);
        if (!Number.isFinite(timeMs) || !Number.isFinite(close)) return null;
        return [
          timeMs,
          open,
          high,
          low,
          close,
          Number.isFinite(volume) ? volume : null,
        ] as [number, number, number, number, number, number | null];
      })
      .filter((c): c is [number, number, number, number, number, number | null] => c !== null);

    if (rangeStartMs !== null) {
      candles = candles.filter((c) => c[0] >= rangeStartMs);
    }
    if (limit) candles = candles.slice(-limit);
    if (candles.length === 0) {
      throw new UpstreamError(`Binance returned no klines in range for ${symbol}`, 404);
    }

    const spacingMs = candles.length > 1 ? candles[1][0] - candles[0][0] : null;

    return NextResponse.json(
      {
        candles,
        meta: {
          source: 'Binance',
          fetchedAt: new Date(klines.fetchedAt).toISOString(),
          stale: klines.stale,
          rangeDays: rangeLabel,
          candleIntervalSec: spacingMs ? Math.round(spacingMs / 1000) : null,
          volumeAvailable: candles.some((c) => c[5] !== null && c[5]! > 0),
          volumeSource: 'Binance klines (real traded volume)',
        },
      },
      { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' } }
    );
  } catch (binanceError) {
    // Fall through to the CoinGecko path below (geo-blocked networks, unknown
    // pair, or upstream failure). Logged for observability.
    console.warn(
      `[Crypto Chart] Binance unavailable for ${symbol} (${(binanceError as Error)?.message}); ` +
        'falling back to CoinGecko OHLC'
    );
  }

  // ---------------------------------------------------------------------
  // Fallback: CoinGecko OHLC (previous provider; coarser granularity).
  // ---------------------------------------------------------------------
  try {
    // Fetch candles; volume in parallel and degrade gracefully if it fails.
    const [ohlcResult, chartResult] = await Promise.allSettled([
      coingecko.ohlc(coinId, days === 'max' ? 365 : (days as number)),
      coingecko.marketChart(coinId, days === 'max' ? 365 : (days as number)),
    ]);

    if (ohlcResult.status === 'rejected') {
      const err = ohlcResult.reason as UpstreamError;
      return NextResponse.json(
        {
          error:
            err instanceof UpstreamError && err.status === 429
              ? 'Chart provider rate limit reached. Please retry in a few seconds.'
              : 'Failed to fetch chart data',
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

    const sliced = limit ? candlesRaw.slice(-limit) : candlesRaw;

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
