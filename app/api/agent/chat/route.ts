import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { geminiConfigured, GeminiError } from '@/lib/gemini';
import { chatReply, normalizeSymbol, type ChatTurn } from '@/lib/market-agent';
import { UpstreamError } from '@/lib/coingecko';

/**
 * AI trading assistant chat (Gemini gemini-2.5-flash, server-side key).
 *
 *   POST /api/agent/chat
 *   body: { message: string, symbol?: string, history?: [{role, content}] }
 *   → { reply, generatedAt, context | null }
 *
 * Grounding: when `symbol` is present, real candles + calculated indicators
 * are attached to the prompt (lib/market-agent); without a symbol the model
 * is forbidden from quoting live numbers. Response is easy Roman Urdu with
 * mandatory honesty/disclaimer rules from the shared system prompt.
 *
 * Protections: session required, 12 messages/user/minute, client input
 * strictly capped (message ≤ 800 chars; history ≤ 8 turns × 600 chars — the
 * client is not trusted for these bounds).
 */
const MAX_MESSAGE_LEN = 800;
const MAX_HISTORY_TURNS = 8;
const MAX_TURN_LEN = 600;

function sanitizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: ChatTurn[] = [];
  for (const item of raw.slice(-MAX_HISTORY_TURNS)) {
    if (typeof item !== 'object' || item === null) continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      const text = content.trim().slice(0, MAX_TURN_LEN);
      if (text) turns.push({ role, content: text });
    }
  }
  return turns;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Sign in to use the AI assistant.' }, { status: 401 });
    }

    let body: { message?: unknown; symbol?: unknown; history?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > MAX_MESSAGE_LEN) {
      return NextResponse.json(
        { error: `Message must be 1–${MAX_MESSAGE_LEN} characters.` },
        { status: 400 }
      );
    }

    let symbol: string | null = null;
    if (typeof body.symbol === 'string' && body.symbol.trim()) {
      symbol = normalizeSymbol(body.symbol);
      if (!symbol) {
        return NextResponse.json({ error: 'Unsupported symbol.' }, { status: 400 });
      }
    }

    if (!geminiConfigured()) {
      return NextResponse.json(
        { error: 'The AI assistant is not configured on this server (missing GEMINI_API_KEY).' },
        { status: 503 }
      );
    }

    const limit = rateLimit(`agent:${session.user.id}`, 12, 60_000);
    if (!limit.allowed) {
      return tooManyRequests(
        limit.retryAfterSec,
        'Too many messages — please wait a moment before sending again.'
      );
    }

    const result = await chatReply({
      message,
      symbol,
      history: sanitizeHistory(body.history),
    });
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
      return NextResponse.json({ error: 'Could not fetch market data right now.' }, { status: 502 });
    }
    console.error('[Agent Chat] Request failed:', error);
    return NextResponse.json({ error: 'Assistant failed to reply. Please retry.' }, { status: 500 });
  }
}
