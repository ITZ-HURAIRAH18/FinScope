"use client";

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchTransactionHistory } from '@/store/slices/portfolioSlice';
import { formatCurrency, formatPercentage } from '@/lib/utils';

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
    <div className="glass-card p-6 rounded-2xl border border-white/20">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Transaction History</h2>

        {/* Filter */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">All</option>
          <option value="CRYPTO">Crypto</option>
          <option value="STOCK">Stocks</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          No transactions yet. Start trading to see your history!
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 text-gray-400 font-semibold">Date</th>
                <th className="text-left py-3 px-4 text-gray-400 font-semibold">Symbol</th>
                <th className="text-left py-3 px-4 text-gray-400 font-semibold">Type</th>
                <th className="text-left py-3 px-4 text-gray-400 font-semibold">Action</th>
                <th className="text-right py-3 px-4 text-gray-400 font-semibold">Quantity</th>
                <th className="text-right py-3 px-4 text-gray-400 font-semibold">Price</th>
                <th className="text-right py-3 px-4 text-gray-400 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="py-3 px-4 text-gray-300 text-sm">
                    {new Date(tx.createdAt).toLocaleDateString()} <br />
                    <span className="text-xs text-gray-500">
                      {new Date(tx.createdAt).toLocaleTimeString()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-white font-semibold">{tx.symbol}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      tx.type === 'CRYPTO' 
                        ? 'bg-blue-500/20 text-blue-400' 
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      tx.action === 'BUY' 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {tx.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-white font-mono">
                    {tx.quantity.toFixed(8)}
                  </td>
                  <td className="py-3 px-4 text-right text-white font-mono">
                    {formatCurrency(tx.price)}
                  </td>
                  <td className="py-3 px-4 text-right text-white font-mono font-semibold">
                    {formatCurrency(tx.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
