"use client";

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchPortfolio, updatePortfolioValue } from '@/store/slices/portfolioSlice';
import { formatCurrency, getPriceChangeColor } from '@/lib/utils';

export default function PortfolioSummary() {
  const { data: session } = useSession();
  const dispatch = useAppDispatch();
  const { balance, totalValue, totalPL, loading } = useAppSelector((state) => state.portfolio);
  const { cryptoPrices, stockPrices } = useAppSelector((state) => state.market);

  useEffect(() => {
    if (session?.user) {
      dispatch(fetchPortfolio());
    }
  }, [dispatch, session]);

  // Update portfolio value when prices change
  useEffect(() => {
    if (session?.user) {
      dispatch(updatePortfolioValue({ cryptoPrices, stockPrices }));
    }
  }, [dispatch, cryptoPrices, stockPrices, session]);

  if (!session) {
    return null;
  }

  const holdingsValue = totalValue - balance;
  const plPercentage = holdingsValue > 0 ? (totalPL / (holdingsValue - totalPL)) * 100 : 0;

  return (
    <div className="glass-card p-6 rounded-2xl border border-white/20 mb-8">
      <h2 className="text-2xl font-bold text-white mb-6">Portfolio Overview</h2>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Total Value */}
        <div className="p-4 bg-black/30 rounded-lg border border-white/10">
          <div className="text-gray-400 mb-2">Total Portfolio Value</div>
          <div className="text-3xl font-bold text-white font-mono">
            {loading ? '...' : formatCurrency(totalValue)}
          </div>
        </div>

        {/* Cash Balance */}
        <div className="p-4 bg-black/30 rounded-lg border border-white/10">
          <div className="text-gray-400 mb-2">Cash Balance</div>
          <div className="text-3xl font-bold text-white font-mono">
            {loading ? '...' : formatCurrency(balance)}
          </div>
        </div>

        {/* Holdings Value */}
        <div className="p-4 bg-black/30 rounded-lg border border-white/10">
          <div className="text-gray-400 mb-2">Holdings Value</div>
          <div className="text-3xl font-bold text-white font-mono">
            {loading ? '...' : formatCurrency(holdingsValue)}
          </div>
        </div>

        {/* P&L */}
        <div className="p-4 bg-black/30 rounded-lg border border-white/10">
          <div className="text-gray-400 mb-2">Total P&L</div>
          <div className={`text-3xl font-bold font-mono ${getPriceChangeColor(totalPL)}`}>
            {loading ? '...' : (
              <>
                {formatCurrency(totalPL)}
                {holdingsValue > 0 && (
                  <span className="text-lg ml-2">
                    ({plPercentage >= 0 ? '+' : ''}{plPercentage.toFixed(2)}%)
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Initial Balance Info */}
      <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-center">
        <p className="text-gray-300 text-sm">
          💡 You started with {formatCurrency(100000)} in virtual currency
        </p>
      </div>
    </div>
  );
}
