import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy route for Binance chart kline data
 * Hides direct API calls and provides CORS-safe endpoint
 * Usage: /api/crypto-chart?symbol=BTCUSDT&interval=1h&limit=300
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  const interval = searchParams.get('interval') || '1h';
  const limit = searchParams.get('limit') || '300';

  if (!symbol) {
    return NextResponse.json(
      { error: 'Symbol parameter is required' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Binance Chart API] Error: ${response.status}`, errorText);
      
      return NextResponse.json(
        { error: `Binance API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Binance Chart API] Request failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chart data' },
      { status: 500 }
    );
  }
}
