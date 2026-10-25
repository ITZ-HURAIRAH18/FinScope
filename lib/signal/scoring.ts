import type { ScoreBreakdown, ScoreGroup, TfAnalysis } from './types';

/**
 * Confluence scoring (spec §4) — pure, weights configurable.
 *
 * Each factor group returns −100 (strong bear) … +100 (strong bull); the
 * total is the weighted sum. A directional signal requires ALL gates:
 *   1. |total| ≥ MIN_TOTAL (50)
 *   2. ≥ 4 independent groups agreeing (sign matches, |score| ≥ 40)
 *   3. R:R ≥ 2 (checked by the engine after the plan is built)
 * Otherwise: NO_TRADE with explicit reasons + what would make it valid.
 *
 * HONESTY: weights are v1 heuristics, NOT backtested (see
 * docs/SIGNAL-AGENT-PLAN.md phase 5) — every API response carries that label.
 */

export interface SignalWeights {
  trend: number;
  structure: number;
  momentum: number;
  alignment: number;
  volume: number;
}

export const DEFAULT_WEIGHTS: SignalWeights = {
  trend: 0.3,
  structure: 0.2,
  momentum: 0.2,
  alignment: 0.15,
  volume: 0.15,
};

/** Spec §4 gates. */
export const MIN_TOTAL = 50;
export const REQUIRED_AGREEING_GROUPS = 4;
export const MIN_GROUP_MAGNITUDE = 40;
export const MIN_RR = 2;

const clamp = (v: number, lo = -100, hi = 100) => Math.min(hi, Math.max(lo, v));

/** EMA-based trend score for one timeframe: alignment + slope context. */
function trendScore(t: TfAnalysis): { score: number; detail: string } {
  const { price, ema50, ema200, adx14 } = t;
  if (price === 0 || ema50 === null) {
    return { score: 0, detail: `${t.tf}: EMA data unavailable` };
  }
  let score = 0;
  if (ema200 !== null && price > ema50 && ema50 > ema200) score = 100;
  else if (ema200 !== null && price < ema50 && ema50 < ema200) score = -100;
  else if (price > ema50) score = 45;
  else score = -45;

  // Weak ADX dampens the trend claim (chop masquerading as trend).
  if (adx14 !== null && adx14 < 20) score *= 0.5;
  return {
    score: Math.round(clamp(score)),
    detail: `${t.tf}: price ${price > ema50 ? 'above' : 'below'} EMA50${ema200 !== null ? (price > ema200 ? ' & above EMA200' : ' & vs EMA200 mixed') : ''}${adx14 !== null ? `, ADX ${adx14.toFixed(1)}` : ''}`,
  };
}

/** Momentum score from RSI (0.7) + MACD histogram sign (0.3) on 4h. */
function momentumScore(t: TfAnalysis): { score: number; detail: string } {
  const parts: string[] = [];
  let rsiPart = 0;
  if (t.rsi14 !== null) {
    rsiPart = clamp((t.rsi14 - 50) * 2.5);
    parts.push(`RSI ${t.rsi14.toFixed(1)}`);
  } else {
    parts.push('RSI n/a');
  }
  let macdPart = 0;
  if (t.macdHist !== null) {
    macdPart = clamp(Math.sign(t.macdHist) * 60);
    parts.push(`MACD hist ${t.macdHist > 0 ? '+' : ''}${t.macdHist.toPrecision(3)}`);
  }
  if (t.stochK !== null && t.stochD !== null) {
    parts.push(`StochRSI K ${t.stochK.toFixed(0)}/D ${t.stochD.toFixed(0)}`);
  }
  const score = Math.round(clamp(rsiPart * 0.7 + macdPart * 0.3));
  return { score, detail: `${t.tf}: ${parts.join(', ')}` };
}

/** Structure score from the setup timeframe (4h): trend + BOS. */
function structureScore(t: TfAnalysis): { score: number; detail: string } {
  const { trend, bos } = t.structure;
  let score = trend === 'UP' ? 90 : trend === 'DOWN' ? -90 : trend === 'RANGE' ? 0 : 0;
  if (bos === 'BULLISH') score += 30;
  if (bos === 'BEARISH') score -= 30;
  const parts = [`4h trend ${trend}`];
  if (bos) parts.push(`last BOS ${bos.toLowerCase()}`);
  return { score: Math.round(clamp(score)), detail: parts.join(', ') };
}

/** Cross-timeframe alignment: fraction of TFs pointing each way. */
function alignmentScore(timeframes: TfAnalysis[]): { score: number; detail: string } {
  if (timeframes.length === 0) return { score: 0, detail: 'no timeframes' };
  let bull = 0;
  let bear = 0;
  for (const t of timeframes) {
    const { price, ema50, ema200 } = t;
    const up = ema50 !== null && price > ema50 && (ema200 === null || ema50 > ema200 || price > ema200);
    const down = ema50 !== null && price < ema50 && (ema200 === null || ema50 < ema200 || price < ema200);
    if (up) bull++;
    else if (down) bear++;
  }
  const score = Math.round(clamp(((bull - bear) / timeframes.length) * 100));
  return { score, detail: `${bull} bullish vs ${bear} bearish of ${timeframes.length} timeframes` };
}

/** Volume confirmation from the setup timeframe's latest z-score + candle side. */
function volumeScore(t: TfAnalysis): { score: number; detail: string } {
  if (t.volumeZ === null) return { score: 0, detail: '4h volume baseline unavailable' };
  const capped = Math.min(t.volumeZ, 3);
  // Direction = side of the last closed candle's move vs previous close.
  const signed = Math.sign(t.macdHist ?? 0) || 0;
  const score = Math.round(clamp((capped / 3) * 100 * (signed === 0 ? 0 : Math.sign(signed))));
  return {
    score,
    detail: `4h volume z=${t.volumeZ.toFixed(1)}${t.volumeSpike ? ' (SPIKE)' : ''}`,
  };
}

/**
 * Score the multi-timeframe analysis. `setupTf` is the label whose
 * structure/momentum anchor the setup (default '4h').
 */
export function scoreSignal(
  timeframes: TfAnalysis[],
  weights: SignalWeights = DEFAULT_WEIGHTS,
  setupTf = '4h'
): ScoreBreakdown {
  const setup = timeframes.find((t) => t.tf === setupTf) ?? timeframes[Math.floor(timeframes.length / 2)];
  const higher = timeframes.filter((t) => t.tf === '1d' || t.tf === setupTf);

  // Trend: average of the higher-timeframe trend readings (1d bias + setup).
  const trendParts = higher.map(trendScore);
  const trendAvg = trendParts.length
    ? Math.round(trendParts.reduce((a, p) => a + p.score, 0) / trendParts.length)
    : 0;

  const structurePart = setup ? structureScore(setup) : { score: 0, detail: 'no setup tf' };
  const momentumPart = setup ? momentumScore(setup) : { score: 0, detail: 'no setup tf' };
  const alignmentPart = alignmentScore(timeframes);
  const volumePart = setup ? volumeScore(setup) : { score: 0, detail: 'no setup tf' };

  const groups: ScoreGroup[] = [
    {
      name: 'trend',
      score: trendAvg,
      weight: weights.trend,
      detail: trendParts.map((p) => p.detail).join(' + ') || 'n/a',
    },
    { name: 'structure', score: structurePart.score, weight: weights.structure, detail: structurePart.detail },
    { name: 'momentum', score: momentumPart.score, weight: weights.momentum, detail: momentumPart.detail },
    { name: 'alignment', score: alignmentPart.score, weight: weights.alignment, detail: alignmentPart.detail },
    { name: 'volume', score: volumePart.score, weight: weights.volume, detail: volumePart.detail },
  ];

  const total = Math.round(
    groups.reduce((sum, g) => sum + g.score * g.weight, 0)
  );
  const sign = Math.sign(total);
  const agreeing = groups.filter(
    (g) => Math.sign(g.score) === sign && Math.abs(g.score) >= MIN_GROUP_MAGNITUDE
  );

  const noTradeReasons: string[] = [];
  if (Math.abs(total) < MIN_TOTAL) {
    noTradeReasons.push(`confluence total ${total} is below the ${MIN_TOTAL} threshold`);
  }
  if (agreeing.length < REQUIRED_AGREEING_GROUPS) {
    noTradeReasons.push(
      `only ${agreeing.length}/${groups.length} factor groups agree (need ≥ ${REQUIRED_AGREEING_GROUPS})`
    );
  }

  const direction =
    noTradeReasons.length === 0 ? (total > 0 ? 'LONG' : 'SHORT') : 'NO_TRADE';

  return {
    groups,
    total,
    confidence: Math.min(100, Math.abs(total)),
    direction,
    agreeingGroups: agreeing.length,
    requiredAgreeingGroups: REQUIRED_AGREEING_GROUPS,
    noTradeReasons,
  };
}
