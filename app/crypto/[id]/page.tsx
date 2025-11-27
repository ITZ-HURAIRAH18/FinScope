"use client";

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppSelector } from '@/store/hooks';
import { formatCurrency, formatPercentage, getPriceChangeColor, formatLargeNumber } from '@/lib/utils';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import AuthButton from '@/components/auth/AuthButton';
import CryptoChart from '@/components/crypto/CryptoChart';
import LoadingScreen from '@/components/LoadingScreen';
import TradingPanel from '@/components/trading/TradingPanel';

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
    <main className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-black/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">F</span>
              </div>
              <span className="text-2xl font-bold gradient-text">FinScope</span>
            </div>
            <nav className="flex items-center space-x-6">
              <Link href="/" className="text-gray-300 hover:text-white transition">Home</Link>
              <Link href="/dashboard" className="text-gray-300 hover:text-white transition">Markets</Link>
              <Link href="/analytics" className="text-gray-300 hover:text-white transition">Analytics</Link>
              <Link href="/watchlist" className="text-gray-300 hover:text-white transition">Watchlist</Link>
              <AuthButton />
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          onClick={() => router.push('/dashboard')}
          className="text-gray-400 hover:text-white transition mb-6 flex items-center"
        >
          ← Back to Markets
        </button>

        {/* Header Section */}
        <div className="glass-card p-8 rounded-2xl mb-8 border border-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center space-x-4">
              <img 
                src={`https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`}
                alt={symbol}
                className="w-16 h-16 rounded-full"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-2xl">{symbol.substring(0, 1)}</span>
              </div>
              <div>
                <h1 className="text-4xl font-bold text-white">{symbol}</h1>
                <p className="text-gray-400">Cryptocurrency</p>
              </div>
            </div>

            <div className="text-left md:text-right">
              <div className="text-4xl font-bold text-white font-mono mb-2">
                {formatCurrency(priceData.price)}
              </div>
              <div className={`text-2xl font-semibold ${getPriceChangeColor(priceData.priceChangePercent24h)}`}>
                {formatPercentage(priceData.priceChangePercent24h)}
                <span className="text-lg ml-2">({formatCurrency(priceData.priceChange24h)})</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Chart Section */}
        <CryptoChart symbol={symbol} />

        {/* Trading Section */}
        <TradingPanel symbol={symbol} type="CRYPTO" currentPrice={priceData.price} />

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="glass-card p-6 rounded-2xl border border-white">
            <div className="text-gray-400 mb-2">24h High</div>
            <div className="text-2xl font-bold text-white font-mono">
              {formatCurrency(priceData.high24h)}
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl">
            <div className="text-gray-400 mb-2">24h Low</div>
            <div className="text-2xl font-bold text-white font-mono">
              {formatCurrency(priceData.low24h)}
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl">
            <div className="text-gray-400 mb-2">24h Volume</div>
            <div className="text-2xl font-bold text-white font-mono">
              {formatLargeNumber(priceData.volume24h)}
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="glass-card p-8 rounded-2xl mb-8 border border-white">
          <h2 className="text-2xl font-bold text-white mb-6">Market Information</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <span className="text-gray-400">Current Price</span>
              <span className="text-white font-mono font-semibold">{formatCurrency(priceData.price)}</span>
            </div>

            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <span className="text-gray-400">24h Change</span>
              <span className={`font-mono font-semibold ${getPriceChangeColor(priceData.priceChange24h)}`}>
                {formatCurrency(priceData.priceChange24h)}
              </span>
            </div>

            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <span className="text-gray-400">24h Change %</span>
              <span className={`font-mono font-semibold ${getPriceChangeColor(priceData.priceChangePercent24h)}`}>
                {formatPercentage(priceData.priceChangePercent24h)}
              </span>
            </div>

            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <span className="text-gray-400">24h Volume</span>
              <span className="text-white font-mono font-semibold">{formatLargeNumber(priceData.volume24h)}</span>
            </div>

            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <span className="text-gray-400">24h High</span>
              <span className="text-green-500 font-mono font-semibold">{formatCurrency(priceData.high24h)}</span>
            </div>

            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <span className="text-gray-400">24h Low</span>
              <span className="text-red-500 font-mono font-semibold">{formatCurrency(priceData.low24h)}</span>
            </div>
          </div>
        </div>

        {/* Watchlist Button */}
        <div className="flex justify-center">
          <WatchlistButton symbol={symbol} type="CRYPTO" meta={{ name: symbol }} />
        </div>
      </div>
    </main>
  );
}
