/**
 * Deterministic signal-engine types (docs/SIGNAL-AGENT-PLAN.md phase 1).
 *
 * Everything in this module tree is COMPUTED IN CODE from real Binance
 * candles — the LLM (lib/market-agent.ts) only narrates these structures and
 * may never invent a value that isn't here.
 */

export type TrendDir = 'UP' | 'DOWN' | 'RANGE' | 'UNKNOWN';
export type Regime = 'TRENDING' | 'RANGING' | 'HIGH_VOLATILITY';
export type Direction = 'LONG' | 'SHORT' | 'NO_TRADE';

export interface CandlePattern {
  /** Display name, e.g. "Bullish Engulfing". */
  name: string;
  direction: 'bullish' | 'bearish' | 'neutral';
}

export interface StructureSnapshot {
  trend: TrendDir;
  /** Nearest swing low strictly below price (support), null when unknown. */
  support: number | null;
  /** Nearest swing high strictly above price (resistance), null when unknown. */
  resistance: number | null;
  /** Most recent break of structure, null when none in the loaded window. */
  bos: 'BULLISH' | 'BEARISH' | null;
  swingHighCount: number;
  swingLowCount: number;
}

export interface TfAnalysis {
  tf: string; // '15m' | '1h' | '4h' | '1d'
  price: number;
  candleCount: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macdHist: number | null;
  atr14: number | null;
  /** ATR as a fraction of price (0.015 = 1.5%) — volatility basis. */
  atrPct: number | null;
  adx14: number | null;
  plusDi: number | null;
  minusDi: number | null;
  stochK: number | null;
  stochD: number | null;
  /** Latest volume z-score vs prior 20 bars (null when unavailable). */
  volumeZ: number | null;
  /** Volume-spike flag: z ≥ 2.5. */
  volumeSpike: boolean;
  /** OBV slope over the last ~20 bars — accumulation vs distribution. */
  obvTrend: 'RISING' | 'FALLING' | 'FLAT' | null;
  structure: StructureSnapshot;
  regime: Regime;
  /** Pattern on the LAST CLOSED candle (the forming bar is excluded). */
  lastPattern: CandlePattern | null;
}

export interface ScoreGroup {
  name: 'trend' | 'structure' | 'momentum' | 'alignment' | 'volume';
  /** −100 (strong bear) … +100 (strong bull). */
  score: number;
  weight: number;
  detail: string;
}

export interface ScoreBreakdown {
  groups: ScoreGroup[];
  /** Weighted total, −100…+100. */
  total: number;
  /** 0–100 evidence strength (NOT a profit probability). */
  confidence: number;
  direction: Direction;
  /** Factor groups whose sign agrees with the direction and |score| ≥ 40. */
  agreeingGroups: number;
  /** Minimum required agreeing groups (spec §4: ≥ 4 independent groups). */
  requiredAgreeingGroups: number;
  /** Human-readable reasons a signal was withheld (empty when trading). */
  noTradeReasons: string[];
}

export interface TakeProfit {
  price: number;
  /** Risk:Reward measured from entry to this TP. */
  rr: number;
  /** % of the position to close here (40/30/30). */
  closePct: number;
}

export interface TradePlan {
  direction: Direction;
  entryType: 'market' | 'limit-zone';
  entryPrice: number | null;
  /** [low, high] of the limit zone when entryType is limit-zone. */
  entryZone: [number, number] | null;
  stopLoss: number | null;
  /** SL distance expressed in ATR multiples (transparency). */
  stopLossAtrMultiple: number | null;
  takeProfits: TakeProfit[];
  /** R:R to TP2 (the plan's primary target). */
  riskReward: number | null;
  duration: 'scalp' | 'intraday' | 'swing' | null;
  /** Time-based cancellation if the trade hasn't triggered. */
  timeInvalidationHours: number | null;
  invalidation: string | null;
  breakevenRule: string;
  /** What price action would make a NO_TRADE valid later. */
  validAgainWhen: string | null;
}

export interface SignalAnalysis {
  symbol: string;
  source: string;
  generatedAt: string;
  /** Freshest close (15m timeframe). */
  price: number;
  timeframes: Record<string, TfAnalysis>;
  scoring: ScoreBreakdown;
  plan: TradePlan;
  weightsVersion: string;
  caveats: string[];
}
