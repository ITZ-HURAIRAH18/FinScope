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
      <Header activePage="markets" />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-gray-400 hover:text-white transition mb-4 sm:mb-6 flex items-center text-sm sm:text-base"
        >
          ← Back to Markets
        </button>

        {/* Header Section */}
        <div className="glass-card p-4 sm:p-6 lg:p-8 rounded-2xl mb-6 sm:mb-8 border border-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center space-x-4">
              <CryptoIcon 
                symbol={symbol} 
                className="w-12 h-12 sm:w-16 sm:h-16 mr-3" 
              />
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white">{symbol}</h1>
                <p className="text-gray-400">Cryptocurrency</p>
              </div>
            </div>

            <div className="text-left md:text-right">
              <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white font-mono mb-2">
                {formatCurrency(priceData.price)}
              </div>
              <div className={`text-lg sm:text-xl lg:text-2xl font-semibold ${getPriceChangeColor(priceData.priceChangePercent24h)}`}>
                {formatPercentage(priceData.priceChangePercent24h)}
                <span className="text-sm sm:text-base lg:text-lg ml-2">({formatCurrency(priceData.priceChange24h)})</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Chart Section */}
        <CryptoChart symbol={symbol} />

        {/* Trading Section */}
        <TradingPanel symbol={symbol} type="CRYPTO" currentPrice={priceData.price} />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="glass-card p-4 sm:p-6 rounded-2xl border border-white">
            <div className="text-gray-400 mb-2 text-sm sm:text-base">24h High</div>
            <div className="text-xl sm:text-2xl font-bold text-white font-mono">
              {formatCurrency(priceData.high24h)}
            </div>
          </div>

          <div className="glass-card p-4 sm:p-6 rounded-2xl">
            <div className="text-gray-400 mb-2 text-sm sm:text-base">24h Low</div>
            <div className="text-xl sm:text-2xl font-bold text-white font-mono">
              {formatCurrency(priceData.low24h)}
            </div>
          </div>

          <div className="glass-card p-4 sm:p-6 rounded-2xl">
            <div className="text-gray-400 mb-2 text-sm sm:text-base">24h Volume</div>
            <div className="text-xl sm:text-2xl font-bold text-white font-mono">
              {formatLargeNumber(priceData.volume24h)}
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="glass-card p-4 sm:p-6 lg:p-8 rounded-2xl mb-6 sm:mb-8 border border-white">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Market Information</h2>
          
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
