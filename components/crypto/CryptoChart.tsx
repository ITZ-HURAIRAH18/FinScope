"use client";

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi } from 'lightweight-charts';

interface CryptoChartProps {
  symbol: string;
}

type Timeframe = '1s' | '1m' | '5m' | '15m' | '1h' | '1d';

export default function CryptoChart({ symbol }: CryptoChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.1)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const newSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Binance API expects uppercase symbol and 'USDT' suffix for most pairs
        const pair = `${symbol.toUpperCase()}USDT`;
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${timeframe}&limit=300`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch chart data');
        }

        const data = await response.json();
        
        // Transform Binance data [time, open, high, low, close, volume, ...]
        // to lightweight-charts format { time, open, high, low, close }
        const candleData = data.map((d: any) => ({
          time: d[0] / 1000, // Convert ms to seconds
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));

        newSeries.setData(candleData);
      } catch (err) {
        console.error('Error fetching chart data:', err);
        setError('Failed to load chart data. Make sure the pair exists on Binance.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol, timeframe]);

  return (
    <div className="glass-card p-6 rounded-2xl mb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Price Chart</h2>
        <div className="flex space-x-2 bg-white/5 rounded-lg p-1">
          {(['1s', '1m', '5m', '15m', '1h', '1d'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition ${
                timeframe === tf
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[400px] w-full">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 backdrop-blur-sm rounded-lg">
            <div className="text-blue-400 animate-pulse">Loading chart data...</div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 backdrop-blur-sm rounded-lg">
            <div className="text-red-400">{error}</div>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
