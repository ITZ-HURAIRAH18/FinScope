import { NextRequest, NextResponse } from 'next/server';
import { cachedJson, UpstreamError } from '@/lib/coingecko';

/**
 * Stock chart kline proxy — Yahoo Finance chart API (no key required).
 *
 * Normalizes Yahoo's nested response into the same contract as
 * /api/crypto-chart:
 *   { candles: [[timeSec, o, h, l, c, volume]], meta: {...} }
 * so both detail pages can share one chart component.
 *
 * Reliability: cached + coalesced through the shared upstream client
 * (docs/AUDIT-REPORT.md H4/H5); responses carry real fetch time and the
 * actual candle interval instead of trusting the requested one.
 */

/** Yahoo intervals we are willing to request. */
const ALLOWED_INTERVALS = new Set([
  '1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo',
]);

/** Yahoo ranges we are willing to request. */
const ALLOWED_RANGES = new Set([
  '1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max',
]);

// Legacy contract: period1/period2 in unix seconds (still accepted).
function isUnixSeconds(value: string): boolean {
  return /^\d{9,11}$/.test(value);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const interval = searchParams.get('interval') || '1h';
  const range = searchParams.get('range');
  const period1 = searchParams.get('period1');
  const period2 = searchParams.get('period2');

  if (!symbol) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  // Known Finnhub alias → Yahoo symbol. Checked BEFORE the allowlist regex
  // (the colon in "OANDA:XAU_USD" would otherwise be rejected, making the
  // gold chart permanently unreachable).
  let querySymbol = symbol;
  if (symbol === 'OANDA:XAU_USD') {
    querySymbol = 'GC=F'; // Gold Futures
  } else if (!/^[A-Za-z0-9.^=-]{1,20}$/.test(symbol)) {
    // Symbol allowlist: letters, digits and Yahoo suffixes only (blocks path abuse).
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: 'Invalid interval' }, { status: 400 });
  }

  let url: string;
  if (range) {
    if (!ALLOWED_RANGES.has(range)) {
      return NextResponse.json({ error: 'Invalid range' }, { status: 400 });
    }
    url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(querySymbol)}?interval=${interval}&range=${range}`;
  } else if (period1 && period2 && isUnixSeconds(period1) && isUnixSeconds(period2)) {
    url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(querySymbol)}?interval=${interval}&period1=${period1}&period2=${period2}`;
  } else {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  try {
    const result = await cachedJson<any>(url, { ttlMs: 60_000 });

    const chart = result.data?.chart;
    const res = chart?.result?.[0];
    if (!res) {
      const errMsg = chart?.error?.description || 'No data available for this symbol';
      return NextResponse.json({ error: errMsg }, { status: 404 });
    }

    const timestamps: number[] = res.timestamp || [];
    const quote = res.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 502 });
    }

    const candles = timestamps
      .map((t: number, i: number) => {
        const o = quote.open?.[i];
        const h = quote.high?.[i];
        const l = quote.low?.[i];
        const c = quote.close?.[i];
        const v = quote.volume?.[i];
        if (o == null || h == null || l == null || c == null) return null;
        return [t, o, h, l, c, v ?? null];
      })
      .filter(Boolean) as Array<[number, number, number, number, number, number | null]>;

    const spacingSec =
      candles.length > 1 ? candles[1][0] - candles[0][0] : null;
    const volumeAvailable = candles.some((c) => c[5] !== null && c[5]! > 0);

    return NextResponse.json(
      {
        candles,
        meta: {
          source: 'Yahoo Finance',
          fetchedAt: new Date(result.fetchedAt).toISOString(),
          stale: result.stale,
          rangeLabel: (range || 'custom').toUpperCase(),
          candleIntervalSec: spacingSec,
          volumeAvailable,
        },
      },
      { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } }
    );
  } catch (error) {
    console.error('[stock-chart] Upstream failure:', error);
    const rateLimited = error instanceof UpstreamError && error.status === 429;
    return NextResponse.json(
      {
        error: rateLimited
          ? 'Chart provider rate limit reached. Please retry shortly.'
          : 'Failed to fetch data from Yahoo Finance',
        retryAfterSec: error instanceof UpstreamError ? error.retryAfterSec : undefined,
      },
      { status: 502 }
    );
  }
}
