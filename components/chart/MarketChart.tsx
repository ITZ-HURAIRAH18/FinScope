"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from 'lightweight-charts';
import { Card, CardContent, CardHeader, Button } from '@/components/ui';
import { getCSSColor } from '@/lib/chart-theme';
import { AlertCircle, BarChart3, CandlestickChart, LineChart } from 'lucide-react';

/**
 * Unified market chart (docs/AUDIT-REPORT.md §8 target architecture).
 *
 * Replaces the two near-identical CryptoChart/StockChart implementations.
 * Behavioural guarantees:
 * - Volumes bars are rendered ONLY from real provider volume; when a provider
 *   can't supply volume (audit finding C1) the pane is hidden and the chart
 *   says so instead of drawing fabricated data.
 * - Every chart labels its actual candle interval, data source, fetch time and
 *   staleness (findings H5/H6).
 * - Candlestick/line toggle, honest timeframe buttons, crosshair OHLC legend,
 *   wheel/pinch zoom (built into lightweight-charts).
 */

export interface ChartCandle {
  /** Unix seconds */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** null = provider did not supply volume for this candle */
  volume: number | null;
}

export interface ChartMeta {
  source: string;
  fetchedAt: string;
  stale: boolean;
  rangeLabel: string;
  /** Actual spacing between candles in seconds (derived from the data). */
  candleIntervalSec: number | null;
  volumeAvailable: boolean;
}

export interface ChartRange {
  key: string;
  label: string;
}

interface MarketChartProps {
  title?: string;
  ranges: ChartRange[];
  activeRange: string;
  onRangeChange: (key: string) => void;
  candles: ChartCandle[] | null;
  meta: ChartMeta | null;
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

type ChartType = 'candles' | 'line';

function formatInterval(seconds: number | null): string {
  if (!seconds) return 'interval n/a';
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function timeAgo(iso: string): string {
  const delta = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.round(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export default function MarketChart({
  title = 'Price Chart',
  ranges,
  activeRange,
  onRangeChange,
  candles,
  meta,
  isLoading,
  error,
  onRetry,
}: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  const [chartType, setChartType] = useState<ChartType>('candles');

  const updateTheme = useCallback(() => {
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
        timeScale: { borderColor: getCSSColor('--border') },
        rightPriceScale: { borderColor: getCSSColor('--border') },
      });
      const up = getCSSColor('--success');
      const down = getCSSColor('--error');
      candleSeriesRef.current?.applyOptions({
        upColor: up,
        downColor: down,
        borderVisible: false,
        wickUpColor: up,
        wickDownColor: down,
      });
      lineSeriesRef.current?.applyOptions({ color: getCSSColor('--primary') });
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.applyOptions({
          priceFormat: { type: 'volume' },
        });
      }
    } catch (err) {
      console.warn('[MarketChart] Theme update failed:', err);
    }
  }, []);

  // Chart lifecycle — recreated when the chart type changes.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
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
        secondsVisible: false,
        borderColor: getCSSColor('--border'),
      },
      rightPriceScale: { borderColor: getCSSColor('--border') },
      watermark: { visible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    if (chartType === 'candles') {
      candleSeriesRef.current = chart.addCandlestickSeries({
        upColor: getCSSColor('--success'),
        downColor: getCSSColor('--error'),
        borderVisible: false,
        wickUpColor: getCSSColor('--success'),
        wickDownColor: getCSSColor('--error'),
      });
      lineSeriesRef.current = null;
    } else {
      lineSeriesRef.current = chart.addLineSeries({
        color: getCSSColor('--primary'),
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      candleSeriesRef.current = null;
    }

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    volumeSeriesRef.current = volumeSeries;
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const themeObserver = new MutationObserver(() => updateTheme());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    return () => {
      themeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      lineSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [chartType, updateTheme]);

  // Push data into whichever series is active.
  useEffect(() => {
    if (!candles) return;
    const sorted = [...candles].sort((a, b) => a.time - b.time);

    const asTime = (t: number) => t as UTCTimestamp;

    if (candleSeriesRef.current) {
      candleSeriesRef.current.setData(
        sorted.map((c) => ({
          time: asTime(c.time),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    }
    if (lineSeriesRef.current) {
      lineSeriesRef.current.setData(
        sorted.map((c) => ({ time: asTime(c.time), value: c.close }))
      );
    }

    const volumeSeries = volumeSeriesRef.current;
    if (volumeSeries) {
      const hasVolume = sorted.some((c) => c.volume !== null && c.volume > 0);
      volumeSeries.applyOptions({ visible: hasVolume });
      if (hasVolume) {
        volumeSeries.setData(
          sorted
            .filter((c) => c.volume !== null)
            .map((c) => ({
              time: asTime(c.time),
              value: c.volume as number,
              color:
                c.close >= c.open
                  ? getCSSColor('--success') + '4D'
                  : getCSSColor('--error') + '4D',
            }))
        );
      }
    }
  }, [candles, chartType]);

  // Crosshair OHLC legend (updates DOM directly — no re-render per pixel move).
  const handlerRef = useRef<((param: any) => void) | null>(null);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const formatPrice = (v: number | undefined) =>
      v === undefined ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: v < 1 ? 6 : 2 });

    const handler = (param: any) => {
      const legend = legendRef.current;
      if (!legend) return;
      const rect = containerRef.current?.getBoundingClientRect();
      const outside =
        !param.time ||
        !param.point ||
        (rect &&
          (param.point.x < 0 ||
            param.point.y < 0 ||
            param.point.x > rect.width ||
            param.point.y > rect.height));
      if (outside) {
        // Outside the plot — restore the last candle readout.
        const last = candles?.[candles.length - 1];
        legend.dataset.state = 'idle';
        legend.textContent = last
          ? `Last  O ${formatPrice(last.open)}  H ${formatPrice(last.high)}  L ${formatPrice(last.low)}  C ${formatPrice(last.close)}`
          : '';
        return;
      }

      const series = candleSeriesRef.current ?? lineSeriesRef.current;
      if (!series) return;
      const data = param.seriesData.get(series) as
        | { open?: number; high?: number; low?: number; close?: number; value?: number }
        | undefined;
      if (!data) return;

      legend.dataset.state = 'active';
      if (data.open !== undefined) {
        const chg =
          data.open !== 0 ? (((data.close ?? 0) - data.open) / data.open) * 100 : 0;
        legend.textContent = `O ${formatPrice(data.open)}  H ${formatPrice(data.high)}  L ${formatPrice(data.low)}  C ${formatPrice(data.close)}  ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
      } else {
        legend.textContent = `Close ${formatPrice(data.value)}`;
      }
    };

    handlerRef.current = handler;
    chart.subscribeCrosshairMove(handler);

    return () => {
      try {
        chart.unsubscribeCrosshairMove(handler);
      } catch {
        // chart may already be disposed on type switch
      }
    };
  }, [candles, chartType]);

  const hasData = !!candles && candles.length > 0;
  const showVolumeNote = hasData && meta && !meta.volumeAvailable;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            {isLoading && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Updating…
              </span>
            )}
            {meta?.stale && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30"
                title="Provider is rate-limited; showing last successfully fetched data."
              >
                STALE DATA
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Chart type toggle */}
            <div className="flex p-0.5 bg-secondary rounded-md" role="group" aria-label="Chart type">
              <button
                onClick={() => setChartType('candles')}
                aria-pressed={chartType === 'candles'}
                className={`px-2 py-1 rounded-sm transition-colors duration-150 ${
                  chartType === 'candles'
                    ? 'bg-card text-foreground shadow-subtle'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Candlestick"
              >
                <CandlestickChart className="w-3.5 h-3.5" />
                <span className="sr-only">Candlestick chart</span>
              </button>
              <button
                onClick={() => setChartType('line')}
                aria-pressed={chartType === 'line'}
                className={`px-2 py-1 rounded-sm transition-colors duration-150 ${
                  chartType === 'line'
                    ? 'bg-card text-foreground shadow-subtle'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Line"
              >
                <LineChart className="w-3.5 h-3.5" />
                <span className="sr-only">Line chart</span>
              </button>
            </div>

            {/* Timeframes */}
            <div className="flex flex-wrap gap-1 p-0.5 bg-secondary rounded-md" role="group" aria-label="Timeframe">
              {ranges.map((range) => (
                <button
                  key={range.key}
                  onClick={() => onRangeChange(range.key)}
                  aria-pressed={activeRange === range.key}
                  className={`px-2.5 py-1 rounded-sm text-xs font-medium transition-colors duration-150 ${
                    activeRange === range.key
                      ? 'bg-card text-foreground shadow-subtle'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Legend + honest data provenance line */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pb-2 text-[11px] text-muted-foreground">
          <div
            ref={legendRef}
            className="font-mono truncate"
            aria-live="off"
          />
          {meta && (
            <div className="flex items-center gap-2 shrink-0">
              <span>{meta.source}</span>
              <span aria-hidden="true">·</span>
              <span>{formatInterval(meta.candleIntervalSec)} candles</span>
              <span aria-hidden="true">·</span>
              <span>{meta.rangeLabel}</span>
              <span aria-hidden="true">·</span>
              <span title={new Date(meta.fetchedAt).toLocaleString()}>
                updated {timeAgo(meta.fetchedAt)}
              </span>
              {!meta.volumeAvailable && (
                <span className="text-warning/80" title="The provider did not supply real volume for this range, so no volume bars are drawn.">
                  no volume data
                </span>
              )}
            </div>
          )}
        </div>

        <div className="relative h-[300px] sm:h-[400px] lg:h-[500px] w-full rounded-b-lg overflow-hidden">
          {isLoading && !hasData && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/70 z-10">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Loading chart…
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/85 z-10">
              <div className="text-center max-w-md px-4">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-error" />
                <p className="text-sm text-error font-medium mb-1">Chart unavailable</p>
                <p className="text-xs text-muted-foreground mb-3">{error}</p>
                {onRetry && (
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    Retry
                  </Button>
                )}
              </div>
            </div>
          )}

          {!isLoading && !error && !hasData && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center px-4">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No chart data available for this range.</p>
              </div>
            </div>
          )}

          <div ref={containerRef} className="w-full h-full" />
        </div>

        {showVolumeNote && (
          <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/60">
            Volume bars are hidden: the data provider did not return real volume for this
            range (FinScope never fabricates market data).
          </div>
        )}
      </CardContent>
    </Card>
  );
}
