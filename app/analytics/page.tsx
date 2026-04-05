"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { binanceWS } from '@/lib/binance-websocket';
import { getFinnhubWS } from '@/lib/finnhub-websocket';
import { formatCurrency, formatPercentage, getPriceChangeColor } from '@/lib/utils';
import { updateCryptoPrices, updateStockPrices } from '@/store/slices/marketSlice';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

export default function AnalyticsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { cryptoPrices, stockPrices } = useAppSelector((state) => state.market);

  useEffect(() => {
    // Initialize WebSocket connections
    binanceWS.connect();
    const unsubBinance = binanceWS.subscribe((prices) => {
      dispatch(updateCryptoPrices(prices));
    });

    // Initialize Finnhub WebSocket with async token fetch
    const initFinnhub = async () => {
      const finnhubAPIKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';
      const finnhubWS = await getFinnhubWS(finnhubAPIKey);
      finnhubWS.connect();
      const unsubFinnhub = finnhubWS.subscribe((prices) => {
        dispatch(updateStockPrices(prices));
      });
      
      // Store cleanup function
      (window as any).__analyticsFinnhubCleanup = unsubFinnhub;
    };
    
    initFinnhub();

    return () => {
      unsubBinance();
      const cleanup = (window as any).__analyticsFinnhubCleanup;
      if (cleanup) cleanup();
    };
  }, [dispatch]);

  // Get top gainers and losers
  const cryptoArray = Object.values(cryptoPrices) as any[];
  const stockArray = Object.values(stockPrices) as any[];

  const topCryptoGainers = [...cryptoArray]
    .sort((a, b) => b.priceChangePercent24h - a.priceChangePercent24h)
    .slice(0, 5);

  const topCryptoLosers = [...cryptoArray]
    .sort((a, b) => a.priceChangePercent24h - b.priceChangePercent24h)
    .slice(0, 5);

  const topStockGainers = [...stockArray]
    .sort((a, b) => (b.priceChangePercent || 0) - (a.priceChangePercent || 0))
    .slice(0, 5);

  const topStockLosers = [...stockArray]
    .sort((a, b) => (a.priceChangePercent || 0) - (b.priceChangePercent || 0))
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-background">
      <Header activePage="analytics" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 animate-fade-in">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Market Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time market insights and trends
            </p>
          </div>
        </div>

        {/* Market Overview */}
        <Card className="mb-6 animate-slide-up">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Market Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="stat-block">
                <div className="section-label mb-1.5">Cryptocurrencies</div>
                <div className="value-large text-2xl">{cryptoArray.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Assets tracked</div>
              </div>
              <div className="stat-block">
                <div className="section-label mb-1.5">Stocks</div>
                <div className="value-large text-2xl">{stockArray.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Assets tracked</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cryptocurrency Top Movers */}
        <div className="mb-6 animate-slide-up animate-delay-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H11.5v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.65c.1 1.7 1.36 2.66 2.85 2.97V19h1.75v-1.68c1.52-.29 2.72-1.18 2.72-2.77-.01-2.03-1.7-2.79-3.66-3.41z"/>
              </svg>
            </div>
            <h2 className="text-base font-medium text-foreground tracking-tight">Cryptocurrency Top Movers</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Top Gainers */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                  <h3 className="text-sm font-semibold text-success">Top Gainers</h3>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {topCryptoGainers.map((crypto, index) => (
                    <div
                      key={crypto.symbol}
                      onClick={() => router.push(`/crypto/${crypto.symbol.toLowerCase()}`)}
                      className="flex items-center justify-between p-2.5 rounded-md hover:bg-accent/50 transition-colors duration-150 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground font-mono w-4">#{index + 1}</span>
                        <div>
                          <div className="text-sm font-medium text-foreground">{crypto.symbol}</div>
                          <div className="text-xs text-muted-foreground">{formatCurrency(crypto.price)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-mono font-medium ${getPriceChangeColor(crypto.priceChangePercent24h)}`}>
                          {formatPercentage(crypto.priceChangePercent24h)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Losers */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
                  </svg>
                  <h3 className="text-sm font-semibold text-error">Top Losers</h3>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {topCryptoLosers.map((crypto, index) => (
                    <div
                      key={crypto.symbol}
                      onClick={() => router.push(`/crypto/${crypto.symbol.toLowerCase()}`)}
                      className="flex items-center justify-between p-2.5 rounded-md hover:bg-accent/50 transition-colors duration-150 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground font-mono w-4">#{index + 1}</span>
                        <div>
                          <div className="text-sm font-medium text-foreground">{crypto.symbol}</div>
                          <div className="text-xs text-muted-foreground">{formatCurrency(crypto.price)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-mono font-medium ${getPriceChangeColor(crypto.priceChangePercent24h)}`}>
                          {formatPercentage(crypto.priceChangePercent24h)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Stock Top Movers */}
        <div className="animate-slide-up animate-delay-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 13h2v8H3v-8zm4-4h2v12H7V9zm4-4h2v16h-2V5zm4 8h2v8h-2v-8zm4-6h2v14h-2V7z"/>
              </svg>
            </div>
            <h2 className="text-base font-medium text-foreground tracking-tight">Stock Market Top Movers</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Top Gainers */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                  <h3 className="text-sm font-semibold text-success">Top Gainers</h3>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {topStockGainers.length > 0 ? (
                    topStockGainers.map((stock, index) => (
                      <div
                        key={stock.symbol}
                        onClick={() => router.push(`/stocks/${stock.symbol}`)}
                        className="flex items-center justify-between p-2.5 rounded-md hover:bg-accent/50 transition-colors duration-150 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground font-mono w-4">#{index + 1}</span>
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {stock.symbol === 'OANDA:XAU_USD' ? 'Gold' : stock.symbol}
                            </div>
                            <div className="text-xs text-muted-foreground">{formatCurrency(stock.price)}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-sm font-mono font-medium ${getPriceChangeColor(stock.priceChangePercent || 0)}`}>
                            {formatPercentage(stock.priceChangePercent || 0)}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-sm text-muted-foreground">Waiting for data...</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Losers */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
                  </svg>
                  <h3 className="text-sm font-semibold text-error">Top Losers</h3>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {topStockLosers.length > 0 ? (
                    topStockLosers.map((stock, index) => (
                      <div
                        key={stock.symbol}
                        onClick={() => router.push(`/stocks/${stock.symbol}`)}
                        className="flex items-center justify-between p-2.5 rounded-md hover:bg-accent/50 transition-colors duration-150 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground font-mono w-4">#{index + 1}</span>
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {stock.symbol === 'OANDA:XAU_USD' ? 'Gold' : stock.symbol}
                            </div>
                            <div className="text-xs text-muted-foreground">{formatCurrency(stock.price)}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-sm font-mono font-medium ${getPriceChangeColor(stock.priceChangePercent || 0)}`}>
                            {formatPercentage(stock.priceChangePercent || 0)}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-sm text-muted-foreground">Waiting for data...</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Info Note */}
        <div className="mt-6 p-3 bg-primary/5 border border-primary/15 rounded-md text-center animate-slide-up animate-delay-300">
          <p className="text-xs text-muted-foreground">
            Data updates in real-time via WebSocket connections
          </p>
        </div>
      </div>
    </main>
  );
}
