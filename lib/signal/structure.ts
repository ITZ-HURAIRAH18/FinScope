import type { Candle } from '@/lib/market-agent';
import type { StructureSnapshot, TrendDir } from './types';

/**
 * Market structure from REAL candles — pure functions (unit-tested).
 *
 * - Swing pivots: fractal method — a bar whose high exceeds `lookback` highs
 *   on BOTH sides is a swing high (and symmetrically for lows). Only fully
 *   formed pivots count (the last `lookback` bars can't confirm one).
 * - Trend: compare the last two pivot highs and lows — HH+HL = UP,
 *   LH+LL = DOWN, mixed = RANGE, insufficient data = UNKNOWN.
 * - Support/resistance: nearest confirmed pivot low/high below/above price.
 * - BOS: most recent close beyond the latest opposing pivot (break of
 *   structure) within the loaded window; reported as BULLISH/BEARISH/null.
 */

export interface Swing {
  /** Index of the pivot bar in the candle array. */
  i: number;
  price: number;
  timeMs: number;
}

export function findSwings(
  candles: Candle[],
  lookback = 2
): { highs: Swing[]; lows: Swing[] } {
  const highs: Swing[] = [];
  const lows: Swing[] = [];
  if (candles.length < lookback * 2 + 1 || lookback < 1) return { highs, lows };

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j][2] >= candles[i][2]) isHigh = false;
      if (candles[j][3] <= candles[i][3]) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push({ i, price: candles[i][2], timeMs: candles[i][0] });
    if (isLow) lows.push({ i, price: candles[i][3], timeMs: candles[i][0] });
  }
  return { highs, lows };
}

/** Classify trend from the last two confirmed pivots of each kind. */
export function trendFromSwings(swings: { highs: Swing[]; lows: Swing[] }): TrendDir {
  const { highs, lows } = swings;
  if (highs.length < 2 || lows.length < 2) return 'UNKNOWN';

  const h1 = highs[highs.length - 1].price;
  const h0 = highs[highs.length - 2].price;
  const l1 = lows[lows.length - 1].price;
  const l0 = lows[lows.length - 2].price;

  const higherHigh = h1 > h0;
  const higherLow = l1 > l0;
  if (higherHigh && higherLow) return 'UP';
  if (!higherHigh && !higherLow) return 'DOWN';
  return 'RANGE';
}

/** Nearest swing low below price / swing high above price. */
export function nearestLevels(
  swings: { highs: Swing[]; lows: Swing[] },
  price: number
): { support: number | null; resistance: number | null } {
  let support: number | null = null;
  for (const low of swings.lows) {
    if (low.price < price && (support === null || low.price > support)) support = low.price;
  }
  let resistance: number | null = null;
  for (const high of swings.highs) {
    if (high.price > price && (resistance === null || high.price < resistance)) resistance = high.price;
  }
  return { support, resistance };
}

/**
 * Swing prices strictly above (for LONG targets) / below (SHORT) current
 * price, sorted nearest-first — used as TP anchors by levels.ts.
 */
export function targetLevels(
  swings: { highs: Swing[]; lows: Swing[] },
  price: number,
  direction: 'LONG' | 'SHORT',
  max = 4
): number[] {
  const raw =
    direction === 'LONG'
      ? swings.highs.filter((h) => h.price > price).map((h) => h.price)
      : swings.lows.filter((l) => l.price < price).map((l) => l.price);
  raw.sort((a, b) => (direction === 'LONG' ? a - b : b - a));
  return raw.slice(0, max);
}

/**
 * Latest break of structure: the most recent close beyond the latest pivot
 * that formed BEFORE it. Returns null when no such break exists in-window.
 */
export function detectBos(
  candles: Candle[],
  swings: { highs: Swing[]; lows: Swing[] }
): 'BULLISH' | 'BEARISH' | null {
  const lastHigh = swings.highs[swings.highs.length - 1];
  const lastLow = swings.lows[swings.lows.length - 1];

  let bull: { i: number } | null = null;
  let bear: { i: number } | null = null;

  if (lastHigh) {
    for (let i = lastHigh.i + 1; i < candles.length; i++) {
      if (candles[i][4] > lastHigh.price) {
        bull = { i };
        break;
      }
    }
  }
  if (lastLow) {
    for (let i = lastLow.i + 1; i < candles.length; i++) {
      if (candles[i][4] < lastLow.price) {
        bear = { i };
        break;
      }
    }
  }
  if (bull && bear) return bull.i >= bear.i ? 'BULLISH' : 'BEARISH';
  return bull ? 'BULLISH' : bear ? 'BEARISH' : null;
}

/** Convenience: everything structure-related for one timeframe. */
export function analyzeStructure(candles: Candle[]): StructureSnapshot {
  const price = candles.length ? candles[candles.length - 1][4] : 0;
  const swings = findSwings(candles);
  return {
    trend: trendFromSwings(swings),
    ...nearestLevels(swings, price),
    bos: detectBos(candles, swings),
    swingHighCount: swings.highs.length,
    swingLowCount: swings.lows.length,
  };
}
