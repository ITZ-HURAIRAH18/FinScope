"use client";

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { executeBuy, executeSell, fetchPortfolio } from '@/store/slices/portfolioSlice';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Badge } from '@/components/ui';

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

  const currentHolding = holdings.find(
    (h) => h.symbol === symbol && h.type === type
  );

  useEffect(() => {
    if (session?.user) {
      dispatch(fetchPortfolio());
    }
  }, [dispatch, session]);

  const handleQuantityChange = (value: string) => {
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setQuantity(value);
    }
  };

  const calculateTotal = () => {
    const qty = parseFloat(quantity) || 0;
    return qty * currentPrice;
  };

  const handleBuy = async () => {
    if (!quantity || parseFloat(quantity) <= 0) return;

    const qty = parseFloat(quantity);
    const total = qty * currentPrice;

    if (total > balance) return;

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
    if (!quantity || parseFloat(quantity) <= 0) return;

    const qty = parseFloat(quantity);

    if (!currentHolding || qty > currentHolding.quantity) return;

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
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-10 h-10 mx-auto mb-4 rounded-md bg-secondary/60 border border-border/60 flex items-center justify-center">
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-foreground mb-1">Authentication required</h3>
          <p className="text-xs text-muted-foreground mb-5">Sign in to start trading</p>
          <a href="/auth/login">
            <Button variant="primary" size="sm">Sign in</Button>
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Trade {symbol}
          </CardTitle>
          <Badge variant={type === 'CRYPTO' ? 'primary' : 'muted'}>
            {type === 'CRYPTO' ? 'Crypto' : 'Stock'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Buy/Sell Tabs */}
        <div className="flex p-0.5 bg-secondary rounded-md gap-0.5">
          <button
            onClick={() => setActiveTab('buy')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
              activeTab === 'buy'
                ? 'bg-success/90 text-white shadow-subtle'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => setActiveTab('sell')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
              activeTab === 'sell'
                ? 'bg-error/90 text-white shadow-subtle'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Sell
          </button>
        </div>

        {/* Current Info */}
        <div className="space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="section-label">Current Price</span>
            <span className="value-mono text-sm">{formatCurrency(currentPrice)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="section-label">Available Balance</span>
            <span className="value-mono text-sm">{formatCurrency(balance)}</span>
          </div>
          {currentHolding && (
            <div className="flex justify-between items-center">
              <span className="section-label">Your Holdings</span>
              <span className="value-mono text-sm">
                {currentHolding.quantity.toFixed(8)} {symbol}
              </span>
            </div>
          )}
        </div>

        <div className="divider my-3" />

        {/* Quantity Input */}
        <div>
          <label className="block section-label mb-2">Quantity</label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              placeholder="0.00"
              className="font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={activeTab === 'buy' ? handleMaxBuy : handleMaxSell}
              className="shrink-0 text-xs"
            >
              MAX
            </Button>
          </div>
        </div>

        {/* Total */}
        <div className="p-3 bg-secondary/40 rounded-md border border-border/60">
          <div className="flex justify-between items-center">
            <span className="section-label">Estimated Total</span>
            <span className="value-large text-lg">
              {formatCurrency(calculateTotal())}
            </span>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-3 bg-error-muted border border-error/20 rounded-md text-xs text-error">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="p-3 bg-success-muted border border-success/20 rounded-md text-xs text-success">
            {successMessage}
          </div>
        )}

        {/* Action Button */}
        {activeTab === 'buy' ? (
          <Button
            variant="success"
            size="lg"
            onClick={handleBuy}
            disabled={loading || !quantity || parseFloat(quantity) <= 0 || calculateTotal() > balance}
            className="w-full"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              `Buy ${symbol}`
            )}
          </Button>
        ) : (
          <Button
            variant="danger"
            size="lg"
            onClick={handleSell}
            disabled={
              loading ||
              !quantity ||
              parseFloat(quantity) <= 0 ||
              !currentHolding ||
              parseFloat(quantity) > currentHolding.quantity
            }
            className="w-full"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              `Sell ${symbol}`
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
