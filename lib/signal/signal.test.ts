import { describe, it, expect } from 'vitest';
import type { Candle } from '../market-agent';
import {
  findSwings,
  trendFromSwings,
  nearestLevels,
  targetLevels,
  detectBos,
  analyzeStructure,
} from './structure';
import { buildTradePlan, noTradePlan } from './levels';
import { scoreSignal, MIN_TOTAL, REQUIRED_AGREEING_GROUPS } from './scoring';
import { analyzeTf, detectPattern } from './engine';
import type { TfAnalysis } from './types';

/**
 * Unit tests for the deterministic signal engine (docs/SIGNAL-AGENT-PLAN.md
 * phase 1). Everything here is pure math over constructed candle fixtures —
 * no network, no AI. Live end-to-end coverage lives in scripts/smoke-agent.mjs.
 */

/** Build [timeMs, open, high, low, close, v] candles from a close series. */
const candlesFrom = (closes: number[]): Candle[] =>
  closes.map((c, i) => [(i + 1) * 3_600_000, c, c, c, c, 100]);

/* -------------------------------------------------------------------------- */
/* structure.ts                                                               */
/* -------------------------------------------------------------------------- */

describe('structure: swings / trend / levels / BOS', () => {
  // Zigzag with two higher highs, two higher lows → UP.
  const upCloses = [10, 11, 12, 11, 10, 11, 13, 12, 11, 12, 14];
  const up = findSwings(candlesFrom(upCloses), 1);

  it('detects fractal swing highs and lows at the pivots', () => {
    expect(up.highs.map((s) => s.price)).toEqual([12, 13]);
    expect(up.lows.map((s) => s.price)).toEqual([10, 11]);
    expect(up.highs[0].i).toBe(2);
    expect(up.lows[0].i).toBe(4);
  });

  it('classifies HH + HL as UP and LH + LL as DOWN', () => {
    expect(trendFromSwings(up)).toBe('UP');

    const downCloses = [20, 19, 18, 19, 20, 19, 17, 18, 19, 18, 16];
    const down = findSwings(candlesFrom(downCloses), 1);
    expect(trendFromSwings(down)).toBe('DOWN');
  });

  it('returns UNKNOWN when there are fewer than two pivots per side', () => {
    const one = findSwings(candlesFrom([1, 2, 3, 2, 1]), 1);
    expect(trendFromSwings(one)).toBe('UNKNOWN');
    expect(trendFromSwings({ highs: [], lows: [] })).toBe('UNKNOWN');
  });

  it('nearest support/resistance are the closest pivots below/above price', () => {
    // price = 12 (last close): support 11, resistance 13.
    expect(nearestLevels(up, 12)).toEqual({ support: 11, resistance: 13 });
    // Below every pivot: no support; the NEAREST swing high above is 12.
    expect(nearestLevels(up, 5)).toEqual({ support: null, resistance: 12 });
  });

  it('targetLevels returns real structure levels nearest-first', () => {
    expect(targetLevels(up, 12, 'LONG')).toEqual([13]);
    expect(targetLevels(up, 12, 'SHORT')).toEqual([11, 10]);
    expect(targetLevels(up, 50, 'LONG')).toEqual([]);
  });

  it('detects the latest break of structure (close beyond last pivot)', () => {
    // Last swing high is 13 (index 6); close 14 at index 10 breaks above it;
    // no close below the last swing low (11 at index 8) → BULLISH.
    expect(detectBos(candlesFrom(upCloses), up)).toBe('BULLISH');
  });

  it('analyzeStructure aggregates counts without throwing on tiny input', () => {
    const snap = analyzeStructure(candlesFrom(upCloses));
    expect(snap.swingHighCount).toBe(2);
    expect(snap.swingLowCount).toBe(2);
    expect(snap.trend).toBe('UP');

    const tiny = analyzeStructure(candlesFrom([1, 2]));
    expect(tiny.trend).toBe('UNKNOWN');
    expect(tiny.support).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* levels.ts                                                                  */
/* -------------------------------------------------------------------------- */

describe('levels: deterministic trade plan', () => {
  it('LONG plan: structure stop + ATR buffer, real targets, RR, duration', () => {
    const plan = buildTradePlan({
      direction: 'LONG',
      price: 100,
      atr: 2,
      support: 97,
      resistance: 110,
      targets: [110, 115],
      setupTf: '4h',
    });

    // SL = support − 0.5 ATR (distance 4 stays within [0.8, 3] × ATR).
    expect(plan.direction).toBe('LONG');
    expect(plan.stopLoss).toBeCloseTo(96, 6);
    expect(plan.stopLossAtrMultiple).toBeCloseTo(2, 2);

    // Retest distance 3 (0.3–2 ATR) → limit zone around support.
    expect(plan.entryType).toBe('limit-zone');
    expect(plan.entryZone).not.toBeNull();
    expect(plan.entryZone![0]).toBeCloseTo(97, 6);
    expect(plan.entryZone![1]).toBeCloseTo(97.6, 6);

    // Three targets: structure first, ATR fallback fills, nearest-first order.
    expect(plan.takeProfits).toHaveLength(3);
    expect(plan.takeProfits.map((t) => t.closePct)).toEqual([40, 30, 30]);
    expect(plan.takeProfits[0].price).toBeCloseTo(103, 6); // ATR fallback nearest
    expect(plan.takeProfits[1].price).toBeCloseTo(110, 6); // structure
    expect(plan.riskReward).toBeCloseTo(
      Math.abs(110 - plan.entryPrice!) / Math.abs(plan.entryPrice! - plan.stopLoss!),
      2
    );

    // ATR 2% of price → intraday, 24h invalidation window.
    expect(plan.duration).toBe('intraday');
    expect(plan.timeInvalidationHours).toBe(24);
    expect(plan.invalidation).toContain('below');
    expect(plan.invalidation).toContain('4h');
    expect(plan.breakevenRule).toContain('TP1');
  });

  it('clamps the stop when structure is absurdly far or too close', () => {
    // support 70 → raw SL distance 31 > 3×ATR (6) → clamp to 6.
    const far = buildTradePlan({
      direction: 'LONG',
      price: 100,
      atr: 2,
      support: 70,
      resistance: 110,
      targets: [],
      setupTf: '4h',
    });
    expect(far.stopLoss).toBeCloseTo(94, 6);
    expect(far.stopLossAtrMultiple).toBeCloseTo(3, 2);

    // support 99.9 → raw distance 1.4 - buffer = 0.9?? buffer 1 → dist 0.9 < 0.8×2=1.6 → clamp 1.6.
    const near = buildTradePlan({
      direction: 'LONG',
      price: 100,
      atr: 2,
      support: 99.9,
      resistance: 110,
      targets: [],
      setupTf: '4h',
    });
    expect(near.stopLoss).toBeCloseTo(98.4, 6);
    expect(near.stopLossAtrMultiple).toBeCloseTo(0.8, 2);
  });

  it('SHORT plan mirrors the logic (stop above resistance)', () => {
    const plan = buildTradePlan({
      direction: 'SHORT',
      price: 100,
      atr: 2,
      support: 90,
      resistance: 103,
      targets: [92, 88],
      setupTf: '4h',
    });
    expect(plan.stopLoss).toBeCloseTo(104, 6); // 103 + 0.5 ATR
    expect(plan.takeProfits[0].price).toBeLessThan(100);
    expect(plan.invalidation).toContain('above');
    const rrs = plan.takeProfits.map((t) => t.rr);
    expect(rrs[0]).toBeGreaterThan(0);
    expect(plan.riskReward).toBeGreaterThan(0);
  });

  it('refuses to fabricate levels when ATR is missing', () => {
    const plan = buildTradePlan({
      direction: 'LONG',
      price: 100,
      atr: null,
      support: 97,
      resistance: 110,
      targets: [110],
      setupTf: '4h',
    });
    expect(plan.direction).toBe('NO_TRADE');
    expect(plan.stopLoss).toBeNull();
    expect(plan.takeProfits).toHaveLength(0);
    expect(plan.validAgainWhen).toContain('ATR');
  });

  it('noTradePlan surfaces the blocking reasons as a condition', () => {
    const plan = noTradePlan(['confluence total 4 is below 50']);
    expect(plan.direction).toBe('NO_TRADE');
    expect(plan.validAgainWhen).toContain('confluence total 4');
  });
});

/* -------------------------------------------------------------------------- */
/* scoring.ts                                                                 */
/* -------------------------------------------------------------------------- */

const makeTf = (over: Partial<TfAnalysis>, tf: string): TfAnalysis => ({
  tf,
  price: 105,
  candleCount: 500,
  ema20: 104,
  ema50: 100,
  ema200: 95,
  rsi14: 65,
  macdHist: 0.5,
  atr14: 1.5,
  atrPct: 0.015,
  adx14: 30,
  plusDi: 25,
  minusDi: 10,
  stochK: 70,
  stochD: 55,
  volumeZ: 3,
  volumeSpike: true,
  obvTrend: 'RISING',
  structure: {
    trend: 'UP',
    support: 100,
    resistance: 115,
    bos: 'BULLISH',
    swingHighCount: 6,
    swingLowCount: 5,
  },
  regime: 'TRENDING',
  lastPattern: null,
  ...over,
});

describe('scoring: confluence gates', () => {
  const allBull = [
    makeTf({}, '15m'),
    makeTf({}, '1h'),
    makeTf({}, '4h'),
    makeTf({}, '1d'),
  ];

  it('issues LONG when the total clears the threshold and ≥4 groups agree', () => {
    const s = scoreSignal(allBull);
    expect(s.direction).toBe('LONG');
    expect(Math.abs(s.total)).toBeGreaterThanOrEqual(MIN_TOTAL);
    expect(s.agreeingGroups).toBeGreaterThanOrEqual(REQUIRED_AGREEING_GROUPS);
    expect(s.confidence).toBe(Math.min(100, Math.abs(s.total)));
    expect(s.noTradeReasons).toHaveLength(0);
    expect(s.groups).toHaveLength(5);
    const weightSum = s.groups.reduce((a, g) => a + g.weight, 0);
    expect(weightSum).toBeCloseTo(1, 6);
  });

  it('issues SHORT on bearish confluence', () => {
    const allBear = [
      makeTf({ price: 95, ema50: 100, ema200: 105, rsi14: 35, macdHist: -0.5, structure: {
        trend: 'DOWN', support: 88, resistance: 99, bos: 'BEARISH', swingHighCount: 6, swingLowCount: 5,
      }, obvTrend: 'FALLING' }, '15m'),
      makeTf({ price: 95, ema50: 100, ema200: 105, rsi14: 35, macdHist: -0.5, structure: {
        trend: 'DOWN', support: 88, resistance: 99, bos: 'BEARISH', swingHighCount: 6, swingLowCount: 5,
      }, obvTrend: 'FALLING' }, '1h'),
      makeTf({ price: 95, ema50: 100, ema200: 105, rsi14: 35, macdHist: -0.5, structure: {
        trend: 'DOWN', support: 88, resistance: 99, bos: 'BEARISH', swingHighCount: 6, swingLowCount: 5,
      }, obvTrend: 'FALLING' }, '4h'),
      makeTf({ price: 95, ema50: 100, ema200: 105, rsi14: 35, macdHist: -0.5, structure: {
        trend: 'DOWN', support: 88, resistance: 99, bos: 'BEARISH', swingHighCount: 6, swingLowCount: 5,
      }, obvTrend: 'FALLING' }, '1d'),
    ];
    const s = scoreSignal(allBear);
    expect(s.direction).toBe('SHORT');
    expect(s.total).toBeLessThanOrEqual(-MIN_TOTAL);
    expect(s.agreeingGroups).toBeGreaterThanOrEqual(REQUIRED_AGREEING_GROUPS);
  });

  it('withholds a signal (NO_TRADE) when groups conflict or total is weak', () => {
    const mixed = [
      makeTf({ price: 100, ema50: 101, ema200: null, rsi14: 50, macdHist: null, volumeZ: null, volumeSpike: false }, '15m'),
      makeTf({ price: 95, ema50: 100, ema200: null, rsi14: 50, macdHist: null, volumeZ: null, volumeSpike: false }, '1h'),
      makeTf({ price: 100, ema50: 101, ema200: null, rsi14: 50, macdHist: null, volumeZ: null, volumeSpike: false, structure: {
        trend: 'UP', support: 97, resistance: 110, bos: null, swingHighCount: 6, swingLowCount: 5,
      } }, '4h'),
      makeTf({ price: 100, ema50: 101, ema200: null, rsi14: 50, macdHist: null, volumeZ: null, volumeSpike: false }, '1d'),
    ];
    const s = scoreSignal(mixed);
    expect(s.direction).toBe('NO_TRADE');
    expect(s.noTradeReasons.length).toBeGreaterThan(0);
    expect(Math.abs(s.total)).toBeLessThan(MIN_TOTAL);
  });

  it('returns an empty-bear state without timeframes instead of throwing', () => {
    const s = scoreSignal([]);
    expect(s.direction).toBe('NO_TRADE');
    expect(s.groups).toHaveLength(5);
    expect(s.noTradeReasons.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* engine: per-TF analysis + candle patterns (pure)                           */
/* -------------------------------------------------------------------------- */

describe('engine: analyzeTf + detectPattern', () => {
  // 300-candle gentle uptrend with pullbacks (real pivots for structure).
  const trending: Candle[] = (() => {
    const out: Candle[] = [];
    let px = 100;
    for (let i = 0; i < 300; i++) {
      out.push([i * 3_600_000, px, px + 1, px - 1, px, i % 2 === 0 ? 900 : 1100]);
      px += i % 7 < 5 ? 1 : -0.6;
    }
    return out;
  })();

  it('computes aligned indicator/structure readings from real candles', () => {
    const t = analyzeTf(trending, '4h');
    expect(t.price).toBe(trending[trending.length - 1][4]);
    expect(t.candleCount).toBe(300);
    expect(t.ema200).not.toBeNull(); // 300 > 200 warm-up
    expect(t.ema50).not.toBeNull();
    expect(t.rsi14).not.toBeNull();
    expect(t.rsi14!).toBeGreaterThan(0);
    expect(t.rsi14!).toBeLessThan(100);
    expect(t.atr14).not.toBeNull();
    expect(t.atr14!).toBeGreaterThan(0);
    expect(t.atrPct!).toBeCloseTo(t.atr14! / t.price, 8);
    expect(t.adx14).not.toBeNull();
    expect(t.stochK).not.toBeNull();
    expect(['TRENDING', 'RANGING', 'HIGH_VOLATILITY']).toContain(t.regime);
    expect(t.structure.swingHighCount).toBeGreaterThan(0);
    expect(t.structure.trend).toBe('UP');
    expect(t.obvTrend).not.toBeNull();
    // Alternating 900/1100 volume → every z-score is well below the 2.5 flag.
    expect(t.volumeSpike).toBe(false);
  });

  it('flags volume spikes when a bar blows past its baseline', () => {
    const withSpike = trending.map((c, i) =>
      i === 299 ? ([c[0], c[1], c[2], c[3], c[4], 4000] as Candle) : c
    );
    const t = analyzeTf(withSpike, '4h');
    expect(t.volumeZ).not.toBeNull();
    expect(t.volumeZ!).toBeGreaterThan(2.5);
    expect(t.volumeSpike).toBe(true);
  });

  it('detects engulfing, pin bar, and doji patterns', () => {
    // Bearish-prev + engulfing current.
    const engulfing: Candle[] = [
      [1, 99, 100, 98, 99.5, 10],
      [2, 100, 101, 94, 95, 10], // bearish close
      [3, 94, 103, 93, 102, 10], // opens below prev close, closes above prev open
    ];
    expect(detectPattern(engulfing)?.name).toBe('Bullish Engulfing');

    // Long lower wick, small body → hammer (prev candle must not engulf).
    const hammer: Candle[] = [
      [1, 99, 101, 98, 100, 10],
      [2, 100, 103, 99, 102, 10], // bullish prev
      [3, 100, 102, 90, 101, 10], // body 1, lower wick 10
    ];
    expect(detectPattern(hammer)?.name).toContain('Hammer');
    expect(detectPattern(hammer)?.direction).toBe('bullish');

    // Zero body → doji.
    const doji: Candle[] = [
      [1, 99, 101, 98, 100, 10],
      [2, 100, 104, 97, 103, 10], // bullish prev (not engulfing a flat candle)
      [3, 100, 101, 99, 100, 10], // open == close
    ];
    expect(detectPattern(doji)?.name).toContain('Doji');

    expect(detectPattern([])).toBeNull();
    expect(detectPattern(engulfing.slice(0, 2))).toBeNull(); // < 3 candles
  });
});
