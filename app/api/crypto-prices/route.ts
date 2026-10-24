import { NextRequest, NextResponse } from 'next/server';
import { coingecko, SYMBOL_TO_COINGECKO, UpstreamError } from '@/lib/coingecko';

/**
 * Crypto price snapshot API (CoinGecko — free tier, no key required).
 *
 * Usage: /api/crypto-prices?symbols=BTC,ETH,SOL
 * Response: { prices: { BTC: {...}, ... }, meta: { source, fetchedAt, stale } }
 *
 * Reliability (docs/AUDIT-REPORT.md H4/H5):
 * - Served through the shared TTL cache + request coalescing client, so N
 *   clients polling every 10 s no longer translate into N upstream calls.
 * - 429s degrade to last-known-good data flagged `stale: true`.
 * - `lastUpdate` inside each price is the real fetch time (previously it was
 *   stamped `Date.now()` on serve, falsely implying fresh data).
 */

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'symbols parameter is required' }, { status: 400 });
  }

  try {
    const symbols = symbolsParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => SYMBOL_TO_COINGECKO[s]);

    if (symbols.length === 0) {
      return NextResponse.json({ error: 'No valid symbols provided' }, { status: 400 });
    }

    const coinIds = symbols.map((s) => SYMBOL_TO_COINGECKO[s]).join(',');

    const result = await coingecko.markets(
      { ids: coinIds, perPage: symbols.length, priceChangePercentage: '24h' },
      20_000 // 20s TTL: matches the 10s client fallback polling cadence
    );

    const prices: Record<string, any> = {};
    for (const coin of result.data) {
      const symbol = coin.symbol.toUpperCase();
      prices[symbol] = {
        symbol,
        price: coin.current_price,
        priceChange24h: coin.price_change_24h,
        priceChangePercent24h: coin.price_change_percentage_24h || 0,
        volume24h: coin.total_volume,
        high24h: coin.high_24h,
        low24h: coin.low_24h,
        marketCap: coin.market_cap,
        lastUpdate: result.fetchedAt,
      };
    }

    return NextResponse.json(
      {
        prices,
        meta: {
          source: 'CoinGecko',
          fetchedAt: new Date(result.fetchedAt).toISOString(),
          stale: result.stale,
        },
      },
      { headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=30' } }
    );
  } catch (error) {
    const status = error instanceof UpstreamError && error.status === 429 ? 429 : 502;
    console.error('[crypto-prices] Upstream failure:', error);
    return NextResponse.json(
      {
        error:
          status === 429
            ? 'CoinGecko rate limit reached. Retry shortly.'
            : 'Failed to fetch crypto prices',
        retryAfterSec: error instanceof UpstreamError ? error.retryAfterSec : undefined,
      },
      { status }
    );
  }
}
