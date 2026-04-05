"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { updateCryptoPrices, updateStockPrices } from "@/store/slices/marketSlice";
import { binanceWS } from "@/lib/binance-websocket";
import { getFinnhubWS } from "@/lib/finnhub-websocket";
import { formatCurrency, formatPercentage, getPriceChangeColor } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui";
import { FadeIn, StaggerContainer, ScaleIn } from "@/components/motion";
import {
  TrendingUp,
  BarChart3,
  Bell,
  ArrowRight,
  Bitcoin,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Clock,
} from "lucide-react";

// Mini sparkline component
function Sparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  if (!data.length) return null;

  const width = 80;
  const height = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const color = isPositive ? "hsl(var(--success))" : "hsl(var(--error))";

  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HomePage() {
  const dispatch = useAppDispatch();
  const { cryptoPrices, stockPrices } = useAppSelector((state) => state.market);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    console.log("Homepage: Initializing WebSocket connections...");

    binanceWS.connect();
    const unsubBinance = binanceWS.subscribe((prices) => {
      dispatch(updateCryptoPrices(prices));
      setLastUpdate(new Date());
    });

    // Initialize Finnhub WebSocket with async token fetch
    const initFinnhub = async () => {
      const finnhubAPIKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || "";
      const finnhubWS = await getFinnhubWS(finnhubAPIKey);
      finnhubWS.connect();
      const unsubFinnhub = finnhubWS.subscribe((prices) => {
        dispatch(updateStockPrices(prices));
        setLastUpdate(new Date());
      });

      // Store cleanup function
      (window as any).__finnhubCleanup = unsubFinnhub;
    };

    initFinnhub();

    return () => {
      unsubBinance();
      const cleanup = (window as any).__finnhubCleanup;
      if (cleanup) cleanup();
      binanceWS.disconnect();
    };
  }, [dispatch]);

  const cryptoSymbols = [
    { name: 'Bitcoin', symbol: 'BTC' },
    { name: 'Ethereum', symbol: 'ETH' },
    { name: 'Binance Coin', symbol: 'BNB' },
    { name: 'Solana', symbol: 'SOL' },
  ];

  const stockSymbols = ['AAPL', 'GOOGL', 'TSLA', 'OANDA:XAU_USD'];

  // Generate pseudo sparkline data from price changes
  const generateSparkline = (priceChangePercent: number): number[] => {
    const base = 100;
    const trend = priceChangePercent / 100;
    return Array.from({ length: 12 }, (_, i) => {
      const noise = (Math.sin(i * 1.5) * 2) + (Math.cos(i * 0.8) * 1.5);
      return base + (trend * i * 5) + noise;
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const cryptoCount = Object.keys(cryptoPrices).length;
  const stockCount = Object.keys(stockPrices).length;

  return (
    <main className="min-h-screen bg-background">
      <Header activePage="home" />

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          {/* Badge */}
          <FadeIn delay={0} duration={0.6}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              <span className="text-xs font-medium text-foreground">Live Market Data</span>
            </div>
          </FadeIn>

          {/* Heading */}
          <FadeIn delay={0.1} duration={0.7}>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight leading-[1.15]">
              Real-time markets.
              <br />
              <span className="gradient-text">Smarter decisions.</span>
            </h1>
          </FadeIn>

          {/* Subtitle */}
          <FadeIn delay={0.2} duration={0.7}>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Track {cryptoCount > 0 ? `${cryptoCount}+` : '15+'} crypto assets and {stockCount > 0 ? `${stockCount}+` : '10+'} major stock tickers with sub-second updates via WebSocket.
            </p>
          </FadeIn>

          {/* Stat Bar */}
          <FadeIn delay={0.3} duration={0.6}>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
              {[
                { value: '15+', label: 'Crypto Pairs' },
                { value: '10+', label: 'Major Stocks' },
                { value: '<1s', label: 'Update Latency' },
                { value: 'Free', label: 'Forever' },
              ].map((stat, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">{stat.value}</span>
                  <span className="text-muted-foreground">{stat.label}</span>
                  {i < 3 && <span className="text-muted-foreground/40 mx-1">•</span>}
                </div>
              ))}
            </div>
          </FadeIn>

          {/* CTA Buttons */}
          <ScaleIn delay={0.4} duration={0.5}>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors duration-150 shadow-sm"
              >
                View Markets
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium text-sm hover:bg-accent/50 transition-colors duration-150"
              >
                Get Started Free
              </Link>
            </div>
          </ScaleIn>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <StaggerContainer staggerDelay={0.12} baseDuration={0.5}>
          <div className="grid md:grid-cols-3 gap-5">
            {/* Feature 1 - Gradient background */}
            <Card hoverable className="p-6 rounded-xl border-border/60 bg-card/80 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4 text-primary">
                <Activity className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">Live Market Data</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Track real-time prices for thousands of cryptocurrencies and stocks with WebSocket connections for instant updates
              </p>
            </Card>

            {/* Feature 2 - Outline style */}
            <Card hoverable className="p-6 rounded-xl border-2 border-border/40 bg-card">
              <div className="w-10 h-10 rounded-lg border border-border bg-card flex items-center justify-center mb-4 text-muted-foreground">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">Interactive Charts</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Analyze trends with beautiful, responsive charts featuring multiple timeframes and technical indicators
              </p>
            </Card>

            {/* Feature 3 - Filled subtle background */}
            <Card hoverable className="p-6 rounded-xl border-border/60 bg-secondary/30">
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center mb-4 text-primary">
                <Bell className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">Personal Watchlists</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Create and manage custom watchlists to keep track of your favorite assets all in one place
              </p>
            </Card>
          </div>
        </StaggerContainer>
      </section>

      {/* Market Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-24">
        <FadeIn>
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
                Markets at a Glance
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Real-time market updates with live prices
              </p>
            </div>
            {lastUpdate && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>Updated {formatTime(lastUpdate)}</span>
              </div>
            )}
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Crypto */}
          <FadeIn delay={0.1}>
            <Card className="rounded-xl border-border/60">
              <CardContent className="py-5">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500/20 to-amber-500/10 flex items-center justify-center text-orange-500">
                      <Bitcoin className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Cryptocurrency</h3>
                      <p className="text-xs text-muted-foreground">Top movers</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-medium uppercase tracking-wide">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
                    </span>
                    Live
                  </span>
                </div>

                <div className="space-y-1 mb-5">
                  {cryptoSymbols.map(({ name, symbol }) => {
                    const priceData = cryptoPrices[symbol];
                    const isPositive = priceData ? priceData.priceChangePercent24h >= 0 : true;
                    const sparklineData = priceData ? generateSparkline(priceData.priceChangePercent24h) : [];

                    return (
                      <div
                        key={symbol}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors duration-150"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center text-xs font-bold text-muted-foreground">
                            {symbol.slice(0, 1)}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-foreground">{name}</div>
                            <div className="text-xs text-muted-foreground">{symbol}/USDT</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Sparkline data={sparklineData} isPositive={isPositive} />
                          <div className="text-right min-w-[80px]">
                            <div className="text-sm font-mono font-medium text-foreground">
                              {priceData ? formatCurrency(priceData.price) : '—'}
                            </div>
                            {priceData && (
                              <div className={`flex items-center gap-0.5 text-xs font-mono font-medium ${getPriceChangeColor(priceData.priceChangePercent24h)}`}>
                                {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {formatPercentage(priceData.priceChangePercent24h)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Link
                  href="/dashboard?tab=crypto"
                  className="group flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg text-sm font-medium text-primary hover:text-primary-hover hover:bg-primary/5 transition-colors duration-150"
                >
                  View all crypto
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </CardContent>
            </Card>
          </FadeIn>

          {/* Stocks */}
          <FadeIn delay={0.2}>
            <Card className="rounded-xl border-border/60">
              <CardContent className="py-5">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/10 flex items-center justify-center text-blue-500">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Stocks</h3>
                      <p className="text-xs text-muted-foreground">Major indices</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-medium uppercase tracking-wide">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
                    </span>
                    Live
                  </span>
                </div>

                <div className="space-y-1 mb-5">
                  {stockSymbols.map((symbol) => {
                    const priceData = stockPrices[symbol];
                    const isPositive = priceData ? priceData.priceChangePercent >= 0 : true;
                    const sparklineData = priceData ? generateSparkline(priceData.priceChangePercent) : [];
                    const displayName = symbol === 'OANDA:XAU_USD' ? 'Gold' : symbol;
                    const displayType = symbol === 'OANDA:XAU_USD' ? 'Spot' : 'Stock';

                    return (
                      <div
                        key={symbol}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors duration-150"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center text-xs font-bold text-muted-foreground">
                            {displayName.slice(0, 1)}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-foreground">{displayName}</div>
                            <div className="text-xs text-muted-foreground">{displayType}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Sparkline data={sparklineData} isPositive={isPositive} />
                          <div className="text-right min-w-[80px]">
                            <div className="text-sm font-mono font-medium text-foreground">
                              {priceData ? formatCurrency(priceData.price) : '—'}
                            </div>
                            {priceData && (
                              <div className={`flex items-center gap-0.5 text-xs font-mono font-medium ${getPriceChangeColor(priceData.priceChangePercent)}`}>
                                {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {formatPercentage(priceData.priceChangePercent)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Link
                  href="/dashboard?tab=stocks"
                  className="group flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg text-sm font-medium text-primary hover:text-primary-hover hover:bg-primary/5 transition-colors duration-150"
                >
                  View all stocks
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      </section>
    </main>
  );
}
