import { NextRequest, NextResponse } from 'next/server';
import { coingecko, cachedJson, SYMBOL_TO_COINGECKO, UpstreamError } from '@/lib/coingecko';

/**
 * Market overview API — real 7-day sparklines + 24h stats for the landing page.
 *
 * Usage: GET /api/market/overview
 * Response:
 *   {
 *     crypto: { BTC: { price, changePercent24h, sparkline: number[] }, ... },
 *     stocks: { AAPL: { price, changePercent, sparkline: number[] }, ... },
 *     meta: { sources, fetchedAt, stale }
 *   }
 *
 * Data integrity (docs/AUDIT-REPORT.md S6):
 * - The landing page previously drew sparklines from `Math.sin()` noise seeded
 *   by the 24h change — visually plausible but fabricated. This endpoint serves
 *   REAL price history: CoinGecko `sparkline_in_7d` (hourly, 168 points) for
 *   crypto and Yahoo Finance 5d/15m closes for stocks/gold, both downsampled.
 * - All upstream calls go through the shared TTL cache + coalescing client.
 */

const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'BNB', 'SOL'];
const STOCK_SYMBOLS = ['AAPL', 'GOOGL', 'TSLA', 'OANDA:XAU_USD'];

/** Reduce a price array to at most `target` points (keeps first + last). */
function downsample(values: number[], target = 48): number[] {
  if (values.length <= target) return values;
  const out: number[] = [];
  const step = (values.length - 1) / (target - 1);
  for (let i = 0; i < target; i++) {
    out.push(values[Math.round(i * step)]);
  }
  return out;
}

function yahooSymbol(symbol: string): string {
  return symbol === 'OANDA:XAU_USD' ? 'GC=F' : symbol;
}

async function fetchCryptoOverview() {
  const ids = CRYPTO_SYMBOLS.map((s) => SYMBOL_TO_COINGECKO[s]).join(',');
  const result = await coingecko.markets(
    { ids, perPage: CRYPTO_SYMBOLS.length, priceChangePercentage: '24h', sparkline: true },
    120_000 // 2 min TTL: sparklines change slowly
  );

  const out: Record<
    string,
    { price: number; changePercent24h: number; sparkline: number[] }
  > = {};
  for (const coin of result.data) {
    const symbol = coin.symbol.toUpperCase();
    const raw: number[] = coin.sparkline_in_7d?.price ?? [];
    out[symbol] = {
      price: coin.current_price,
      changePercent24h: coin.price_change_percentage_24h ?? 0,
      sparkline: downsample(raw.filter((v) => typeof v === 'number')),
    };
  }
  return { data: out, stale: result.stale, fetchedAt: result.fetchedAt };
}

async function fetchStockOverview() {
  const entries = await Promise.allSettled(
    STOCK_SYMBOLS.map(async (symbol) => {
      const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}` +
        `?interval=15m&range=5d`;
      const result = await cachedJson<any>(url, { ttlMs: 300_000 });
      const res = result.data?.chart?.result?.[0];
      const closes: number[] = (res?.indicators?.quote?.[0]?.close ?? []).filter(
        (v: unknown): v is number => typeof v === 'number'
      );
      if (closes.length === 0) throw new Error(`No chart data for ${symbol}`);
      const price = closes[closes.length - 1];
      const first = closes[0];
      return {
        symbol,
        value: {
          price,
          // Percent move across the fetched window (5d for stocks), computed
          // from real closes — labelled honestly on the client.
          changePercent: first > 0 ? ((price - first) / first) * 100 : 0,
          sparkline: downsample(closes),
        },
        stale: result.stale,
      };
    })
  );

  const out: Record<
    string,
    { price: number; changePercent: number; sparkline: number[] }
  > = {};
  let stale = false;
  for (const entry of entries) {
    if (entry.status === 'fulfilled') {
      out[entry.value.symbol] = entry.value.value;
      stale = stale || entry.value.stale;
    } else {
      console.warn('[market-overview] Stock entry failed:', entry.reason);
    }
  }
  return { data: out, stale };
}

export async function GET(_request: NextRequest) {
  const [crypto, stocks] = await Promise.allSettled([
    fetchCryptoOverview(),
    fetchStockOverview(),
  ]);

  if (crypto.status === 'rejected' && stocks.status === 'rejected') {
    const error = crypto.reason;
    const rateLimited = error instanceof UpstreamError && error.status === 429;
    console.error('[market-overview] Both upstream legs failed:', error);
    return NextResponse.json(
      {
        error: rateLimited
          ? 'Market data provider rate limit reached. Please retry shortly.'
          : 'Failed to fetch market overview',
        retryAfterSec: error instanceof UpstreamError ? error.retryAfterSec : undefined,
      },
      { status: rateLimited ? 429 : 502 }
    );
  }

  if (crypto.status === 'rejected') console.warn('[market-overview] Crypto leg failed:', crypto.reason);
  if (stocks.status === 'rejected') console.warn('[market-overview] Stock leg failed:', stocks.reason);

  const cryptoValue = crypto.status === 'fulfilled' ? crypto.value : undefined;
  const stocksValue = stocks.status === 'fulfilled' ? stocks.value : undefined;

  return NextResponse.json(
    {
      crypto: cryptoValue?.data ?? {},
      stocks: stocksValue?.data ?? {},
      meta: {
        sources: { crypto: 'CoinGecko', stocks: 'Yahoo Finance' },
        fetchedAt: new Date().toISOString(),
        stale: cryptoValue?.stale ?? stocksValue?.stale ?? false,
        unavailable: [
          ...(crypto.status === 'rejected' ? ['crypto'] : []),
          ...(stocks.status === 'rejected' ? ['stocks'] : []),
        ],
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' } }
  );
}
