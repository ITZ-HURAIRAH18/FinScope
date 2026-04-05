"use client";

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Header from '@/components/Header';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchPortfolio } from '@/store/slices/portfolioSlice';
import { formatCurrency, getPriceChangeColor, formatPercentage } from '@/lib/utils';
import PortfolioSummary from '@/components/trading/PortfolioSummary';
import TransactionHistory from '@/components/trading/TransactionHistory';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui';

export default function PortfolioPage() {
  const { data: session, status } = useSession();
  const dispatch = useAppDispatch();
  const { holdings, loading } = useAppSelector((state) => state.portfolio);
  const { cryptoPrices, stockPrices } = useAppSelector((state) => state.market);

  useEffect(() => {
    if (session?.user) {
      dispatch(fetchPortfolio());
    }
  }, [session, dispatch]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <Header activePage="portfolio" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 animate-fade-in">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              My Portfolio
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track your investments and performance
            </p>
          </div>
        </div>

        {/* Portfolio Summary */}
        <div className="mb-6 animate-slide-up">
          <PortfolioSummary />
        </div>

        {/* Holdings */}
        <Card className="mb-6 animate-slide-up animate-delay-100">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Holdings</CardTitle>
              {holdings.length > 0 && (
                <Badge variant="muted">{holdings.length} asset{holdings.length !== 1 ? 's' : ''}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-12 text-sm text-muted-foreground">Loading...</div>
            ) : holdings.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-12 h-12 mx-auto mb-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V6m18 0V5.25A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25V12" />
                </svg>
                <p className="text-sm text-muted-foreground mb-4">You don&apos;t have any holdings yet</p>
                <Link href="/dashboard">
                  <Button variant="primary" size="sm">Start Trading</Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-card-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Asset</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Quantity</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Buy</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Current</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Value</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">P&L</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">P&L %</th>
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
                        <tr key={holding.id} className="border-b border-card-border/50 last:border-0 hover:bg-accent/50 transition-colors duration-150">
                          <td className="px-4 py-3">
                            <Link
                              href={holding.type === 'CRYPTO' ? `/crypto/${holding.symbol.toLowerCase()}` : `/stocks/${holding.symbol}`}
                              className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                            >
                              {holding.symbol}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={holding.type === 'CRYPTO' ? 'primary' : 'muted'}>
                              {holding.type === 'CRYPTO' ? 'Crypto' : 'Stock'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                            {holding.quantity.toFixed(8)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                            {formatCurrency(holding.averageBuyPrice)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                            {currentPrice ? formatCurrency(currentPrice) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-mono font-medium text-foreground">
                            {currentPrice ? formatCurrency(currentValue) : '-'}
                          </td>
                          <td className={`px-4 py-3 text-right text-sm font-mono font-medium ${getPriceChangeColor(pl)}`}>
                            {currentPrice ? formatCurrency(pl) : '-'}
                          </td>
                          <td className={`px-4 py-3 text-right text-sm font-mono font-medium ${getPriceChangeColor(plPercent)}`}>
                            {currentPrice ? formatPercentage(plPercent) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transaction History */}
        <div className="animate-slide-up animate-delay-200">
          <TransactionHistory />
        </div>
      </div>
    </main>
  );
}
