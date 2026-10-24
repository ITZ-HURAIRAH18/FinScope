/**
 * Shared upstream HTTP client for the CoinGecko public API.
 *
 * Why this exists (see docs/AUDIT-REPORT.md, findings H4/H5/C1):
 * - The free CoinGecko tier is rate-limited (~5–15 req/min, observed
 *   `429 + Retry-After: 60` during the audit). Every route previously hit
 *   CoinGecko directly with no caching, coalescing or 429 handling.
 * - Responses must carry an honest `fetchedAt` timestamp so the UI can show
 *   data age instead of stamping `Date.now()` on serve (audit finding H5).
 *
 * Guarantees provided here:
 * - TTL cache per URL (fresh responses served from memory).
 * - In-flight request coalescing (concurrent callers share one upstream call).
 * - On 429/upstream failure: serve last-known-good data flagged `stale: true`
 *   when available; otherwise throw `UpstreamError` with `retryAfterSec`.
 * - Client-side soft throttle so a burst of page views can't burn the quota.
 */

export class UpstreamError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterSec?: number
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface FetchResult<T> {
  data: T;
  /** When the data was actually retrieved from the provider (ms epoch). */
  fetchedAt: number;
  /** True when served from an expired cache entry because the provider failed. */
  stale: boolean;
}

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

/** Soft client-side throttle: max upstream calls per rolling minute. */
const MAX_CALLS_PER_MINUTE = 10;
const callTimestamps: number[] = [];

function throttled(): boolean {
  const now = Date.now();
  while (callTimestamps.length && now - callTimestamps[0] > 60_000) {
    callTimestamps.shift();
  }
  return callTimestamps.length >= MAX_CALLS_PER_MINUTE;
}

function recordCall() {
  callTimestamps.push(Date.now());
}

function parseRetryAfter(res: Response): number | undefined {
  const header = res.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = parseInt(header, 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

/**
 * Fetch JSON with caching/coalescing/throttle semantics described above.
 * Never returns partially parsed data; `cache: 'no-store'` is used so the
 * framework's own fetch cache can't serve months-old entries (observed in
 * audit finding H5).
 */
export async function cachedJson<T>(
  url: string,
  options: { ttlMs?: number; headers?: Record<string, string> } = {}
): Promise<FetchResult<T>> {
  const ttlMs = options.ttlMs ?? 30_000;
  const key = url;
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < ttlMs) {
    return { data: cached.data as T, fetchedAt: cached.fetchedAt, stale: false };
  }

  const pending = inflight.get(key);
  if (pending) {
    const entry = await pending;
    const isFresh = Date.now() - entry.fetchedAt < ttlMs;
    return { data: entry.data as T, fetchedAt: entry.fetchedAt, stale: !isFresh };
  }

  // Soft throttle: prefer last-known-good over failing the upstream quota.
  if (throttled() && cached) {
    return { data: cached.data as T, fetchedAt: cached.fetchedAt, stale: true };
  }

  const request = (async (): Promise<CacheEntry> => {
    recordCall();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json', ...(options.headers ?? {}) },
        cache: 'no-store',
      });
    } catch (networkError) {
      if (cached) return cached;
      throw new UpstreamError(`Network error contacting provider`, 0);
    }

    if (!res.ok) {
      if (cached) {
        // Degrade gracefully to stale data instead of failing the page.
        return cached;
      }
      throw new UpstreamError(
        `Provider returned ${res.status}`,
        res.status,
        parseRetryAfter(res)
      );
    }

    const body = (await res.json()) as T;
    const entry: CacheEntry = { data: body, fetchedAt: Date.now() };
    cache.set(key, entry);
    return entry;
  })();

  inflight.set(key, request);
  try {
    const entry = await request;
    return {
      data: entry.data as T,
      fetchedAt: entry.fetchedAt,
      stale: cached ? cached.fetchedAt === entry.fetchedAt : false,
    };
  } finally {
    inflight.delete(key);
  }
}

/** Drop a cached entry (useful in tests). */
export function clearJsonCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.includes(prefix)) cache.delete(key);
  }
}

const BASE = 'https://api.coingecko.com/api/v3';

/** Central symbol → CoinGecko coin-id map (previously duplicated across routes). */
export const SYMBOL_TO_COINGECKO: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  MATIC: 'matic-network',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  ORDI: 'ordinals',
  SHIB: 'shiba-inu',
  LTC: 'litecoin',
  TRX: 'tron',
  LINK: 'chainlink',
};

export function coinIdForSymbol(symbol: string): string | undefined {
  return SYMBOL_TO_COINGECKO[symbol.replace(/USDT$/i, '').toUpperCase()];
}

export const coingecko = {
  global: (ttlMs = 60_000) =>
    cachedJson<{ data: Record<string, any> }>(`${BASE}/global`, { ttlMs }),

  trending: (ttlMs = 300_000) =>
    cachedJson<{ coins: any[] }>(`${BASE}/search/trending`, { ttlMs }),

  markets: (
    params: {
      ids?: string;
      perPage?: number;
      page?: number;
      priceChangePercentage?: string;
      sparkline?: boolean;
      order?: string;
    } = {},
    ttlMs = 60_000
  ) => {
    const search = new URLSearchParams({
      vs_currency: 'usd',
      order: params.order ?? 'market_cap_desc',
      per_page: String(params.perPage ?? 50),
      page: String(params.page ?? 1),
      sparkline: String(params.sparkline ?? false),
    });
    if (params.ids) search.set('ids', params.ids);
    if (params.priceChangePercentage) {
      search.set('price_change_percentage', params.priceChangePercentage);
    }
    return cachedJson<any[]>(`${BASE}/coins/markets?${search.toString()}`, { ttlMs });
  },

  ohlc: (coinId: string, days: number, ttlMs = 60_000) =>
    cachedJson<number[][]>(`${BASE}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`, {
      ttlMs,
    }),

  marketChart: (coinId: string, days: number, ttlMs = 60_000) =>
    cachedJson<{ prices: number[][]; total_volumes: number[][] }>(
      `${BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`,
      { ttlMs }
    ),

  simplePrice: (ids: string[], ttlMs = 15_000) =>
    cachedJson<Record<string, { usd: number; usd_24h_change: number }>>(
      `${BASE}/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`,
      { ttlMs }
    ),
};
