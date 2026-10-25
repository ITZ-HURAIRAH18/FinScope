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

/** Simple moving average, aligned to `closes`; null until n points exist.
 *  Accepts nullable series (nulls reset the window, same as non-finite). */
export function sma(closes: readonly (number | null)[], n: number): (number | null)[] {
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

/* -------------------------------------------------------------------------- */
/* Phase-1 signal-engine indicators (all documented, null-safe, aligned)      */
/* -------------------------------------------------------------------------- */

/**
 * Average True Range (Wilder). TR = max(h−l, |h−prevC|, |l−prevC|);
 * first ATR = SMA of the first n TRs, then Wilder smoothing
 * (ATR = prev·(n−1)/n + TR/n). Used for stop buffers & TP spacing.
 */
export function atr(highs: Series, lows: Series, closes: Series, n = 14): (number | null)[] {
  const len = closes.length;
  const out: (number | null)[] = new Array(len).fill(null);
  if (!Number.isInteger(n) || n <= 0 || len < n + 1) return out;

  const trs: number[] = [];
  for (let i = 1; i < len; i++) {
    const h = highs[i];
    const l = lows[i];
    const pc = closes[i - 1];
    if (!isFiniteNum(h) || !isFiniteNum(l) || !isFiniteNum(pc)) {
      trs.push(0); // hole: treat as zero-range candle, smoothing continues
      continue;
    }
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // trs[j] corresponds to index j+1.

  // Seed = SMA of first n TRs.
  let seed = 0;
  for (let j = 0; j < n; j++) seed += trs[j];
  seed /= n;
  out[n] = seed;
  for (let i = n + 1; i < len; i++) {
    out[i] = ((out[i - 1] as number) * (n - 1) + trs[i - 1]) / n;
  }
  return out;
}

export interface AdxResult {
  adx: (number | null)[];
  plusDi: (number | null)[];
  minusDi: (number | null)[];
}

/**
 * Wilder's ADX: +DM/−DM direction-movement, Wilder-smoothed against TR,
 * DI± = 100·DMsmooth/TRsmooth, DX = 100·|+DI − −DI| / (+DI + −DI),
 * ADX = Wilder average of DX. Convention: ADX > 25 trending, < 20 weak.
 */
export function adx(highs: Series, lows: Series, closes: Series, n = 14): AdxResult {
  const len = closes.length;
  const adxOut: (number | null)[] = new Array(len).fill(null);
  const plusOut: (number | null)[] = new Array(len).fill(null);
  const minusOut: (number | null)[] = new Array(len).fill(null);
  const res = { adx: adxOut, plusDi: plusOut, minusDi: minusOut };
  if (!Number.isInteger(n) || n <= 0 || len < 2 * n + 2) return res;

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < len; i++) {
    const h = highs[i];
    const l = lows[i];
    const pc = closes[i - 1];
    const ph = highs[i - 1];
    const pl = lows[i - 1];
    if (![h, l, pc, ph, pl].every(isFiniteNum)) {
      plusDM.push(0);
      minusDM.push(0);
      tr.push(0);
      continue;
    }
    const up = h - ph;
    const down = pl - l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // arr[j] ↔ candle index j+1.
  const smooth = (arr: number[], from: number): number => {
    // Sum of n values ending at arr index `from` (the Wilder seed window).
    let s = 0;
    for (let j = from - n + 1; j <= from; j++) s += j >= 0 ? arr[j] : 0;
    return s;
  };

  const dxVals: { i: number; dx: number }[] = [];
  let sTR = smooth(tr, n - 1);
  let sPlus = smooth(plusDM, n - 1);
  let sMinus = smooth(minusDM, n - 1);
  // candle index for arr index n-1 is n.
  let i = n;
  const pdi = sTR !== 0 ? (100 * sPlus) / sTR : 0;
  const mdi = sTR !== 0 ? (100 * sMinus) / sTR : 0;
  plusOut[i] = pdi;
  minusOut[i] = mdi;
  const dxAt = (a: number, b: number) => (a + b !== 0 ? (100 * Math.abs(a - b)) / (a + b) : 0);
  dxVals.push({ i, dx: dxAt(pdi, mdi) });

  for (i = n + 1; i < len; i++) {
    const j = i - 1; // arr index of candle i
    sTR = sTR - sTR / n + tr[j];
    sPlus = sPlus - sPlus / n + plusDM[j];
    sMinus = sMinus - sMinus / n + minusDM[j];
    const p = sTR !== 0 ? (100 * sPlus) / sTR : 0;
    const m = sTR !== 0 ? (100 * sMinus) / sTR : 0;
    plusOut[i] = p;
    minusOut[i] = m;
    dxVals.push({ i, dx: dxAt(p, m) });
  }

  // ADX = Wilder average of DX (seed = SMA of first n DX values).
  if (dxVals.length >= n) {
    let seed = 0;
    for (let k = 0; k < n; k++) seed += dxVals[k].dx;
    seed /= n;
    adxOut[dxVals[n - 1].i] = seed;
    let prev = seed;
    for (let k = n; k < dxVals.length; k++) {
      prev = (prev * (n - 1) + dxVals[k].dx) / n;
      adxOut[dxVals[k].i] = prev;
    }
  }

  return res;
}

export interface StochRsiResult {
  /** StochRSI % (0–100), aligned to input. */
  stoch: (number | null)[];
  /** K = SMA(stoch, kPeriod). */
  k: (number | null)[];
  /** D = SMA(k, dPeriod). */
  d: (number | null)[];
}

/**
 * Stochastic RSI: stoch = (RSI − minRSI) / (maxRSI − minRSI) over the last
 * `stochN` RSI points (×100), then a simple moving average for K and a
 * moving average of K for D. Convention: stoch near 0 = oversold, near 100 = overbought.
 */
export function stochRsi(
  closes: Series,
  rsiN = 14,
  stochN = 14,
  kPeriod = 3,
  dPeriod = 3
): StochRsiResult {
  const rsiSeries = rsi(closes, rsiN).rsi;
  const len = closes.length;
  const stoch: (number | null)[] = new Array(len).fill(null);

  for (let i = stochN - 1; i < len; i++) {
    const window = rsiSeries.slice(i - stochN + 1, i + 1);
    if (!window.every((v) => v !== null)) continue;
    const vals = window as number[];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    stoch[i] = max !== min ? ((vals[vals.length - 1] - min) / (max - min)) * 100 : 50;
  }

  const k = sma(stoch, kPeriod);
  const d = sma(k, dPeriod);
  return { stoch, k, d };
}

/**
 * On-Balance Volume: cumulative — adds volume on up-closes, subtracts on
 * down-closes (unchanged on doji). Starts at 0 on the first comparable pair.
 */
export function obv(closes: Series, volumes: Series): (number | null)[] {
  const len = closes.length;
  const out: (number | null)[] = new Array(len).fill(null);
  if (len === 0) return out;

  let running = 0;
  let prevClose: number | null = null;
  for (let i = 0; i < len; i++) {
    const c = closes[i];
    const v = volumes[i];
    if (!isFiniteNum(c)) continue;
    if (prevClose !== null && isFiniteNum(v)) {
      if (c > prevClose) running += v;
      else if (c < prevClose) running -= v;
    }
    out[i] = running;
    prevClose = c;
  }
  return out;
}

/**
 * Rolling volume z-score: (vol − mean(prev n)) / σ(prev n), excluding the
 * current bar from its own baseline. Returns null when the window is short
 * or σ = 0. Convention: z ≥ k (default 2.5) = volume spike.
 */
export function volumeSpike(volumes: Series, n = 20): (number | null)[] {
  const len = volumes.length;
  const out: (number | null)[] = new Array(len).fill(null);
  if (!Number.isInteger(n) || n <= 0) return out;

  for (let i = n; i < len; i++) {
    const window = volumes.slice(i - n, i);
    if (!window.every(isFiniteNum)) continue;
    const mean = window.reduce((a, b) => a + b, 0) / n;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    const cur = volumes[i];
    if (!isFiniteNum(cur) || sd === 0) continue;
    out[i] = (cur - mean) / sd;
  }
  return out;
}
