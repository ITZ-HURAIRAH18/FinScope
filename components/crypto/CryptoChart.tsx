"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { Card, CardContent, CardHeader } from '@/components/ui';
import { AlertCircle } from 'lucide-react';

interface CryptoChartProps {
  symbol: string;
}

type Timeframe = '1s' | '1m' | '5m' | '15m' | '1h' | '1d';

// Helper to read CSS variables and convert to hex format
// lightweight-charts doesn't support modern space-separated HSL syntax
function getCSSColor(variableName: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  
  // If it's already in modern HSL format with spaces, convert to hex
  if (value.startsWith('hsl(') || value.startsWith('hsla(')) {
    return hslToHex(value);
  }
  
  // If it's just numbers (TailCSS CSS variable format like "0 0% 52%"), wrap and convert
  if (/^\d/.test(value)) {
    return hslToHex(`hsl(${value})`);
  }
  
  return value;
}

// Convert HSL/HSLA to hex color
function hslToHex(hsl: string): string {
  // Remove hsl()/hsla() wrapper
  const inner = hsl.replace(/hsla?\(/, '').replace(/\)/, '');
  
  // Parse values - handle both comma and space separated formats
  const parts = inner.split(/[,\s]+/).filter(Boolean);
  const h = parseInt(parts[0]) / 360;
  const s = parseInt(parts[1]) / 100;
  const l = parseInt(parts[2]) / 100;
  const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;

  // HSL to RGB conversion
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  
  // Include alpha if present
  if (a < 1) {
    const alpha = Math.round(a * 255).toString(16).padStart(2, '0');
    return `${hex}${alpha}`;
  }
  
  return hex;
}

export default function CryptoChart({ symbol }: CryptoChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateChartTheme = useCallback(() => {
    if (!chartRef.current) return;
    
    try {
      chartRef.current.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: getCSSColor('--card') },
          textColor: getCSSColor('--muted-foreground'),
        },
        grid: {
          vertLines: { color: getCSSColor('--border') + '4D' },
          horzLines: { color: getCSSColor('--border') + '4D' },
        },
        timeScale: {
          borderColor: getCSSColor('--border'),
        },
        rightPriceScale: {
          borderColor: getCSSColor('--border'),
        },
      });
    } catch (err) {
      console.warn('[Chart] Theme update failed:', err);
    }
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize chart with autoSize
    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: getCSSColor('--card') },
        textColor: getCSSColor('--muted-foreground'),
        fontSize: 12,
      },
      grid: {
        vertLines: { color: getCSSColor('--border') + '4D' },
        horzLines: { color: getCSSColor('--border') + '4D' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: timeframe === '1s' || timeframe === '1m',
        borderColor: getCSSColor('--border'),
      },
      rightPriceScale: {
        borderColor: getCSSColor('--border'),
      },
      watermark: {
        visible: false,
      },
      crosshair: {
        mode: 1,
      },
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: getCSSColor('--success'),
      downColor: getCSSColor('--error'),
      borderVisible: false,
      wickUpColor: getCSSColor('--success'),
      wickDownColor: getCSSColor('--error'),
    });
    seriesRef.current = candleSeries;

    // Volume series
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeriesRef.current = volumeSeries;

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.85,
        bottom: 0,
      },
    });

    // Observe theme changes
    const themeObserver = new MutationObserver(() => {
      updateChartTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    console.log('[Chart] Initialized for', symbol, 'container:', chartContainerRef.current?.getBoundingClientRect());

    return () => {
      themeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [timeframe]);

  // Fetch data effect
  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const pair = `${symbol.toUpperCase()}USDT`;
        const response = await fetch(
          `/api/crypto-chart?symbol=${pair}&interval=${timeframe}&limit=300`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch chart data (${response.status})`);
        }

        const data = await response.json();
        console.log('[Chart] API response:', data?.length ?? 'no data', 'records');

        const candleData = data.map((d: any) => ({
          time: d[0] / 1000,
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
          volume: parseFloat(d[5]),
        }));

        // Set candlestick data
        seriesRef.current?.setData(candleData);

        // Set volume data
        const volumeData = candleData.map((candle: any) => ({
          time: candle.time,
          value: candle.volume,
          color: candle.close >= candle.open
            ? getCSSColor('--success') + '4D'
            : getCSSColor('--error') + '4D',
        }));
        volumeSeriesRef.current?.setData(volumeData);
      } catch (err: any) {
        console.error('Error fetching chart data:', err);
        setError(`Failed to load chart: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    // Small delay to ensure chart series are fully initialized
    const timeout = setTimeout(fetchData, 50);
    return () => clearTimeout(timeout);
  }, [symbol, timeframe]);

  const timeframes: Timeframe[] = ['1s', '1m', '5m', '15m', '1h', '1d'];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Price Chart</h3>
            {isLoading && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span>Updating...</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1 p-0.5 bg-secondary rounded-md">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded-sm text-xs font-medium transition-all duration-150 hover:scale-105 ${
                  timeframe === tf
                    ? 'bg-card text-foreground shadow-subtle'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[300px] sm:h-[400px] lg:h-[500px] w-full rounded-b-lg overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-[2px] z-10">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Loading chart...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-[2px] z-10">
              <div className="text-center max-w-md px-4">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-error" />
                <p className="text-sm text-error font-medium mb-1">Chart Error</p>
                <p className="text-xs text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          <div ref={chartContainerRef} className="w-full h-full" />
        </div>
      </CardContent>
    </Card>
  );
}
