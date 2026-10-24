"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";

/**
 * Crypto Fear & Greed index card (Phase C advanced features).
 *
 * Data comes from /api/fear-greed (alternative.me — provider-computed index,
 * real data, no key). FinScope does NOT recalculate the index; the card labels
 * the source and asset class explicitly. The gauge band colors follow the
 * provider's own five-level classification scale.
 */

interface FearGreedPoint {
  value: number;
  classification: string;
  timestamp: number;
}

interface FearGreedResponse {
  current: FearGreedPoint;
  series: FearGreedPoint[];
  meta: {
    provider: string;
    assetClass: string;
    computedBy: string;
    stale?: boolean;
  };
}

/** Provider's five-level scale, used for the gauge colors. */
function bandFor(value: number): { label: string; className: string; barBg: string } {
  if (value <= 24) return { label: "Extreme Fear", className: "text-error", barBg: "bg-error" };
  if (value <= 44) return { label: "Fear", className: "text-error/80", barBg: "bg-error/60" };
  if (value <= 55) return { label: "Neutral", className: "text-warning", barBg: "bg-warning" };
  if (value <= 74) return { label: "Greed", className: "text-success/80", barBg: "bg-success/60" };
  return { label: "Extreme Greed", className: "text-success", barBg: "bg-success" };
}

export default function FearGreedCard() {
  const [data, setData] = useState<FearGreedResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/fear-greed");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Index unavailable");
        return;
      }
      setData(await response.json());
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const band = data ? bandFor(data.current.value) : null;

  // 30-day stats from the provider series (oldest → newest for the sparkline).
  const stats = (() => {
    if (!data || data.series.length === 0) return null;
    const values = data.series.map((p) => p.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg,
      oldest: data.series[data.series.length - 1],
    };
  })();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Crypto Fear &amp; Greed
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
            <div className="h-8 w-20 bg-secondary rounded" />
            <div className="h-2 w-full bg-secondary rounded" />
            <div className="h-3 w-32 bg-secondary rounded" />
          </div>
        ) : error || !data || !band ? (
          <div className="text-center py-6">
            <p className="text-xs text-error mb-3">{error || "No data"}</p>
            <button
              onClick={load}
              className="text-xs text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold text-foreground font-mono">
                {data.current.value}
              </span>
              <span className={`text-sm font-medium ${band.className}`}>
                {band.label}
              </span>
            </div>

            {/* Gauge: position marker on the provider's 0–100 scale */}
            <div className="mt-4">
              <div className="relative h-2 rounded-full overflow-hidden bg-secondary">
                <div className="absolute inset-0 flex">
                  <div className="w-1/4 bg-error" />
                  <div className="w-1/5 bg-error/50" />
                  <div className="w-2/25 bg-warning" />
                  <div className="w-1/5 bg-success/50" />
                  <div className="w-3/20 bg-success" />
                </div>
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-background shadow"
                  style={{ left: `${data.current.value}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                <span>0 · Extreme Fear</span>
                <span>100 · Extreme Greed</span>
              </div>
            </div>

            {stats && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">30d low</div>
                  <div className="text-sm font-medium text-foreground font-mono">
                    {stats.min}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">30d avg</div>
                  <div className="text-sm font-medium text-foreground font-mono">
                    {Math.round(stats.avg)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">30d high</div>
                  <div className="text-sm font-medium text-foreground font-mono">
                    {stats.max}
                  </div>
                </div>
              </div>
            )}

            <p className="mt-3 text-[10px] text-muted-foreground">
              Crypto market sentiment · source: {data.meta.provider}{" "}
              (provider-computed, not calculated by FinScope)
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
