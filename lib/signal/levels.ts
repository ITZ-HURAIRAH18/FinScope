import type { Direction, TakeProfit, TradePlan } from './types';

/**
 * Trade-plan construction from REAL structure + ATR — pure (unit-tested).
 *
 * Rules (adapted from spec §5, deterministic — no AI, no random %):
 * - Stop loss sits beyond structure with an ATR buffer, clamped to
 *   [0.8×ATR, 3×ATR] from entry so a too-close level isn't noise and a
 *   too-far level isn't suicidal.
 * - TP1–TP3 prefer real structure levels (swing highs/lows from structure.ts)
 *   and fall back to 1.5/2.5/4×ATR when structure is thin. Positions close
 *   40/30/30; R:R is reported per TP and the plan's headline R:R is to TP2.
 * - Duration derives from ATR% (volatility), with a time-based invalidation.
 * - A NO_TRADE plan keeps direction='NO_TRADE' and only the
 *   `validAgainWhen` text (engine fills it from scoring reasons).
 */

const TP_ATR_MULTIPLES = [1.5, 2.5, 4];
const CLOSE_PCTS = [40, 30, 30];

/** ATR% → expected trade style (crypto heuristic; documented, not backtested). */
function durationFromAtrPct(atrPct: number): { duration: TradePlan['duration']; hours: number } {
  if (atrPct >= 0.03) return { duration: 'scalp', hours: 6 };
  if (atrPct >= 0.01) return { duration: 'intraday', hours: 24 };
  return { duration: 'swing', hours: 72 };
}

export interface PlanInput {
  direction: 'LONG' | 'SHORT';
  /** Current price (entry reference). */
  price: number;
  /** ATR of the setup timeframe; null ⇒ plan cannot be built honestly. */
  atr: number | null;
  /** Structure levels from the setup timeframe. */
  support: number | null;
  resistance: number | null;
  /** Real swing levels beyond price, nearest-first (TP candidates). */
  targets: number[];
  /** Setup timeframe label used in the invalidation text (e.g. '4h'). */
  setupTf: string;
}

export function buildTradePlan(input: PlanInput): TradePlan {
  const { direction, price, atr, setupTf } = input;
  const long = direction === 'LONG';
  const structureLevel = long ? input.support : input.resistance;

  if (atr === null || !(atr > 0) || !(price > 0)) {
    // Honest degradation: no ATR ⇒ no fabricated levels.
    return {
      direction: 'NO_TRADE',
      entryType: 'market',
      entryPrice: null,
      entryZone: null,
      stopLoss: null,
      stopLossAtrMultiple: null,
      takeProfits: [],
      riskReward: null,
      duration: null,
      timeInvalidationHours: null,
      invalidation: null,
      breakevenRule: 'n/a',
      validAgainWhen: 'ATR could not be computed for the setup timeframe — retry shortly.',
    };
  }

  // --- Stop loss: beyond structure + 0.5 ATR buffer, clamped [0.8, 3] × ATR.
  let sl = structureLevel !== null
    ? structureLevel - (long ? 1 : -1) * 0.5 * atr
    : price - (long ? 1 : -1) * 1.5 * atr;
  let dist = Math.abs(price - sl);
  const minDist = 0.8 * atr;
  const maxDist = 3 * atr;
  if (dist < minDist || dist > maxDist) {
    dist = Math.min(Math.max(dist, minDist), maxDist);
    sl = price - (long ? 1 : -1) * dist;
  }
  const slMultiple = dist / atr;

  // --- Entry: market, or a limit zone at a retest of nearby structure.
  let entryType: TradePlan['entryType'] = 'market';
  let entryPrice: number | null = price;
  let entryZone: [number, number] | null = null;
  if (structureLevel !== null) {
    const retestDistance = Math.abs(price - structureLevel);
    if (retestDistance >= 0.3 * atr && retestDistance <= 2 * atr) {
      entryType = 'limit-zone';
      const zoneA = structureLevel;
      const zoneB = structureLevel + (long ? 1 : -1) * 0.3 * atr;
      entryZone = [Math.min(zoneA, zoneB), Math.max(zoneA, zoneB)];
      entryPrice = (entryZone[0] + entryZone[1]) / 2;
    }
  }

  // --- TP1–3: real structure first, ATR fallback, deduplicated.
  const needed = TP_ATR_MULTIPLES.map((m) => price + (long ? 1 : -1) * m * atr);
  const chosen: number[] = [];
  for (const level of input.targets) {
    const valid = long ? level > price + 0.3 * atr : level < price - 0.3 * atr;
    if (!valid) continue;
    if (chosen.every((c) => Math.abs(c - level) > 0.2 * atr)) chosen.push(level);
    if (chosen.length === 3) break;
  }
  for (const fallback of needed) {
    if (chosen.length === 3) break;
    if (chosen.every((c) => Math.abs(c - fallback) > 0.2 * atr)) chosen.push(fallback);
  }
  chosen.sort((a, b) => (long ? a - b : b - a)); // nearest first

  // Risk is measured from the ACTUAL entry (limit-zone entries sit closer to
  // the stop than current price does) — must match the position-sizer math.
  const entryRef = entryPrice ?? price;
  const riskFromEntry = Math.abs(entryRef - sl);
  const takeProfits: TakeProfit[] = chosen.slice(0, 3).map((tp, i) => ({
    price: tp,
    rr: riskFromEntry > 0 ? Math.abs(tp - entryRef) / riskFromEntry : 0,
    closePct: CLOSE_PCTS[i],
  }));

  const rr2 = takeProfits[1]?.rr ?? takeProfits[0]?.rr ?? null;
  const { duration, hours } = durationFromAtrPct(atr / price);

  return {
    direction,
    entryType,
    entryPrice,
    entryZone,
    stopLoss: sl,
    stopLossAtrMultiple: Number(slMultiple.toFixed(2)),
    takeProfits,
    riskReward: rr2 !== null ? Number(rr2.toFixed(2)) : null,
    duration,
    timeInvalidationHours: hours,
    invalidation:
      `Close ${long ? 'below' : 'above'} ${sl.toFixed(price < 10 ? 6 : 2)} on ${setupTf} ` +
      `(structure + ATR buffer) invalidates the idea.`,
    breakevenRule:
      'Move stop loss to entry after TP1 (40% of position) is hit — the trade then risks nothing.',
    validAgainWhen: null,
  };
}

/** NO_TRADE placeholder with the given reasons turned into a condition. */
export function noTradePlan(reasons: string[]): TradePlan {
  return {
    direction: 'NO_TRADE',
    entryType: 'market',
    entryPrice: null,
    entryZone: null,
    stopLoss: null,
    stopLossAtrMultiple: null,
    takeProfits: [],
    riskReward: null,
    duration: null,
    timeInvalidationHours: null,
    invalidation: null,
    breakevenRule: 'n/a',
    validAgainWhen:
      reasons.length > 0
        ? `Currently blocked: ${reasons.join(' | ')}`
        : 'Confluence is too weak right now — wait for the factor groups to align.',
  };
}
