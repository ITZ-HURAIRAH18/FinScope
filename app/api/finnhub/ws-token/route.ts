import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Proxy route for the Finnhub WebSocket token.
 *
 * SECURITY: This returns the raw Finnhub API key, so it is restricted to
 * authenticated sessions only. The key must never be shipped to the client
 * via NEXT_PUBLIC_* variables — all client-side Finnhub access goes through
 * authenticated proxies (/api/finnhub/*) instead.
 *
 * Usage: GET /api/finnhub/ws-token  (requires session cookie)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    console.error('[Finnhub WS Token] API key not configured');
    return NextResponse.json(
      { error: 'Finnhub API key not configured' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { token: apiKey },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
