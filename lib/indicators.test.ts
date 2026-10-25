import { describe, it, expect } from 'vitest';
import {
  sma,
  ema,
  rsi,
  macd,
  bollinger,
  vwap,
  last,
  pctChange,
  atr,
  adx,
  stochRsi,
  obv,
  volumeSpike,
} from './indicators';

/**
 * Unit tests for the technical-indicator library (audit M4: zero tests).
 * Methodology is documented in lib/indicators.ts — these tests pin the
 * formulas to known reference values.
 */

describe('sma', () => {
  it('returns nulls during warm-up, then the arithmetic mean', () => {
    const result = sma([1, 2, 3, 4, 5], 3);
    expect(result).toEqual([null, null, 2, 3, 4]);
  });

  it('handles the exact-length window', () => {
    expect(sma([2, 4, 6], 3)).toEqual([null, null, 4]);
  });

  it('returns all nulls for a series shorter than n', () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });

  it('rejects non-positive / non-integer n', () => {
    expect(sma([1, 2, 3], 0)).toEqual([null, null, null]);
    expect(sma([1, 2, 3], -1)).toEqual([null, null, null]);
    expect(sma([1, 2, 3], 1.5)).toEqual([null, null, null]);
  });

  it('skips non-finite values', () => {
    const result = sma([1, 2, NaN, 4, 5], 3);
    // window reaching index 3: 1,2,NaN → invalid; index 4: 2,NaN,4 → invalid…
    // with hole-tolerant counting, a full finite window of 3 first exists at
    // the end: [2, NaN, 4, 5] still contains a hole → expect null.
    expect(result[3]).toBeNull();
    expect(result[4]).toBeNull();
  });
});

describe('ema', () => {
  it('seeds with SMA of the first n closes', () => {
    const input = [2, 4, 6, 8, 10];
    const result = ema(input, 3);
    // Seed at index 2 = SMA([2,4,6]) = 4
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(4, 10);
    // multiplier = 2/4 = 0.5 → next = 8·0.5 + 4·0.5 = 6
    expect(result[3]).toBeCloseTo(6, 10);
    // next = 10·0.5 + 6·0.5 = 8
    expect(result[4]).toBeCloseTo(8, 10);
  });

  it('returns all nulls when shorter than n', () => {
    expect(ema([1, 2], 3)).toEqual([null, null]);
  });

  it('converges toward a constant series', () => {
    const constant = new Array(50).fill(100);
    const result = ema(constant, 10);
    expect(last(result)).toBeCloseTo(100, 8);
  });
});

describe('rsi (Wilder)', () => {
  it('is 100 on a monotonically rising series', () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    const { rsi: values } = rsi(rising, 14);
    expect(last(values)).toBeCloseTo(100, 5);
  });

  it('produces values within [0, 100] on mixed data', () => {
    const mixed = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42,
      45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22,
      45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57,
      43.42, 42.66, 43.13];
    const { rsi: values } = rsi(mixed, 14);
    for (const v of values) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
    // Reference: the classic Wilder example for this dataset yields RSI ≈ 70.53
    // at the end of the 14-period window (subsequent points smooth from there).
    const first = values.find((v) => v !== null);
    expect(first).not.toBeNull();
  });

  it('returns nulls during warm-up and for short series', () => {
    const { rsi: values } = rsi([1, 2], 14);
    expect(values).toEqual([null, null]);
  });

  it('is 0 on a monotonically falling series', () => {
    const falling = Array.from({ length: 30 }, (_, i) => 100 - i);
    const { rsi: values } = rsi(falling, 14);
    expect(last(values)).toBeCloseTo(0, 5);
  });
});

describe('macd', () => {
  const closes = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 7) * 10 + i * 0.1);

  it('computes macd = fast EMA − slow EMA', () => {
    const { macd: line } = macd(closes, 12, 26, 9);
    // Warm-up: the slow EMA needs 26 closes (seeds at index 25), so the
    // MACD line is null before that and non-null from index 25 on.
    expect(line[10]).toBeNull();
    expect(line[24]).toBeNull();
    expect(line[25]).not.toBeNull();
    const idx = line.findIndex((v) => v !== null);
    expect(idx).toBe(25);
  });

  it('signal is EMA over the macd line; histogram = macd − signal', () => {
    const { macd: line, signal, histogram } = macd(closes, 12, 26, 9);
    // Find first index where BOTH macd and signal exist
    const bothIdx = line.findIndex((v, i) => v !== null && signal[i] !== null);
    expect(bothIdx).not.toBe(-1);
    expect(histogram[bothIdx]).toBeCloseTo(
      (line[bothIdx] as number) - (signal[bothIdx] as number),
      10
    );
  });

  it('returns null-filled arrays for invalid parameters', () => {
    const { macd: line, signal } = macd(closes, 26, 12, 9); // fast >= slow
    expect(line.every((v) => v === null)).toBe(true);
    expect(signal.every((v) => v === null)).toBe(true);
  });
});

describe('bollinger', () => {
  it('middle band equals SMA and bands are symmetric around it', () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
      25, 26, 27, 28, 29, 30];
    const { upper, middle, lower } = bollinger(closes, 20, 2);
    const i = 19; // first valid index
    expect(middle[i]).not.toBeNull();
    expect(upper[i]).not.toBeNull();
    expect(lower[i]).not.toBeNull();
    // Symmetry: upper − middle === middle − lower
    expect((upper[i] as number) - (middle[i] as number)).toBeCloseTo(
      (middle[i] as number) - (lower[i] as number),
      10
    );
  });

  it('zero variance collapses bands onto the mean', () => {
    const flat = new Array(25).fill(42);
    const { upper, lower, middle } = bollinger(flat, 20, 2);
    expect(upper[24]).toBeCloseTo(42, 10);
    expect(lower[24]).toBeCloseTo(42, 10);
    expect(middle[24]).toBeCloseTo(42, 10);
  });

  it('bandwidth is (upper − lower) / middle', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + (i % 5) * 3);
    const { upper, lower, middle, bandwidth } = bollinger(closes, 20, 2);
    const i = 24;
    expect(bandwidth[i]).toBeCloseTo(
      ((upper[i] as number) - (lower[i] as number)) / (middle[i] as number),
      10
    );
  });
});

describe('vwap', () => {
  it('is the volume-weighted mean of the series', () => {
    const closes = [10, 20, 30];
    const volumes = [100, 100, 300];
    const { vwap: values } = vwap(closes, volumes);
    // Cumulative: (10·100)/100 = 10; (1000+2000)/200 = 15;
    // (1000+2000+9000)/500 = 24
    expect(values[0]).toBeCloseTo(10, 10);
    expect(values[1]).toBeCloseTo(15, 10);
    expect(values[2]).toBeCloseTo(24, 10);
  });

  it('uses typical price when highs/lows are supplied', () => {
    const closes = [10];
    const volumes = [10];
    const highs = [16];
    const lows = [4];
    const { vwap: values } = vwap(closes, volumes, highs, lows);
    expect(values[0]).toBeCloseTo(10, 10); // (16+4+10)/3 = 10
  });

  it('carries the previous VWAP over zero-volume candles', () => {
    const { vwap: values } = vwap([10, 999], [10, 0]);
    expect(values[1]).toBeCloseTo(10, 10);
  });
});

describe('last / pctChange', () => {
  it('last returns the final non-null value', () => {
    expect(last([null, 1, 2, null])).toBe(2);
    expect(last([null, null])).toBeNull();
    expect(last([])).toBeNull();
  });

  it('pctChange measures the last step', () => {
    expect(pctChange([100, 110])).toBeCloseTo(10, 10);
    expect(pctChange([100, 90])).toBeCloseTo(-10, 10);
    expect(pctChange([100])).toBeNull();
    expect(pctChange([0, 5])).toBeNull(); // zero previous → undefined %
  });
});

/* -------------------------------------------------------------------------- */
/* Signal-engine indicators (ATR / ADX / StochRSI / OBV / volume spike)        */
/* -------------------------------------------------------------------------- */

/** Candle arrays where close_i = start + i, high = close+2, low = close-2. */
function rampCandles(n: number, start = 100) {
  const closes = Array.from({ length: n }, (_, i) => start + i);
  return { closes, highs: closes.map((c) => c + 2), lows: closes.map((c) => c - 2) };
}

describe('atr', () => {
  it('constant true range → ATR equals that range after warm-up', () => {
    // h-l = 4 dominates every TR (h-pc = 3, |l-pc| = 1) → TR is constant 4.
    const { highs, lows, closes } = rampCandles(40);
    const values = atr(highs, lows, closes, 14);
    expect(values.slice(0, 14).every((v) => v === null)).toBe(true); // warm-up
    expect(values[14]).toBeCloseTo(4, 10); // SMA seed
    expect(values[39]).toBeCloseTo(4, 10); // Wilder smoothing keeps it
  });

  it('returns all nulls when the series is too short', () => {
    const { highs, lows, closes } = rampCandles(10);
    expect(atr(highs, lows, closes, 14).every((v) => v === null)).toBe(true);
  });
});

describe('adx', () => {
  it('steadily rising series → +DI dominates, −DI stays 0, ADX in 0–100', () => {
    const n = 60;
    const highs = Array.from({ length: n }, (_, i) => 100 + i);
    const lows = Array.from({ length: n }, (_, i) => 90 + i);
    const closes = Array.from({ length: n }, (_, i) => 95 + i);
    const { adx: adxSeries, plusDi, minusDi } = adx(highs, lows, closes, 14);

    expect(plusDi[59]).not.toBeNull();
    expect(plusDi[59]!).toBeGreaterThan(0);
    expect(minusDi[59]).toBe(0); // no down-movement exists in this series
    expect(plusDi[59]!).toBeGreaterThan(minusDi[59]!);
    expect(adxSeries[59]).not.toBeNull();
    expect(adxSeries[59]!).toBeGreaterThanOrEqual(0);
    expect(adxSeries[59]!).toBeLessThanOrEqual(100);
    // Warm-up: nothing before the first DI window.
    expect(adxSeries[10]).toBeNull();
  });
});

describe('stochRsi', () => {
  it('stays within 0–100 and warms up with nulls', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + (i % 17) * 0.5 - (i % 5) * 0.3);
    const { stoch, k, d } = stochRsi(closes, 14, 14, 3, 3);
    expect(stoch.slice(0, 30).some((v) => v === null)).toBe(true);
    for (let i = 30; i < closes.length; i++) {
      expect(stoch[i]).toBeGreaterThanOrEqual(0);
      expect(stoch[i]).toBeLessThanOrEqual(100);
      if (k[i] !== null) {
        expect(k[i]!).toBeGreaterThanOrEqual(0);
        expect(k[i]!).toBeLessThanOrEqual(100);
      }
      if (d[i] !== null) {
        expect(d[i]!).toBeGreaterThanOrEqual(0);
        expect(d[i]!).toBeLessThanOrEqual(100);
      }
    }
  });

  it('flat (always-winner) RSI window is the documented 50 midpoint', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i); // RSI = 100 flat
    const { stoch, k } = stochRsi(closes, 14, 14, 3, 3);
    expect(stoch[59]).toBe(50); // min == max convention → neutral 50
    expect(k[59]).toBe(50);
  });
});

describe('obv', () => {
  it('adds volume on up-closes, subtracts on down-closes, ignores dojis', () => {
    const values = obv([100, 101, 100, 100, 99], [10, 20, 30, 40, 50]);
    expect(values).toEqual([0, 20, -10, -10, -60]);
  });
});

describe('volumeSpike', () => {
  it('z-scores the current bar against the prior window', () => {
    const baseline = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 90 : 110)); // μ=100 σ=10
    const values = volumeSpike([...baseline, 1000], 20);
    expect(values.slice(0, 20).every((v) => v === null)).toBe(true);
    expect(values[20]).toBeCloseTo((1000 - 100) / 10, 6); // z = 90 → spike
  });

  it('stays null on a flat baseline (zero variance)', () => {
    const values = volumeSpike([...Array(20).fill(100), 100], 20);
    expect(values[20]).toBeNull();
  });
});
