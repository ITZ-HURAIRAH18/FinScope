"use client";

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { executeBuy, executeSell, fetchPortfolio } from '@/store/slices/portfolioSlice';
import { formatCurrency } from '@/lib/utils';

interface TradingPanelProps {
  symbol: string;
  type: 'CRYPTO' | 'STOCK';
  currentPrice: number;
}

export default function TradingPanel({ symbol, type, currentPrice }: TradingPanelProps) {
  const { data: session } = useSession();
  const dispatch = useAppDispatch();
  const { balance, holdings, loading, error } = useAppSelector((state) => state.portfolio);
  
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Find current holding for this symbol
  const currentHolding = holdings.find(
    (h) => h.symbol === symbol && h.type === type
  );

  useEffect(() => {
    if (session?.user) {
      dispatch(fetchPortfolio());
    }
  }, [dispatch, session]);

  const handleQuantityChange = (value: string) => {
    // Allow decimal numbers
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setQuantity(value);
    }
  };

  const calculateTotal = () => {
    const qty = parseFloat(quantity) || 0;
    return qty * currentPrice;
  };

  const handleBuy = async () => {
    if (!quantity || parseFloat(quantity) <= 0) {
      return;
    }

    const qty = parseFloat(quantity);
    const total = qty * currentPrice;

    if (total > balance) {
      return;
    }

    try {
      await dispatch(executeBuy({ symbol, type, quantity: qty, price: currentPrice })).unwrap();
      setSuccessMessage(`Successfully bought ${qty} ${symbol}`);
      setQuantity('');
      dispatch(fetchPortfolio());
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      console.error('Buy error:', err);
    }
  };

  const handleSell = async () => {
    if (!quantity || parseFloat(quantity) <= 0) {
      return;
    }

    const qty = parseFloat(quantity);

    if (!currentHolding || qty > currentHolding.quantity) {
      return;
    }

    try {
      await dispatch(executeSell({ symbol, type, quantity: qty, price: currentPrice })).unwrap();
      setSuccessMessage(`Successfully sold ${qty} ${symbol}`);
      setQuantity('');
      dispatch(fetchPortfolio());
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      console.error('Sell error:', err);
    }
  };

  const handleMaxBuy = () => {
    const maxQty = balance / currentPrice;
    setQuantity(maxQty.toFixed(8));
  };

  const handleMaxSell = () => {
    if (currentHolding) {
      setQuantity(currentHolding.quantity.toString());
    }
  };

  if (!session) {
    return (
      <div className="glass-card p-4 sm:p-6 lg:p-8 rounded-2xl border border-white/20 mb-8">
        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Trading</h2>
          <p className="text-gray-400 mb-4">Please log in to start trading</p>
          <a
            href="/auth/login"
            className="inline-block px-6 py-3 bg-gradient-to-r from-red-600 via-red-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg transition"
          >
            Log In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 sm:p-6 lg:p-8 rounded-2xl border border-white/20 mb-8">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Trade {symbol}</h2>

      {/* Buy/Sell Tabs */}
      <div className="flex mb-4 sm:mb-6 bg-black/30 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('buy')}
          className={`flex-1 py-2 sm:py-3 rounded-lg text-sm sm:text-base font-semibold transition ${
            activeTab === 'buy'
              ? 'bg-green-500 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setActiveTab('sell')}
          className={`flex-1 py-2 sm:py-3 rounded-lg text-sm sm:text-base font-semibold transition ${
            activeTab === 'sell'
              ? 'bg-red-500 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Current Info */}
      <div className="mb-4 sm:mb-6 space-y-2 sm:space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm sm:text-base text-gray-400">Current Price</span>
          <span className="text-sm sm:text-base text-white font-mono font-semibold">{formatCurrency(currentPrice)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm sm:text-base text-gray-400">Available Balance</span>
          <span className="text-sm sm:text-base text-white font-mono font-semibold">{formatCurrency(balance)}</span>
        </div>
        {currentHolding && (
          <div className="flex justify-between items-center">
            <span className="text-sm sm:text-base text-gray-400">Your Holdings</span>
            <span className="text-sm sm:text-base text-white font-mono font-semibold">
              {currentHolding.quantity.toFixed(8)} {symbol}
            </span>
          </div>
        )}
      </div>

      {/* Quantity Input */}
      <div className="mb-4">
        <label className="block text-gray-400 mb-2">Quantity</label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={quantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
            placeholder="0.00"
            className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={activeTab === 'buy' ? handleMaxBuy : handleMaxSell}
            className="px-4 py-3 bg-blue-500/20 border border-blue-500/50 rounded-lg text-blue-400 hover:bg-blue-500/30 transition"
          >
            MAX
          </button>
        </div>
      </div>

      {/* Total */}
      <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-black/30 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-sm sm:text-base text-gray-400">Total</span>
          <span className="text-xl sm:text-2xl font-bold text-white font-mono">
            {formatCurrency(calculateTotal())}
          </span>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400">
          {successMessage}
        </div>
      )}

      {/* Action Button */}
      {activeTab === 'buy' ? (
        <button
          onClick={handleBuy}
          disabled={loading || !quantity || parseFloat(quantity) <= 0 || calculateTotal() > balance}
          className="w-full py-3 sm:py-4 text-sm sm:text-base bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-green-500/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : `Buy ${symbol}`}
        </button>
      ) : (
        <button
          onClick={handleSell}
          disabled={
            loading ||
            !quantity ||
            parseFloat(quantity) <= 0 ||
            !currentHolding ||
            parseFloat(quantity) > currentHolding.quantity
          }
          className="w-full py-3 sm:py-4 text-sm sm:text-base bg-gradient-to-r from-red-500 to-red-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-red-500/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : `Sell ${symbol}`}
        </button>
      )}
    </div>
  );
}
