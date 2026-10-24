import { coingecko, coinIdForSymbol, cachedJson } from '@/lib/coingecko';

/**
 * Server-side reference pricing for paper trades (docs/AUDIT-REPORT.md C3).
 *
 * The buy/sell routes previously executed trades at whatever `price` the
 * client sent — a single tampered request could buy BTC at $1. Every trade is
 * now validated against a fresh provider quote:
 *
 * - CRYPTO → CoinGecko `simple/price` (shared TTL cache, 10s).
 * - STOCK  → Finnhub `/quote` with the server-side key (10s TTL cache).
 *
 * The trade executes at the VERIFIED server price, not the client's; the
 * client price is only used as a staleness check (tolerance band below).
 */

/** Max allowed deviation (%) between the client's quoted price and the live
 *  provider price before we reject the order as stale/tampered. */
export const PRICE_TOLERANCE_PCT = 3;

/** Symbols must look like real tickers before we hit a provider with them. */
const SYMBOL_RE = /^[A-Z0-9:._-]{1,24}$/;

export const VALID_TRADE_TYPES = new Set(['CRYPTO', 'STOCK']);

export function isValidSymbolParam(symbol: unknown): symbol is string {
  return typeof symbol === 'string' && SYMBOL_RE.test(symbol);
}

/** Thrown when the reference price can't be verified (provider down/limited). */
export class PriceUnavailableError extends Error {
  constructor(public readonly symbol: string, public readonly type: string) {
    super(`Reference price unavailable for ${type}:${symbol}`);
    this.name = 'PriceUnavailableError';
  }
}

/**
 * Fetch the current provider price for a symbol, or null when unavailable.
 * Never throws — callers decide whether unavailable pricing blocks the trade
 * (it does for trades; see trade routes).
 */
export async function getReferencePrice(
  symbol: string,
  type: string
): Promise<number | null> {
  try {
    if (type === 'CRYPTO') {
      const coinId = coinIdForSymbol(symbol);
      if (!coinId) return null;
      const result = await coingecko.simplePrice([coinId], 10_000);
      const usd = result.data[coinId]?.usd;
      return typeof usd === 'number' && usd > 0 ? usd : null;
    }

    if (type === 'STOCK') {
      const apiKey = process.env.FINNHUB_API_KEY;
      if (!apiKey) return null;
      const result = await cachedJson<{ c?: number; t?: number }>(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
        { ttlMs: 10_000 }
      );
      const quote = result.data.c;
      return typeof quote === 'number' && quote > 0 ? quote : null;
    }

    return null;
  } catch (error) {
    console.error(`[trade-price] Reference price fetch failed for ${type}:${symbol}:`, error);
    return null;
  }
}

export interface PriceVerification {
  /** Price the trade must execute at (provider-verified). */
  executionPrice: number;
  /** The client's submitted price (already validated as a sane number). */
  submittedPrice: number;
  deviationPct: number;
}

/**
 * Verify the submitted price against the live provider price.
 *
 * @throws PriceUnavailableError when no provider price can be fetched — the
 *         trade must NOT proceed on an unverified price.
 */
export async function verifyTradePrice(
  symbol: string,
  type: string,
  submittedPrice: number
): Promise<PriceVerification> {
  const referencePrice = await getReferencePrice(symbol, type);
  if (referencePrice == null) {
    throw new PriceUnavailableError(symbol, type);
  }

  const deviationPct = (Math.abs(submittedPrice - referencePrice) / referencePrice) * 100;
  return { executionPrice: referencePrice, submittedPrice, deviationPct };
}
