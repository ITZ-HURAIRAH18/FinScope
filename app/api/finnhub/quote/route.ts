import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy route for Finnhub quote API
 * Hides API key from client-side code
 * Usage: /api/finnhub/quote?symbol=AAPL
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json(
      { error: 'Symbol parameter is required' },
      { status: 400 }
    );
  }

  const apiKey = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

  if (!apiKey) {
    console.error('[Finnhub Proxy] API key not configured');
    return NextResponse.json(
      { error: 'Finnhub API key not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Finnhub Proxy] API error: ${response.status}`, errorText);
      
      return NextResponse.json(
        { error: `Finnhub API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Finnhub Proxy] Request failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote data' },
      { status: 500 }
    );
  }
}
