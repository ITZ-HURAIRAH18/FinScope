"use client";

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchPortfolio, updatePortfolioValue } from '@/store/slices/portfolioSlice';
import { formatCurrency, getPriceChangeColor } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

export default function PortfolioSummary() {
  const { data: session } = useSession();
  const dispatch = useAppDispatch();
  const { balance, holdings, totalValue, totalPL, loading } = useAppSelector((state) => state.portfolio);
  const { cryptoPrices, stockPrices } = useAppSelector((state) => state.market);

  useEffect(() => {
    if (session?.user) {
      dispatch(fetchPortfolio());
    }
  }, [dispatch, session]);

  useEffect(() => {
    if (session?.user) {
      dispatch(updatePortfolioValue({ cryptoPrices, stockPrices }));
    }
  }, [dispatch, cryptoPrices, stockPrices, session]);

  if (!session) {
    return null;
  }

  let holdingsValue = 0;
  let totalCost = 0;

  holdings.forEach((holding) => {
    const currentPrice = holding.type === 'CRYPTO'
      ? cryptoPrices[holding.symbol]?.price
      : stockPrices[holding.symbol]?.price;

    if (currentPrice) {
      holdingsValue += holding.quantity * currentPrice;
      totalCost += holding.quantity * holding.averageBuyPrice;
    } else {
      holdingsValue += holding.quantity * holding.averageBuyPrice;
      totalCost += holding.quantity * holding.averageBuyPrice;
    }
  });

  const calculatedTotalValue = balance + holdingsValue;
  const calculatedPL = holdingsValue - totalCost;
  const plPercentage = totalCost > 0 ? (calculatedPL / totalCost) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Portfolio Overview</CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
            </span>
            <span>Live</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Primary Value Display */}
        <div className="mb-5 pb-5 border-b border-border/60">
          <div className="section-label mb-1.5">Total Portfolio Value</div>
          <div className="value-large text-3xl tracking-tight">
            {loading ? (
              <span className="shimmer inline-block w-48 h-9 rounded-md"></span>
            ) : (
              formatCurrency(calculatedTotalValue)
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* Cash Balance */}
          <div className="stat-block">
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="section-label">Cash</span>
            </div>
            <div className="value-mono text-sm">
              {loading ? '...' : formatCurrency(balance)}
            </div>
          </div>

          {/* Holdings Value */}
          <div className="stat-block">
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              <span className="section-label">Holdings</span>
            </div>
            <div className="value-mono text-sm">
              {loading ? '...' : formatCurrency(holdingsValue)}
            </div>
          </div>

          {/* P&L */}
          <div className="stat-block">
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg className={`w-3.5 h-3.5 ${calculatedPL >= 0 ? 'text-success' : 'text-error'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                {calculatedPL >= 0 ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
                )}
              </svg>
              <span className="section-label">P&L</span>
            </div>
            <div className={`value-mono text-sm ${getPriceChangeColor(calculatedPL)}`}>
              {loading ? '...' : (
                <>
                  {calculatedPL >= 0 ? '+' : ''}{formatCurrency(calculatedPL)}
                  {totalCost > 0 && (
                    <span className="text-xs ml-0.5 font-normal">
                      ({plPercentage >= 0 ? '+' : ''}{plPercentage.toFixed(2)}%)
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Starting Balance Note */}
        <div className="mt-4 p-3 bg-primary/5 border border-primary/15 rounded-md">
          <div className="flex items-start gap-2">
            <svg className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-muted-foreground">
              Started with {formatCurrency(100000)} virtual balance
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
