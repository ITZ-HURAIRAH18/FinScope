import { UpstreamError } from '@/lib/coingecko';
import { binancePair, fetchBinanceKlines } from '@/lib/binance-rest';
import {
  adx,
  atr,
  ema,
  last,
  macd,
  obv,
  rsi,
  stochRsi,
  volumeSpike,
  type Series,
} from '@/lib/indicators';
import type { Candle } from '@/lib/market-agent';
import {
  analyzeStructure,
  findSwings,
  targetLevels,
} from './structure';
import { buildTradePlan, noTradePlan } from './levels';
import { DEFAULT_WEIGHTS, MIN_RR, scoreSignal } from './scoring';
import type {
  CandlePattern,
  Regime,
  SignalAnalysis,
  TfAnalysis,
} from './types';

/**
 * Deterministic multi-timeframe analysis engine (docs/SIGNAL-AGENT-PLAN.md
 * phase 1). ALL values below are computed from REAL Binance klines via the
 * tested indicator/structure/scoring modules — no LLM, no randomness, no
 * fabricated data. The AI layer only narrates the JSON this produces.
 *
 * Timeframes (spec §2, adapted): 15m (entry), 1h (intraday), 4h (setup),
 * 1d (bias). Derivatives/order-flow inputs arrive in phase 4 and will be
 * labelled as provider data when they do.
 */

interface TfFetchSpec {
  tf: string;
  days: number;
}

const TF_SPECS: TfFetchSpec[] = [
  { tf: '15m', days: 7 },
  { tf: '1h', days: 30 },
  { tf: '4h', days: 120 },
  { tf: '1d', days: 720 },
];

/** Setup timeframe: anchors structure, momentum, and the trade plan. */
export const SETUP_TF = '4h';

/** Timeframe → covered history in days (honest provenance labels). */
export const TF_DAY_RANGES: Record<string, number> = Object.fromEntries(
  TF_SPECS.map((s) => [s.tf, s.days])
);

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 100;
const cache = new Map<string, { at: number; value: SignalAnalysis }>();

/* -------------------------------------------------------------------------- */
/* Candle patterns (last CLOSED candle only)                                  */
/* -------------------------------------------------------------------------- */

/** Engulfing / pin bar / doji on the last fully closed candle. */
export function detectPattern(candles: Candle[]): CandlePattern | null {
  if (candles.length < 3) return null;
  const prev = candles[candles.length - 2];
  const cur = candles[candles.length - 1];

  const body = (c: Candle) => Math.abs(c[4] - c[1]);
  const range = (c: Candle) => Math.max(c[2] - c[3], 1e-12);

  const prevBull = prev[4] > prev[1];
  const prevBear = prev[4] < prev[1];
  const curBull = cur[4] > cur[1];
  const curBear = cur[4] < cur[1];

  // Engulfing: current body fully covers the previous opposite body.
  if (curBull && prevBear && cur[1] <= prev[4] && cur[4] >= prev[1]) {
    return { name: 'Bullish Engulfing', direction: 'bullish' };
  }
  if (curBear && prevBull && cur[1] >= prev[4] && cur[4] <= prev[1]) {
    return { name: 'Bearish Engulfing', direction: 'bearish' };
  }

  // Pin bar: long rejection wick with a small body.
  const lowerWick = Math.min(cur[1], cur[4]) - cur[3];
  const upperWick = cur[2] - Math.max(cur[1], cur[4]);
  const smallBody = body(cur) <= 0.35 * range(cur);
  if (smallBody && lowerWick >= 2 * body(cur) && body(cur) > 0) {
    return { name: 'Hammer (bullish pin)', direction: 'bullish' };
  }
  if (smallBody && upperWick >= 2 * body(cur) && body(cur) > 0) {
    return { name: 'Shooting Star (bearish pin)', direction: 'bearish' };
  }

  // Doji: indecision.
  if (body(cur) <= 0.1 * range(cur)) {
    return { name: 'Doji (indecision)', direction: 'neutral' };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Per-timeframe analysis (pure — unit-tested with fixtures)                  */
/* -------------------------------------------------------------------------- */

const atrPctOf = (a: number | null, price: number): number | null =>
  a !== null && price > 0 ? a / price : null;

function classifyRegime(adxVal: number | null, atrPct: number | null): Regime {
  if (adxVal !== null && adxVal >= 25) return 'TRENDING';
  if (atrPct !== null && atrPct >= 0.03) return 'HIGH_VOLATILITY';
  return 'RANGING';
}

function obvTrendOf(closes: Series, volumes: Series): TfAnalysis['obvTrend'] {
  const series = obv(closes, volumes);
  const cur = last(series);
  if (cur === null || series.length < 21) return null;
  const back = series[series.length - 21];
  if (back === null) return null;
  if (cur > back) return 'RISING';
  if (cur < back) return 'FALLING';
  return 'FLAT';
}

/** Compute every indicator/structure reading for one timeframe. */
export function analyzeTf(candles: Candle[], tf: string): TfAnalysis {
  const closes = candles.map((c) => c[4]);
  const highs = candles.map((c) => c[2]);
  const lows = candles.map((c) => c[3]);
  const volumes = candles.map((c) => c[5] ?? 0);

  const price = closes[closes.length - 1] ?? 0;
  const atrSeries = atr(highs, lows, closes, 14);
  const adxSeries = adx(highs, lows, closes, 14);
  const stoch = stochRsi(closes, 14, 14, 3, 3);
  const zSeries = volumeSpike(volumes, 20);
  const volumeZ = last(zSeries);
  const atrVal = last(atrSeries);

  return {
    tf,
    price,
    candleCount: candles.length,
    ema20: last(ema(closes, 20)),
    ema50: last(ema(closes, 50)),
    ema200: last(ema(closes, 200)),
    rsi14: last(rsi(closes, 14).rsi),
    macdHist: last(macd(closes).histogram),
    atr14: atrVal,
    atrPct: atrPctOf(atrVal, price),
    adx14: last(adxSeries.adx),
    plusDi: last(adxSeries.plusDi),
    minusDi: last(adxSeries.minusDi),
    stochK: last(stoch.k),
    stochD: last(stoch.d),
    volumeZ,
    volumeSpike: volumeZ !== null && volumeZ >= 2.5,
    obvTrend: obvTrendOf(closes, volumes),
    structure: analyzeStructure(candles),
    regime: classifyRegime(last(adxSeries.adx), atrPctOf(atrVal, price)),
    // Patterns read only CLOSED candles: the final Binance bar is still
    // forming, so it is excluded here (everything else uses it as "price").
    lastPattern: detectPattern(candles.slice(0, -1)),
  };
}

/* -------------------------------------------------------------------------- */
/* Fetch + orchestrate                                                        */
/* -------------------------------------------------------------------------- */

function toCandles(rows: Array<Array<number | string>>, rangeStartMs: number): Candle[] {
  const out: Candle[] = [];
  for (const row of rows) {
    const t = Number(row[0]);
    const c = Number(row[4]);
    if (!Number.isFinite(t) || !Number.isFinite(c) || t < rangeStartMs) continue;
    out.push([t, Number(row[1]), Number(row[2]), Number(row[3]), c, Number(row[5])]);
  }
  return out;
}

/**
 * Full signal analysis for a coin. Cached 60s per symbol (Binance + LLM
 * quota protection). Throws UpstreamError when market data is unavailable.
 */
export async function getSignal(base: string): Promise<SignalAnalysis> {
  const now = Date.now();
  const hit = cache.get(base);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;

  const pair = binancePair(base);

  const results = await Promise.allSettled(
    TF_SPECS.map(async (spec) => {
      const rows = (await fetchBinanceKlines(pair, spec.tf, spec.days)).data;
      const rangeStartMs = now - spec.days * 86_400_000;
      const candles = toCandles(rows, rangeStartMs);
      if (candles.length < 30) {
        throw new Error(`insufficient ${spec.tf} candles (${candles.length})`);
      }
      return { spec, candles };
    })
  );

  const candlesByTf = new Map<string, Candle[]>();
  const failed: string[] = [];
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled') candlesByTf.set(r.value.spec.tf, r.value.candles);
    else failed.push(TF_SPECS[idx].tf);
  });

  const setupCandles = candlesByTf.get(SETUP_TF);
  if (!setupCandles) {
    throw new UpstreamError(
      `Market data unavailable for ${base} (setup timeframe failed: ${failed.join(', ')})`,
      503
    );
  }

  const timeframes: Record<string, TfAnalysis> = {};
  for (const [tf, candles] of candlesByTf) timeframes[tf] = analyzeTf(candles, tf);

  const tfList = Object.values(timeframes);
  const scoring = scoreSignal(tfList, DEFAULT_WEIGHTS, SETUP_TF);
  const setup = timeframes[SETUP_TF];

  // --- Trade plan (deterministic levels) ----------------------------------
  let plan =
    scoring.direction === 'NO_TRADE'
      ? noTradePlan(scoring.noTradeReasons)
      : buildTradePlan({
          direction: scoring.direction,
          price: setup.price,
          atr: setup.atr14,
          support: setup.structure.support,
          resistance: setup.structure.resistance,
          targets: targetLevels(findSwings(setupCandles), setup.price, scoring.direction),
          setupTf: SETUP_TF,
        });

  // Spec §4 gate: risk:reward must reach 1:2 or the signal is withheld —
  // but the computed levels are kept (direction relabelled) so the user can
  // still see exactly what would have qualified.
  if (
    scoring.direction !== 'NO_TRADE' &&
    plan.riskReward !== null &&
    plan.riskReward < MIN_RR
  ) {
    const reason = `risk:reward to TP2 is ${plan.riskReward} (policy requires ≥ ${MIN_RR})`;
    scoring.noTradeReasons.push(reason);
    scoring.direction = 'NO_TRADE';
    plan = { ...plan, direction: 'NO_TRADE', validAgainWhen: `Currently blocked: ${reason}` };
  }

  const analysis: SignalAnalysis = {
    symbol: base,
    source: 'Binance klines (real exchange data)',
    generatedAt: new Date().toISOString(),
    price: timeframes[SETUP_TF]?.price ?? setup.price,
    timeframes,
    scoring,
    plan,
    weightsVersion: 'v1 heuristic weights — NOT backtested yet (plan phase 5)',
    caveats: [
      'Confluence weights are v1 heuristics, not yet backtested — treat confidence as evidence strength, never as win probability.',
      'Derivatives data (funding, open interest) and order-flow inputs are not included yet (phase 4).',
      'Paper-trading analysis only — not financial advice. Any setup can be invalidated.',
      ...(failed.length ? [`Timeframes unavailable this refresh: ${failed.join(', ')} (values omitted, not fabricated).`] : []),
    ],
  };

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(base, { at: now, value: analysis });
  return analysis;
}
