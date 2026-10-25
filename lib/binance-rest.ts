import { cachedJson, UpstreamError } from '@/lib/coingecko';

/**
 * Shared Binance klines REST client.
 *
 * Extracted from app/api/crypto-chart/route.ts so the chart proxy and the
 * AI market agent (lib/market-agent.ts) fetch candles through one tested
 * implementation instead of duplicating the pagination logic.
 *
 * All data here is REAL exchange data (Binance public klines, keyless — the
 * same provider the app streams live prices from). Nothing is synthesized.
 */

/** Hard ceiling on total candles served (MAX range of very old coins). */
export const MAX_TOTAL_CANDLES = 5000;

/**
 * Binance pair aliases for tokens that were renamed on the exchange.
 * Polygon migrated MATIC → POL (Sept 2024) and Binance renamed the trading
 * pair, so MATICUSDT has no recent klines — requests must use POLUSDT
 * (the renamed pair carries the continued history).
 */
const BINANCE_PAIR_ALIASES: Record<string, string> = { MATIC: 'POL' };

/** Normalize a app symbol ('BTC', 'btc', 'BTCUSDT') to a Binance pair. */
export function binancePair(symbol: string): string {
  const base = symbol.replace(/USDT$/i, '').toUpperCase();
  return `${BINANCE_PAIR_ALIASES[base] ?? base}USDT`;
}

/** Binance klines page size (their documented maximum per request). */
const PAGE_SIZE = 1000;
/** Safety bound: pages per request series (1000 × this = total ceiling). */
const MAX_PAGES = Math.ceil(MAX_TOTAL_CANDLES / PAGE_SIZE);

export interface BinanceKline {
  data: Array<Array<number | string>>;
  fetchedAt: number;
  stale: boolean;
}

function totalCandles(pages: Array<Array<Array<number | string>>>): number {
  return pages.reduce((sum, p) => sum + p.length, 0);
}

/**
 * Fetch ALL Binance klines for a range by paginating backwards with endTime.
 * Returns candles oldest-first, or throws when nothing could be fetched.
 */
export async function fetchBinanceKlines(
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
