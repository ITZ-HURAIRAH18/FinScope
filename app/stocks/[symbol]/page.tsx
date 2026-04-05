"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { updateStockPrices } from '@/store/slices/marketSlice';
import { getFinnhubWS } from '@/lib/finnhub-websocket';
import { formatCurrency, formatPercentage, getPriceChangeColor } from '@/lib/utils';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import StockChart from '@/components/stock/StockChart';
import LoadingScreen from '@/components/LoadingScreen';
import TradingPanel from '@/components/trading/TradingPanel';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui';

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();

  const rawSymbol = params.symbol as string;
  const symbol = decodeURIComponent(rawSymbol).toUpperCase();

  const { stockPrices } = useAppSelector((state) => state.market);
  const priceData = stockPrices[symbol];
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Set a timeout to detect if data loading is stuck
    const timeoutTimer = setTimeout(() => {
      if (!isDataLoaded) {
        console.warn(`[Stock Detail] Data load timeout for ${symbol} - showing fallback`);
        setHasError(true);
      }
    }, 15000); // 15 second timeout

    // Initialize Finnhub WebSocket with async token fetch
    const initFinnhub = async () => {
      try {
        const finnhubAPIKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || "";
        const finnhubWS = await getFinnhubWS(finnhubAPIKey);

        finnhubWS.connect();
        const unsubFinnhub = finnhubWS.subscribe((prices) => {
          dispatch(updateStockPrices(prices));
          if (prices[symbol]) {
            setIsDataLoaded(true);
            setHasError(false);
          }
        });

        if (stockPrices[symbol]) {
          setIsDataLoaded(true);
          setHasError(false);
        }

        // Store cleanup function
        (window as any).__stockFinnhubCleanup = unsubFinnhub;
      } catch (error) {
        console.error('[Stock Detail] Failed to initialize Finnhub:', error);
        setHasError(true);
      }
    };
    
    initFinnhub();

    return () => {
      clearTimeout(timeoutTimer);
      const cleanup = (window as any).__stockFinnhubCleanup;
      if (cleanup) cleanup();
    };
  }, [dispatch, symbol]);

  const currentPriceData = priceData || {
    symbol: symbol,
    price: 0,
    priceChange: 0,
    priceChangePercent: 0,
    volume: 0,
    lastUpdate: Date.now()
  };

  // Show loading only if no data and no error (give it some time to load)
  if (!priceData && !isDataLoaded && !hasError && Object.keys(stockPrices).length === 0) {
    return <LoadingScreen />;
  }

  const getImageSource = (sym: string) => {
    if (sym === 'OANDA:XAU_USD' || sym === 'OANDA%3AXAU_USD') {
        return 'https://financialmodelingprep.com/image-stock/GLD.png';
    }
    return `https://financialmodelingprep.com/image-stock/${sym}.png`;
  };

  const getDisplayName = (sym: string) => {
      if (sym === 'OANDA:XAU_USD' || sym === 'OANDA%3AXAU_USD') {
          return 'Gold (XAU/USD)';
      }
      return sym;
  }

  const getAssetType = (sym: string) => {
      if (sym === 'OANDA:XAU_USD' || sym === 'OANDA%3AXAU_USD') {
          return 'Spot Metal';
      }
      return 'Stock';
  }

  return (
    <main className="min-h-screen bg-background">
      <Header activePage="markets" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error/Warning Banner */}
        {hasError && !priceData && (
          <Card className="mb-6 border-yellow-500/50 bg-yellow-500/10 animate-fade-in">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-yellow-500 mb-1">Data Loading Delayed</h3>
                  <p className="text-xs text-muted-foreground">
                    Real-time data for {symbol} is taking longer than expected. This could be due to API rate limits or network issues. 
                    The page will update automatically when data arrives.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Back Button */}
        <button
          onClick={() => router.push('/dashboard')}
          className="text-muted-foreground hover:text-foreground transition mb-6 flex items-center text-sm"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Markets
        </button>

        {/* Header Section */}
        <Card className="mb-6 animate-fade-in">
          <CardContent className="py-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div className="flex items-center gap-4">
                <img
                  src={getImageSource(symbol)}
                  alt={getDisplayName(symbol)}
                  className="w-12 h-12 rounded-md object-cover bg-secondary"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                  }}
                />
                <div>
                  <h1 className="text-xl font-semibold text-foreground tracking-tight">
                    {getDisplayName(symbol)}
                  </h1>
                  <p className="text-sm text-muted-foreground">{getAssetType(symbol)}</p>
                </div>
                <WatchlistButton symbol={symbol} type="STOCK" meta={{ name: symbol }} />
              </div>

              <div className="text-left md:text-right">
                {priceData ? (
                  <>
                    <div className="text-2xl font-semibold text-foreground font-mono tracking-tight mb-1">
                      {formatCurrency(priceData.price)}
                    </div>
                    <div className={`text-sm font-mono font-medium ${getPriceChangeColor(priceData.priceChangePercent)}`}>
                      {formatPercentage(priceData.priceChangePercent)}
                      <span className="text-xs ml-1">({formatCurrency(priceData.priceChange)})</span>
                    </div>
                  </>
                ) : (
                  <div className="animate-pulse">
                    <div className="h-7 w-28 bg-secondary rounded mb-1.5"></div>
                    <div className="h-5 w-20 bg-secondary rounded"></div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart Section */}
        <div className="mb-6 animate-slide-up">
          <StockChart symbol={symbol} />
        </div>

        {/* Trading Section */}
        <div className="grid lg:grid-cols-3 gap-4 mb-6 animate-slide-up animate-delay-100">
          <div className="lg:col-span-1">
            {priceData && (
              <TradingPanel symbol={symbol} type="STOCK" currentPrice={priceData.price} />
            )}
          </div>

          {/* Stats Grid */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Market Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="stat-block">
                    <div className="section-label mb-1.5">Current Price</div>
                    <div className="value-mono text-sm">{formatCurrency(currentPriceData.price)}</div>
                  </div>
                  <div className="stat-block">
                    <div className="section-label mb-1.5">Volume</div>
                    <div className="value-mono text-sm">{currentPriceData.volume.toLocaleString()}</div>
                  </div>
                  <div className="stat-block">
                    <div className="section-label mb-1.5">Price Change</div>
                    <div className={`value-mono text-sm ${getPriceChangeColor(currentPriceData.priceChange)}`}>
                      {formatCurrency(currentPriceData.priceChange)}
                    </div>
                  </div>
                  <div className="stat-block">
                    <div className="section-label mb-1.5">Change %</div>
                    <div className={`value-mono text-sm ${getPriceChangeColor(currentPriceData.priceChangePercent)}`}>
                      {formatPercentage(currentPriceData.priceChangePercent)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Additional Info */}
        <Card className="animate-slide-up animate-delay-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Market Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
              <div className="flex justify-between items-center py-3 border-b border-border/60">
                <span className="text-sm text-muted-foreground">Symbol</span>
                <span className="text-sm font-mono font-medium text-foreground">{symbol}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border/60">
                <span className="text-sm text-muted-foreground">Current Price</span>
                <span className="text-sm font-mono font-medium text-foreground">{formatCurrency(currentPriceData.price)}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border/60">
                <span className="text-sm text-muted-foreground">Price Change</span>
                <span className={`text-sm font-mono font-medium ${getPriceChangeColor(currentPriceData.priceChange)}`}>
                  {formatCurrency(currentPriceData.priceChange)}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border/60">
                <span className="text-sm text-muted-foreground">Change %</span>
                <span className={`text-sm font-mono font-medium ${getPriceChangeColor(currentPriceData.priceChangePercent)}`}>
                  {formatPercentage(currentPriceData.priceChangePercent)}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border/60">
                <span className="text-sm text-muted-foreground">Volume</span>
                <span className="text-sm font-mono font-medium text-foreground">{currentPriceData.volume.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border/60">
                <span className="text-sm text-muted-foreground">Last Update</span>
                <span className="text-sm font-mono text-muted-foreground">
                  {new Date(currentPriceData.lastUpdate).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
