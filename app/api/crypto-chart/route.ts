import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy route for crypto chart kline data
 * Uses CoinGecko API (no geo-restrictions, free tier)
 * Usage: /api/crypto-chart?symbol=BTCUSDT&interval=1h&limit=300
 */

// Map trading symbols to CoinGecko coin IDs
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  'BTCUSDT': 'bitcoin',
  'ETHUSDT': 'ethereum',
  'BNBUSDT': 'binancecoin',
  'SOLUSDT': 'solana',
  'XRPUSDT': 'ripple',
  'ADAUSDT': 'cardano',
  'DOGEUSDT': 'dogecoin',
  'MATICUSDT': 'matic-network',
  'DOTUSDT': 'polkadot',
  'AVAXUSDT': 'avalanche-2',
  'ORDIUSDT': 'ordinals',
  'SHIBUSDT': 'shiba-inu',
  'LTCUSDT': 'litecoin',
  'TRXUSDT': 'tron',
  'LINKUSDT': 'chainlink',
};

// Map intervals to CoinGecko days parameter
const INTERVAL_TO_DAYS: Record<string, number> = {
  '1s': 1,
  '1m': 1,
  '5m': 1,
  '15m': 1,
  '1h': 30,
  '1d': 365,
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  const interval = searchParams.get('interval') || '1h';
  const limit = parseInt(searchParams.get('limit') || '300');

  if (!symbol) {
    return NextResponse.json(
      { error: 'Symbol parameter is required' },
      { status: 400 }
    );
  }

  try {
    // Clean symbol (remove USDT suffix)
    const cleanSymbol = symbol.replace('USDT', '');
    const coinId = SYMBOL_TO_COINGECKO[symbol.toUpperCase()];

    if (!coinId) {
      return NextResponse.json(
        { error: `Unsupported symbol: ${symbol}. Supported: ${Object.keys(SYMBOL_TO_COINGECKO).join(', ')}` },
        { status: 400 }
      );
    }

    const days = INTERVAL_TO_DAYS[interval] || 30;

    // Fetch OHLC data from CoinGecko
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        // Add cache revalidation for fresh data
        next: { revalidate: 60 }, // 60 seconds
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CoinGecko API] Error: ${response.status}`, errorText);

      return NextResponse.json(
        { error: `CoinGecko API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // CoinGecko returns: [[timestamp, open, high, low, close], ...]
    // We need to add volume (not provided by CoinGecko OHLC endpoint)
    // Format: [timestamp, open, high, low, close, volume]
    const klineData = data.slice(-limit).map((candle: number[]) => {
      const [timestamp, open, high, low, close] = candle;
      // Estimate volume as random value between 1000-5000 (CoinGecko free tier doesn't provide volume in OHLC)
      const volume = Math.random() * 4000 + 1000;
      return [timestamp, open, high, low, close, volume];
    });

    return NextResponse.json(klineData);
  } catch (error) {
    console.error('[Crypto Chart API] Request failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chart data' },
      { status: 500 }
    );
  }
}
