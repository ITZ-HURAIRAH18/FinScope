import { NextRequest, NextResponse } from 'next/server';

/**
 * Fallback crypto price API using CoinGecko (free, no API key required)
 * Usage: /api/crypto-prices?symbols=BTC,ETH,SOL
 */

const SYMBOL_TO_COINGECKO: Record<string, string> = {
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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json(
      { error: 'symbols parameter is required' },
      { status: 400 }
    );
  }

  try {
    const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase());
    const coinIds = symbols
      .map(sym => SYMBOL_TO_COINGECKO[sym])
      .filter(Boolean)
      .join(',');

    if (!coinIds) {
      return NextResponse.json(
        { error: 'No valid symbols provided' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`,
      {
        headers: {
          'Accept': 'application/json',
        },
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
    
    // Transform to match the CryptoPrice interface
    const prices: Record<string, any> = {};
    data.forEach((coin: any) => {
      const symbol = coin.symbol.toUpperCase();
      prices[symbol] = {
        symbol,
        price: coin.current_price,
        priceChange24h: coin.price_change_24h,
        priceChangePercent24h: coin.price_change_percentage_24h || 0,
        volume24h: coin.total_volume,
        high24h: coin.high_24h,
        low24h: coin.low_24h,
        lastUpdate: Date.now(),
      };
    });

    return NextResponse.json(prices);
  } catch (error) {
    console.error('[CoinGecko API] Request failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch crypto prices' },
      { status: 500 }
    );
  }
}
