"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { rsi, sma, macd, bollinger, last } from "@/lib/indicators";

/**
 * Technical insights panel for the crypto detail page (Phase C).
 *
 * Data provenance (audit: never blur calculated vs provider data):
 * - Candles: REAL OHLC from CoinGecko via /api/crypto-chart (provider data).
 * - Indicator values: CALCULATED by FinScope from those closes using
 *   lib/indicators.ts (formulas documented there and covered by unit tests).
 * - The card labels each line accordingly and states the methodology
 *   (Wilder RSI-14, SMA-20, MACD 12/26/9, Bollinger 20±2σ).
 *
 * This is descriptive analysis of past prices, NOT a trading signal.
 */

interface InsightsResponse {
  candles: [number, number, number, number, number, number | null][];
  meta: {
    source: string;
    rangeDays: string;
    candleIntervalSec: number | null;
    stale?: boolean;
  };
}

interface InsightRow {
  label: string;
  value: string | null;
  detail: string;
  tone: "neutral" | "positive" | "negative" | "muted";
}

function toneForRsi(v: number): InsightRow["tone"] {
  if (v >= 70) return "negative"; // overbought convention
  if (v <= 30) return "positive"; // oversold convention
  return "neutral";
}

export default function TechnicalInsights({ symbol }: { symbol: string }) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // 90 days gives the slow indicators (SMA-20 on the candle grid) enough
      // history to be meaningful without over-fetching.
      const response = await fetch(
        `/api/crypto-chart?symbol=${encodeURIComponent(symbol)}&range=90D`
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Chart data unavailable");
        return;
      }
      setData(await response.json());
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    load();
  }, [load]);

  const rows: InsightRow[] | null = (() => {
    if (!data || data.candles.length < 30) return null;
    const closes = data.candles.map((c) => c[4]);

    const rsiValue = last(rsi(closes, 14).rsi);
    const smaValue = last(sma(closes, 20));
    const macdResult = macd(closes, 12, 26, 9);
    const macdValue = last(macdResult.macd);
    const histValue = last(macdResult.histogram);
    const bands = bollinger(closes, 20, 2);
    const upper = last(bands.upper);
    const lower = last(bands.lower);
    const price = closes[closes.length - 1];

    const fmt = (v: number | null, digits = 2): string | null =>
      v === null ? null : v.toLocaleString("en-US", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });

    const out: InsightRow[] = [];

    if (rsiValue !== null) {
      out.push({
        label: "RSI (14)",
        value: fmt(rsiValue, 1),
        detail:
          rsiValue >= 70
            ? "Above 70 — conventionally overbought"
            : rsiValue <= 30
              ? "Below 30 — conventionally oversold"
              : "Neutral band (30–70)",
        tone: toneForRsi(rsiValue),
      });
    }

    if (smaValue !== null) {
      const above = price >= smaValue;
      out.push({
        label: "SMA (20)",
        value: fmt(smaValue),
        detail: above
          ? "Price above the 20-period average"
          : "Price below the 20-period average",
        tone: above ? "positive" : "negative",
      });
    }

    if (macdValue !== null && histValue !== null) {
      out.push({
        label: "MACD (12/26/9)",
        value: fmt(macdValue),
        detail:
          histValue >= 0
            ? `Histogram positive (${fmt(histValue)}) — short-term momentum above signal`
            : `Histogram negative (${fmt(histValue)}) — short-term momentum below signal`,
        tone: histValue >= 0 ? "positive" : "negative",
      });
    }

    if (upper !== null && lower !== null) {
      const position =
        price <= lower
          ? "at/below the lower band"
          : price >= upper
            ? "at/above the upper band"
            : "inside the bands";
      out.push({
        label: "Bollinger (20, 2σ)",
        value: `${fmt(lower)} – ${fmt(upper)}`,
        detail: `Price ${position}`,
        tone: "muted",
      });
    }

    return out.length > 0 ? out : null;
  })();

  const toneClasses: Record<InsightRow["tone"], string> = {
    neutral: "text-foreground",
    positive: "text-success",
    negative: "text-error",
    muted: "text-foreground/80",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Technical Insights
          </CardTitle>
          {data?.meta.stale && (
            <Badge variant="muted" className="text-[10px]">
              cached
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="animate-pulse space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-secondary rounded" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-6">
            <p className="text-xs text-error mb-3">{error}</p>
            <button onClick={load} className="text-xs text-primary hover:underline">
              Retry
            </button>
          </div>
        ) : rows ? (
          <>
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-foreground">{row.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {row.detail}
                    </div>
                  </div>
                  <div className={`text-sm font-mono font-medium ${toneClasses[row.tone]}`}>
                    {row.value ?? "—"}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10px] text-muted-foreground leading-relaxed">
              Prices: real OHLC candles ({data?.meta.source ?? "CoinGecko"},{" "}
              {data?.meta.rangeDays ?? "90D"} range). Indicators: calculated by
              FinScope from close prices (Wilder RSI-14, SMA-20, MACD 12/26/9,
              Bollinger 20±2σ). Descriptive analysis only — not a trading signal.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-6">
            Not enough candle history to compute indicators yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
