"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setActiveMarket,
  setSearchQuery,
  setSortField,
  updateCryptoPrices,
  updateStockPrices,
} from "@/store/slices/marketSlice";
import { binanceWS } from "@/lib/binance-websocket";
import { getFinnhubWS } from "@/lib/finnhub-websocket";
import { formatLargeNumber, formatPercentage } from "@/lib/utils";
import MarketTable from "@/components/markets/MarketTable";
import LoadingScreen from "@/components/LoadingScreen";
import { Card, CardContent } from "@/components/ui";
import { TrendingUp, BarChart3, Activity } from "lucide-react";
import CryptoIcon from "@/components/crypto/CryptoIcon";

function DashboardContent() {
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const { activeMarket, searchQuery, cryptoPrices, stockPrices } = useAppSelector((state) => state.market);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'crypto' || tab === 'stocks' || tab === 'both') {
      dispatch(setActiveMarket(tab));
    }
  }, [searchParams, dispatch]);

  useEffect(() => {
    binanceWS.connect();
    const unsubBinance = binanceWS.subscribe((prices) => {
      dispatch(updateCryptoPrices(prices));
    });

    // Initialize Finnhub WebSocket with async token fetch
    const initFinnhub = async () => {
      const finnhubAPIKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || "";
      const finnhubWS = await getFinnhubWS(finnhubAPIKey);
      finnhubWS.connect();
      const unsubFinnhub = finnhubWS.subscribe((prices) => {
        dispatch(updateStockPrices(prices));
      });

      // Store cleanup function
      (window as any).__dashboardFinnhubCleanup = unsubFinnhub;
    };

    initFinnhub();
    setIsInitialized(true);

    return () => {
      unsubBinance();
      const cleanup = (window as any).__dashboardFinnhubCleanup;
      if (cleanup) cleanup();
      binanceWS.disconnect();
    };
  }, [dispatch]);

  if (!isInitialized) {
    return <LoadingScreen />;
  }

  // Calculate summary stats
  const cryptoArray = Object.values(cryptoPrices);
  const stockArray = Object.values(stockPrices);

  const totalCryptoVolume = cryptoArray.reduce((sum: number, item: any) => sum + (item.volume24h || 0), 0);
  const totalStockVolume = stockArray.reduce((sum: number, item: any) => sum + (item.volume || 0), 0);

  const marketTabs = [
    { key: "both" as const, label: "All Markets" },
    { key: "crypto" as const, label: "Crypto" },
    { key: "stocks" as const, label: "Stocks" },
  ];

  return (
    <main className="min-h-screen bg-background">
      <Header activePage="markets" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 animate-fade-in">
          <div>
            <h1 className="text-3xl font-semibold text-foreground tracking-tight">
              Markets
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time market data across {cryptoArray.length + stockArray.length} assets
            </p>
          </div>

          {/* Market Stats Summary */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              <span className="font-medium">Crypto</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              <span className="font-medium">Stocks</span>
            </div>
          </div>
        </div>

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 animate-slide-up">
          <StatCard
            label="Crypto Assets"
            value={cryptoArray.length.toString()}
            icon={<CryptoIcon symbol="BTC" className="w-4 h-4" />}
          />
          <StatCard
            label="Stocks Tracked"
            value={stockArray.length.toString()}
            icon={<BarChart3 className="w-4 h-4" />}
          />
          <StatCard
            label="24h Crypto Volume"
            value={formatLargeNumber(totalCryptoVolume)}
            icon={<Activity className="w-4 h-4" />}
          />
          <StatCard
            label="24h Stock Volume"
            value={formatLargeNumber(totalStockVolume)}
            icon={<TrendingUp className="w-4 h-4" />}
          />
        </div>

        {/* Filters Bar */}
        <Card className="mb-6 animate-slide-up animate-delay-100">
          <CardContent className="py-3">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              {/* Market Type Toggle */}
              <div className="flex gap-0.5 p-0.5 bg-secondary rounded-md">
                {marketTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => dispatch(setActiveMarket(tab.key))}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-sm transition-all duration-150 ${
                      activeMarket === tab.key
                        ? "bg-card text-foreground shadow-subtle"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="w-full sm:w-64">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search symbols..."
                    value={searchQuery}
                    onChange={(e) => dispatch(setSearchQuery(e.target.value))}
                    className="input pl-9 w-full text-xs"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Market Tables */}
        <div className="space-y-8">
          {(activeMarket === "crypto" || activeMarket === "both") && (
            <div className="animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H11.5v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.65c.1 1.7 1.36 2.66 2.85 2.97V19h1.75v-1.68c1.52-.29 2.72-1.18 2.72-2.77-.01-2.03-1.7-2.79-3.66-3.41z"/>
                    </svg>
                  </div>
                  <h2 className="text-base font-semibold text-foreground tracking-tight">
                    Cryptocurrency
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                    {cryptoArray.length}
                  </span>
                </div>
              </div>
              <MarketTable type="crypto" />
            </div>
          )}

          {(activeMarket === "stocks" || activeMarket === "both") && (
            <div className="animate-slide-up animate-delay-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 13h2v8H3v-8zm4-4h2v12H7V9zm4-4h2v16h-2V5zm4 8h2v8h-2v-8zm4-6h2v14h-2V7z"/>
                    </svg>
                  </div>
                  <h2 className="text-base font-semibold text-foreground tracking-tight">
                    Stock Markets
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                    {stockArray.length}
                  </span>
                </div>
              </div>
              <MarketTable type="stocks" />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// Stat Card Component
function StatCard({ label, value, icon }: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-card-border transition-all duration-200 hover:border-primary/20 hover:shadow-sm">
      <div className="flex-shrink-0 w-9 h-9 rounded-md bg-secondary/80 flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        <div className="text-sm font-mono font-semibold text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DashboardContent />
    </Suspense>
  );
}
