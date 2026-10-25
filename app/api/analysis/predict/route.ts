import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { geminiConfigured, GeminiError } from '@/lib/gemini';
import { normalizeSymbol, predictSignal, supportedSymbols } from '@/lib/market-agent';
import { UpstreamError } from '@/lib/coingecko';

/**
 * AI prediction endpoint (Gemini gemini-2.5-flash, server-side key).
 *
 *   GET /api/analysis/predict?symbol=BTC
 *   → { symbol, prediction: { bias, confidence, summary, reasons, risks },
 *       indicators, data, generatedAt, cached }
 *
 * Protections (each Gemini call costs real quota):
 * - Session required (401) — anonymous traffic can't burn quota.
 * - 10 predictions/user/minute (sliding window, 429 + Retry-After).
 * - 60s per-symbol response cache inside lib/market-agent.
 * - Honest contract: prediction is probabilistic analysis for a paper-trading
 *   app; the UI must display it with the "not financial advice" disclaimer
 *   that lib/market-agent's prompt already requires from the model.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Sign in to use AI predictions.' },
        { status: 401 }
      );
    }

    const symbol = request.nextUrl.searchParams.get('symbol');
    const base = symbol ? normalizeSymbol(symbol) : null;
    if (!base) {
      return NextResponse.json(
        {
          error: `Unsupported symbol. Supported: ${supportedSymbols().join(', ')}`,
        },
        { status: 400 }
      );
    }

    if (!geminiConfigured()) {
      return NextResponse.json(
        {
          error:
            'AI predictions are not configured on this server (missing GEMINI_API_KEY).',
        },
        { status: 503 }
      );
    }

    const limit = rateLimit(`predict:${session.user.id}`, 10, 60_000);
    if (!limit.allowed) {
      return tooManyRequests(
        limit.retryAfterSec,
        'Prediction limit reached — please wait a moment and refresh.'
      );
    }

    const result = await predictSignal(base);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof GeminiError) {
      if (error.status === 429) {
        return tooManyRequests(
          error.retryAfterSec ?? 30,
          'The AI provider is rate-limiting right now. Please retry shortly.'
        );
      }
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof UpstreamError) {
      if (error.status === 429) {
        return tooManyRequests(
          error.retryAfterSec ?? 30,
          'Market data provider rate limit reached. Please retry shortly.'
        );
      }
      return NextResponse.json({ error: 'Could not fetch market data for this coin.' }, { status: 502 });
    }
    console.error('[Predict API] Request failed:', error);
    return NextResponse.json({ error: 'Prediction failed. Please retry.' }, { status: 500 });
  }
}
