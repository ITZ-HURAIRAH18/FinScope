"use client";

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchPortfolio } from '@/store/slices/portfolioSlice';
import { formatCurrency, getPriceChangeColor, formatPercentage } from '@/lib/utils';
import AuthButton from '@/components/auth/AuthButton';
import PortfolioSummary from '@/components/trading/PortfolioSummary';
import TransactionHistory from '@/components/trading/TransactionHistory';

export default function PortfolioPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { holdings, loading } = useAppSelector((state) => state.portfolio);
  const { cryptoPrices, stockPrices } = useAppSelector((state) => state.market);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (session?.user) {
      dispatch(fetchPortfolio());
    }
  }, [status, session, dispatch, router]);

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
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
              <Link href="/portfolio" className="text-white font-semibold">Portfolio</Link>
              <AuthButton />
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold text-white mb-8">My Portfolio</h1>

        {/* Portfolio Summary */}
        <PortfolioSummary />

        {/* Holdings */}
        <div className="glass-card p-6 rounded-2xl border border-white/20 mb-8">
          <h2 className="text-2xl font-bold text-white mb-6">Holdings</h2>

          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : holdings.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">You don&apos;t have any holdings yet</p>
              <Link
                href="/dashboard"
                className="inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:shadow-lg transition"
              >
                Start Trading
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Asset</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Type</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-semibold">Quantity</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-semibold">Avg Buy Price</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-semibold">Current Price</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-semibold">Current Value</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-semibold">P&L</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-semibold">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => {
                    const currentPrice = holding.type === 'CRYPTO' 
                      ? cryptoPrices[holding.symbol]?.price 
                      : stockPrices[holding.symbol]?.price;
                    
                    const currentValue = currentPrice ? holding.quantity * currentPrice : 0;
                    const totalCost = holding.quantity * holding.averageBuyPrice;
                    const pl = currentValue - totalCost;
                    const plPercent = (pl / totalCost) * 100;

                    return (
                      <tr key={holding.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="py-3 px-4">
                          <Link
                            href={holding.type === 'CRYPTO' ? `/crypto/${holding.symbol.toLowerCase()}` : `/stocks/${holding.symbol}`}
                            className="text-white font-semibold hover:text-blue-400 transition"
                          >
                            {holding.symbol}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            holding.type === 'CRYPTO' 
                              ? 'bg-blue-500/20 text-blue-400' 
                              : 'bg-green-500/20 text-green-400'
                          }`}>
                            {holding.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-white font-mono">
                          {holding.quantity.toFixed(8)}
                        </td>
                        <td className="py-3 px-4 text-right text-white font-mono">
                          {formatCurrency(holding.averageBuyPrice)}
                        </td>
                        <td className="py-3 px-4 text-right text-white font-mono">
                          {currentPrice ? formatCurrency(currentPrice) : '-'}
                        </td>
                        <td className="py-3 px-4 text-right text-white font-mono font-semibold">
                          {currentPrice ? formatCurrency(currentValue) : '-'}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono font-semibold ${getPriceChangeColor(pl)}`}>
                          {currentPrice ? formatCurrency(pl) : '-'}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono font-semibold ${getPriceChangeColor(plPercent)}`}>
                          {currentPrice ? formatPercentage(plPercent) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Transaction History */}
        <TransactionHistory />
      </div>
    </main>
  );
}
