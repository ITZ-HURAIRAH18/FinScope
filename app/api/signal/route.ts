import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { UpstreamError } from '@/lib/coingecko';
import { getSignal } from '@/lib/signal/engine';
import { normalizeSymbol, supportedSymbols } from '@/lib/market-agent';

/**
 * Deterministic signal-analysis endpoint (no LLM, no Gemini quota).
 *
 *   GET /api/signal?symbol=BTC
 *   → { symbol, price, timeframes: {15m,1h,4h,1d}, scoring, plan, caveats }
 *
 * Everything is computed in code from real Binance candles
 * (lib/signal/*: indicators → structure → confluence score → trade plan).
 * Session required, 20 req/user/min, 60s per-symbol cache in the engine.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Sign in to use the signal engine.' }, { status: 401 });
    }

    const symbol = request.nextUrl.searchParams.get('symbol');
    const base = symbol ? normalizeSymbol(symbol) : null;
    if (!base) {
      return NextResponse.json(
        { error: `Unsupported symbol. Supported: ${supportedSymbols().join(', ')}` },
        { status: 400 }
      );
    }

    const limit = rateLimit(`signal:${session.user.id}`, 20, 60_000);
    if (!limit.allowed) {
      return tooManyRequests(limit.retryAfterSec, 'Signal requests limit reached — please wait a moment.');
    }

    const analysis = await getSignal(base);
    return NextResponse.json(analysis, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof UpstreamError) {
      if (error.status === 429) {
        return tooManyRequests(error.retryAfterSec ?? 30, 'Market data provider rate limit reached. Please retry shortly.');
      }
      return NextResponse.json({ error: 'Market data is unavailable right now. Please retry shortly.' }, { status: 502 });
    }
    console.error('[Signal API] Request failed:', error);
    return NextResponse.json({ error: 'Signal analysis failed. Please retry.' }, { status: 500 });
  }
}
