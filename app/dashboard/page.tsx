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
import MarketTable from "@/components/markets/MarketTable";
import LoadingScreen from "@/components/LoadingScreen";

function DashboardContent() {
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const { activeMarket, searchQuery } = useAppSelector((state) => state.market);
  const [isInitialized, setIsInitialized] = useState(false);

  // Handle URL parameter for tab selection
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'crypto' || tab === 'stocks' || tab === 'both') {
      dispatch(setActiveMarket(tab));
    }
  }, [searchParams, dispatch]);

  useEffect(() => {
    // Initialize WebSocket connections
    console.log("Initializing WebSocket connections...");

    // Connect to Binance
    binanceWS.connect();
    const unsubBinance = binanceWS.subscribe((prices) => {
      dispatch(updateCryptoPrices(prices));
    });

    // Connect to Finnhub
    const finnhubAPIKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || "";
    const finnhubWS = getFinnhubWS(finnhubAPIKey);
    finnhubWS.connect();
    const unsubFinnhub = finnhubWS.subscribe((prices) => {
      dispatch(updateStockPrices(prices));
    });

    setIsInitialized(true);

    // Cleanup
    return () => {
      unsubBinance();
      unsubFinnhub();
      binanceWS.disconnect();
      finnhubWS.disconnect();
    };
  }, [dispatch]);

  if (!isInitialized) {
    return <LoadingScreen />;
  }

  return (
    <main className="min-h-screen bg-black">
      {/* Header */}
      <Header activePage="markets" />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Markets Dashboard
          </h1>
          <p className="text-gray-400">
            Real-time cryptocurrency and stock market data
          </p>
        </div>

        {/* Filters */}
        <div className="glass-card p-6 rounded-2xl mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            {/* Market Type Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => dispatch(setActiveMarket("crypto"))}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  activeMarket === "crypto"
                    ? "bg-red-500 text-white"
                    : "bg-white/10 text-gray-300 hover:bg-white/20"
                }`}
              >
                Crypto
              </button>
              <button
                onClick={() => dispatch(setActiveMarket("stocks"))}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  activeMarket === "stocks"
                    ? "bg-red-500 text-white"
                    : "bg-white/10 text-gray-300 hover:bg-white/20"
                }`}
              >
                Stocks
              </button>
              <button
                onClick={() => dispatch(setActiveMarket("both"))}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  activeMarket === "both"
                    ? "bg-red-500 text-white"
                    : "bg-white/10 text-gray-300 hover:bg-white/20"
                }`}
              >
                Both
              </button>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search symbols..."
                value={searchQuery}
                onChange={(e) => dispatch(setSearchQuery(e.target.value))}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>
        </div>

        {/* Market Tables */}
        <div className="space-y-8">
          {(activeMarket === "crypto" || activeMarket === "both") && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                <span className="mr-2">₿</span> Cryptocurrency Markets
              </h2>
              <MarketTable type="crypto" />
            </div>
          )}

          {(activeMarket === "stocks" || activeMarket === "both") && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                <span className="mr-2">$</span> Stock Markets
              </h2>
              <MarketTable type="stocks" />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DashboardContent />
    </Suspense>
  );
}
