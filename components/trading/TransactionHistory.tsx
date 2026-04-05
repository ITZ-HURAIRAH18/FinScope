"use client";

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchTransactionHistory } from '@/store/slices/portfolioSlice';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';

export default function TransactionHistory() {
  const { data: session } = useSession();
  const dispatch = useAppDispatch();
  const { transactions, loading } = useAppSelector((state) => state.portfolio);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    if (session?.user) {
      dispatch(fetchTransactionHistory({ page: 1, limit: 20, type: filter || undefined }));
    }
  }, [dispatch, session, filter]);

  if (!session) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Transaction History</CardTitle>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-secondary border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          >
            <option value="">All</option>
            <option value="CRYPTO">Crypto</option>
            <option value="STOCK">Stocks</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto mb-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 01-6.375 0c.614-.613 1.196-1.252 1.743-1.914a59.731 59.731 0 0110.694 0c.547.662 1.13 1.3 1.743 1.914zm-4.89-11.18a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0z" />
            </svg>
            <p className="text-sm text-muted-foreground">No transactions yet. Start trading to see your history!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Symbol</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Quantity</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Price</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-card-border/50 last:border-0 hover:bg-accent/50 transition-colors duration-150">
                    <td className="py-3 px-4">
                      <span className="text-xs text-foreground">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-muted-foreground block">
                        {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-foreground">{tx.symbol}</td>
                    <td className="py-3 px-4">
                      <Badge variant={tx.type === 'CRYPTO' ? 'primary' : 'muted'}>
                        {tx.type === 'CRYPTO' ? 'Crypto' : 'Stock'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={tx.action === 'BUY' ? 'success' : 'error'}>
                        {tx.action}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-mono text-foreground">
                      {tx.quantity.toFixed(8)}
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-mono text-foreground">
                      {formatCurrency(tx.price)}
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-mono font-medium text-foreground">
                      {formatCurrency(tx.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
