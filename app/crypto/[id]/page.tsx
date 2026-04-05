"use client";

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { useAppSelector } from '@/store/hooks';
import { formatCurrency, formatPercentage, getPriceChangeColor, formatLargeNumber } from '@/lib/utils';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import CryptoChart from '@/components/crypto/CryptoChart';
import LoadingScreen from '@/components/LoadingScreen';
import TradingPanel from '@/components/trading/TradingPanel';
import CryptoIcon from '@/components/crypto/CryptoIcon';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui';

export default function CryptoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const cryptoId = params.id as string;
  const symbol = cryptoId.toUpperCase();

  const { cryptoPrices } = useAppSelector((state) => state.market);
  const priceData = cryptoPrices[symbol];

  if (!priceData) {
    return <LoadingScreen />;
  }

  return (
    <main className="min-h-screen bg-background">
      <Header activePage="markets" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
                <CryptoIcon symbol={symbol} className="w-12 h-12" />
                <div>
                  <h1 className="text-xl font-semibold text-foreground tracking-tight">{symbol}</h1>
                  <p className="text-sm text-muted-foreground">Cryptocurrency</p>
                </div>
                <WatchlistButton symbol={symbol} type="CRYPTO" meta={{ name: symbol }} />
              </div>

              <div className="text-left md:text-right">
                <div className="text-2xl font-semibold text-foreground font-mono tracking-tight mb-1">
                  {formatCurrency(priceData.price)}
                </div>
                <div className={`text-sm font-mono font-medium ${getPriceChangeColor(priceData.priceChangePercent24h)}`}>
                  {formatPercentage(priceData.priceChangePercent24h)}
                  <span className="text-xs ml-1">({formatCurrency(priceData.priceChange24h)})</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart Section */}
        <div className="mb-6 animate-slide-up">
          <CryptoChart symbol={symbol} />
        </div>

        {/* Trading Section */}
        <div className="grid lg:grid-cols-3 gap-4 mb-6 animate-slide-up animate-delay-100">
          <div className="lg:col-span-1">
            <TradingPanel symbol={symbol} type="CRYPTO" currentPrice={priceData.price} />
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
                    <div className="section-label mb-1.5">24h High</div>
                    <div className="value-mono text-sm text-success">{formatCurrency(priceData.high24h)}</div>
                  </div>
                  <div className="stat-block">
                    <div className="section-label mb-1.5">24h Low</div>
                    <div className="value-mono text-sm text-error">{formatCurrency(priceData.low24h)}</div>
                  </div>
                  <div className="stat-block">
                    <div className="section-label mb-1.5">24h Volume</div>
                    <div className="value-mono text-sm">{formatLargeNumber(priceData.volume24h)}</div>
                  </div>
                  <div className="stat-block">
                    <div className="section-label mb-1.5">24h Change</div>
                    <div className={`value-mono text-sm ${getPriceChangeColor(priceData.priceChange24h)}`}>
                      {formatCurrency(priceData.priceChange24h)}
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
                <span className="text-sm text-muted-foreground">Current Price</span>
                <span className="text-sm font-mono font-medium text-foreground">{formatCurrency(priceData.price)}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border/60">
                <span className="text-sm text-muted-foreground">24h Change</span>
                <span className={`text-sm font-mono font-medium ${getPriceChangeColor(priceData.priceChange24h)}`}>
                  {formatCurrency(priceData.priceChange24h)}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border/60">
                <span className="text-sm text-muted-foreground">24h Change %</span>
                <span className={`text-sm font-mono font-medium ${getPriceChangeColor(priceData.priceChangePercent24h)}`}>
                  {formatPercentage(priceData.priceChangePercent24h)}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border/60">
                <span className="text-sm text-muted-foreground">24h Volume</span>
                <span className="text-sm font-mono font-medium text-foreground">{formatLargeNumber(priceData.volume24h)}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border/60">
                <span className="text-sm text-muted-foreground">24h High</span>
                <span className="text-sm font-mono font-medium text-success">{formatCurrency(priceData.high24h)}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border/60">
                <span className="text-sm text-muted-foreground">24h Low</span>
                <span className="text-sm font-mono font-medium text-error">{formatCurrency(priceData.low24h)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
