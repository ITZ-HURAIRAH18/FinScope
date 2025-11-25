"use client";

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi } from 'lightweight-charts';

interface StockChartProps {
  symbol: string;
}

type Timeframe = '1s' | '1m' | '5m' | '15m' | '1h' | '1d';

export default function StockChart({ symbol }: StockChartProps) {
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
      watermark: {
        visible: false,
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
        // Map timeframe to Yahoo Finance interval
        const intervalMap: Record<Timeframe, string> = {
          '1s': '1m', // Yahoo doesn't support 1s, use 1m
          '1m': '1m',
          '5m': '5m',
          '15m': '15m',
          '1h': '1h',
          '1d': '1d',
        };
        
        const interval = intervalMap[timeframe];
        
        // Calculate date range for exactly 200 candles
        const now = Math.floor(Date.now() / 1000);
        const secondsPerCandle =
          interval === '1m' ? 60
          : interval === '5m' ? 300
          : interval === '15m' ? 900
          : interval === '1h' ? 3600
          : interval === '1d' ? 86400
          : 60;
        
        // Request more time to ensure we get 200 candles (accounting for market closures)
        // Markets are closed on weekends and after-hours, so we need to request extra time
        const multiplier = 
          interval === '1m' ? 10    // 1 minute: 10x to account for after-hours/weekends
          : interval === '5m' ? 10  // 5 minutes: 10x
          : interval === '15m' ? 8  // 15 minutes: 8x
          : interval === '1h' ? 5   // 1 hour: 5x
          : interval === '1d' ? 2   // 1 day: 2x (fewer gaps)
          : 10;
        
        const period1 = now - (secondsPerCandle * 200 * multiplier);
        const period2 = now;
        
        // Use local API proxy to avoid CORS issues
        const response = await fetch(
          `/api/stock-chart?symbol=${symbol}&interval=${interval}&period1=${period1}&period2=${period2}`
        );
        
        if (!response.ok) {
          throw new Error(`Failed to fetch stock chart data (${response.status})`);
        }
        
        const data = await response.json();
        
        if (!data?.chart?.result?.[0]) {
          throw new Error('No data available for this symbol');
        }
        
        const result = data.chart.result[0];
        const timestamps = result.timestamp;
        const quote = result.indicators.quote[0];
        
        if (!timestamps || !quote) {
          throw new Error('Invalid data format');
        }
        
        // Transform to lightweight-charts format
        const candleData = timestamps.map((t: number, i: number) => ({
          time: t,
          open: quote.open[i] ?? 0,
          high: quote.high[i] ?? 0,
          low: quote.low[i] ?? 0,
          close: quote.close[i] ?? 0,
        })).filter((candle: any) => 
          candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0
        );
        
       // Always force exactly 200 candles
const fixedCandles = candleData.slice(-200);

newSeries.setData(fixedCandles);

      } catch (err: any) {
        console.error('Error fetching stock chart data:', err);
        setError(`Failed to load chart data: ${err.message}`);
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
                timeframe === tf ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
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
