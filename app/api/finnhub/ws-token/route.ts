import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy route for Finnhub WebSocket token
 * Returns the API key for WebSocket connections (server-side only)
 * Usage: /api/finnhub/ws-token
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

  if (!apiKey) {
    console.error('[Finnhub WS Token] API key not configured');
    return NextResponse.json(
      { error: 'Finnhub API key not configured' },
      { status: 500 }
    );
  }

  return NextResponse.json({ token: apiKey });
}
