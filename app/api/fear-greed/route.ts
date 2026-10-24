import { NextResponse } from 'next/server';

/**
 * Crypto Fear & Greed Index (docs/AUDIT-REPORT.md — Phase C advanced features).
 *
 * Source: https://alternative.me/crypto/fear-and-greed-index/ — a free public
 * API with no key required. This is REAL provider data, not calculated by
 * FinScope: the underlying index is computed by alternative.me from volatility,
 * market momentum, volume, social media, dominance and trends.
 *
 * Honesty notes:
 * - This index is CRYPTO-SPECIFIC. There is no equivalent free, keyless stock
 *   market Fear & Greed feed (CNN's is proprietary and unofficial), so we do
 *   not fabricate one — the UI labels the asset class explicitly.
 * - 30-day history is requested so the UI can show a trend, not just a point.
 */

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const HISTORY_DAYS = 30;

let cache: { data: unknown; timestamp: number } | null = null;

interface FearGreedPoint {
  value: number;
  classification: string;
  /** Unix seconds from the provider. */
  timestamp: number;
}

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION) {
    return NextResponse.json(cache.data);
  }

  try {
    const response = await fetch(
      `https://api.alternative.me/fng/?limit=${HISTORY_DAYS}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Fear & Greed API error: ${response.status}`);
    }

    const json = await response.json();
    const raw: any[] = Array.isArray(json?.data) ? json.data : [];

    const series: FearGreedPoint[] = raw
      .map((d) => ({
        value: Number(d.value),
        classification: String(d.value_classification ?? ''),
        timestamp: Number(d.timestamp),
      }))
      .filter((d) => Number.isFinite(d.value) && d.value >= 0 && d.value <= 100);

    if (series.length === 0) {
      throw new Error('Fear & Greed API returned no usable points');
    }

    const current = series[0];
    const result = {
      current: {
        value: current.value,
        classification: current.classification,
        timestamp: current.timestamp,
      },
      series, // newest → oldest, as the provider returns
      meta: {
        provider: 'alternative.me',
        assetClass: 'crypto' as const,
        // Make it unmistakable that this is provider-computed, not FinScope-
        // calculated (the audit forbids blurring the two).
        computedBy: 'provider',
        cachedAt: new Date().toISOString(),
      },
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);
  } catch (error) {
    console.error('[FearGreed] fetch failed:', error);
    // Degrade to last-known-good data when the provider is down.
    if (cache) {
      return NextResponse.json({
        ...(cache.data as object),
        meta: {
          ...((cache.data as any)?.meta ?? {}),
          stale: true,
        },
      });
    }
    return NextResponse.json(
      { error: 'Fear & Greed index unavailable' },
      { status: 503 }
    );
  }
}
