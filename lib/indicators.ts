/**
 * Technical analysis indicators — pure functions over price series.
 *
 * Methodology notes (all computed from REAL close prices supplied by the
 * caller; this module never fetches data itself):
 *
 * - SMA(n): arithmetic mean of the last n closes. Output array is aligned
 *   with the input (nulls for the first n-1 points — no warm-up data).
 * - EMA(n): exponential moving average with multiplier 2/(n+1), seeded with
 *   the SMA of the first n closes (standard seed; avoids the arbitrary
 *   "first value" seed that skews early outputs).
 * - RSI(n): Wilder's RSI — average gain/loss over n periods with Wilder
 *   smoothing (alpha = 1/n) after the initial SMA seed. RSI = 100 − 100/(1+RS).
 *   Values ∈ [0, 100]; >70 conventionally "overbought", <30 "oversold"
 *   (convention only — not a trading signal).
 * - MACD(fast,slow,signal): EMA(fast) − EMA(slow); the signal line is
 *   EMA(signal) of the MACD series; histogram = MACD − signal.
 * - Bollinger(n,k): SMA(n) ± k·σ where σ is the population standard
 *   deviation of the last n closes.
 * - VWAP: cumulative (typical price × volume) / cumulative volume from the
 *   start of the provided series (session anchor is the caller's choice).
 *
 * Every function is null-safe: non-finite inputs are skipped and short
 * series return nulls/empty results rather than throwing.
 */

export type Series = readonly number[];

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Simple moving average, aligned to `closes`; null until n points exist. */
export function sma(closes: Series, n: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (!Number.isInteger(n) || n <= 0) return out;

  let sum = 0;
  let count = 0;
  // Sliding window sum over the last n closes; a non-finite value resets
  // the window (the next n−1 outputs are null until it refills).
  for (let i = 0; i < closes.length; i++) {
    const v = closes[i];
    if (!isFiniteNum(v)) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count++;
    if (count > n) {
      // Evict the value leaving the window — guaranteed finite because the
      // window would have reset at any hole.
      sum -= closes[i - n] as number;
      count = n;
    }
    if (count === n) out[i] = sum / n;
  }
  return out;
}

/**
 * Exponential moving average. Seeded with the SMA of the first n valid
 * closes; aligned to `closes` with nulls during warm-up.
 */
export function ema(closes: Series, n: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (!Number.isInteger(n) || n <= 0 || closes.length < n) return out;

  const multiplier = 2 / (n + 1);

  // Seed = SMA of first n closes.
  let seedSum = 0;
  let seedCount = 0;
  let seedEnd = -1;
  for (let i = 0; i < closes.length && seedCount < n; i++) {
    const v = closes[i];
    if (!isFiniteNum(v)) continue;
    seedSum += v;
    seedCount++;
    seedEnd = i;
  }
  if (seedCount < n) return out;

  let prev = seedSum / n;
  out[seedEnd] = prev;

  for (let i = seedEnd + 1; i < closes.length; i++) {
    const v = closes[i];
    if (!isFiniteNum(v)) {
      out[i] = prev; // carry forward over holes
      continue;
    }
    prev = v * multiplier + prev * (1 - multiplier);
    out[i] = prev;
  }
  return out;
}

export interface RsiResult {
  /** RSI values aligned to the input; nulls during warm-up. */
  rsi: (number | null)[];
}

/** Wilder's RSI (see module docs for smoothing details). */
export function rsi(closes: Series, n = 14): RsiResult {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (!Number.isInteger(n) || n <= 0 || closes.length <= n) return { rsi: out };

  let avgGain = 0;
  let avgLoss = 0;
  let initialized = false;
  let prev: number | null = null;

  for (let i = 0; i < closes.length; i++) {
    const v = closes[i];
    if (!isFiniteNum(v)) continue;

    if (prev === null) {
      prev = v;
      continue;
    }

    const change = v - prev;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    prev = v;

    if (!initialized) {
      avgGain += gain;
      avgLoss += loss;
      // First RSI point needs n changes after the seed close.
      if (i === n) {
        avgGain /= n;
        avgLoss /= n;
        initialized = true;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
      continue;
    }

    // Wilder smoothing: avg = (prevAvg·(n−1) + current) / n
    avgGain = (avgGain * (n - 1) + gain) / n;
    avgLoss = (avgLoss * (n - 1) + loss) / n;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return { rsi: out };
}

export interface MacdResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

/** MACD line, signal line and histogram (see module docs). */
export function macd(
  closes: Series,
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MacdResult {
  const empty: (number | null)[] = new Array(closes.length).fill(null);

  if (!Number.isInteger(fast) || !Number.isInteger(slow) || !Number.isInteger(signalPeriod)) {
    return { macd: empty, signal: empty.slice(), histogram: empty.slice() };
  }
  if (fast <= 0 || slow <= 0 || signalPeriod <= 0 || fast >= slow) {
    return { macd: empty, signal: empty.slice(), histogram: empty.slice() };
  }

  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);

  const macdLine: (number | null)[] = closes.map((_, i) =>
    fastEma[i] !== null && slowEma[i] !== null
      ? (fastEma[i] as number) - (slowEma[i] as number)
      : null
  );

  // Signal = EMA(signalPeriod) over the MACD line's valid segment.
  const firstValid = macdLine.findIndex((v) => v !== null);
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  if (firstValid !== -1) {
    const segment = macdLine.slice(firstValid) as number[];
    const segmentEma = ema(segment, signalPeriod);
    for (let i = 0; i < segmentEma.length; i++) {
      signal[firstValid + i] = segmentEma[i];
    }
  }

  const histogram: (number | null)[] = macdLine.map((v, i) =>
    v !== null && signal[i] !== null ? v - (signal[i] as number) : null
  );

  return { macd: macdLine, signal, histogram };
}

export interface BollingerResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  /** Bandwidth = (upper − lower) / middle, as a fraction. */
  bandwidth: (number | null)[];
}

/** Bollinger Bands with population standard deviation. */
export function bollinger(closes: Series, n = 20, k = 2): BollingerResult {
  const length = closes.length;
  const upper: (number | null)[] = new Array(length).fill(null);
  const middle = sma(closes, n);
  const lower: (number | null)[] = new Array(length).fill(null);
  const bandwidth: (number | null)[] = new Array(length).fill(null);

  if (!Number.isInteger(n) || n <= 0 || !Number.isFinite(k)) {
    return { upper, middle, lower, bandwidth };
  }

  for (let i = n - 1; i < length; i++) {
    const window = closes.slice(i - n + 1, i + 1);
    if (!window.every(isFiniteNum)) continue;
    const mean = middle[i] as number;
    const variance =
      window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n; // population σ
    const sd = Math.sqrt(variance);
    const upperVal = mean + k * sd;
    const lowerVal = mean - k * sd;
    upper[i] = upperVal;
    lower[i] = lowerVal;
    bandwidth[i] = mean !== 0 ? (upperVal - lowerVal) / mean : null;
  }

  return { upper, middle, lower, bandwidth };
}

export interface VwapResult {
  vwap: (number | null)[];
}

/**
 * Volume-weighted average price over the provided series.
 * Uses the typical price (H+L+C)/3 when high/low are supplied, else close.
 * Cumulative from index 0 — the caller chooses the session anchor by slicing.
 */
export function vwap(
  closes: Series,
  volumes: Series,
  highs?: Series,
  lows?: Series
): VwapResult {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let cumPV = 0;
  let cumV = 0;

  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    const v = volumes[i];
    if (!isFiniteNum(c) || !isFiniteNum(v) || v <= 0) {
      out[i] = cumV > 0 ? cumPV / cumV : null;
      continue;
    }
    const h = highs?.[i];
    const l = lows?.[i];
    const price = isFiniteNum(h) && isFiniteNum(l) ? (h + l + c) / 3 : c;
    cumPV += price * v;
    cumV += v;
    out[i] = cumPV / cumV;
  }

  return { vwap: out };
}

/** Latest non-null value of an indicator series, or null. */
export function last<T>(series: readonly (T | null)[]): T | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/**
 * Percentage change between the last two valid values of a series
 * (e.g. MACD histogram momentum). Returns null when fewer than two valid
 * points exist or the previous value is 0.
 */
export function pctChange(series: Series): number | null {
  let prev: number | null = null;
  let current: number | null = null;
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (!isFiniteNum(v)) continue;
    if (current === null) {
      current = v;
      continue;
    }
    prev = v;
    break;
  }
  if (current === null || prev === null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}
