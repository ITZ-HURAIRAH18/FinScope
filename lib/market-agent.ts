import {
  coingecko,
  coinIdForSymbol,
  SYMBOL_TO_COINGECKO,
  UpstreamError,
} from '@/lib/coingecko';
import { binancePair, fetchBinanceKlines } from '@/lib/binance-rest';
import { generateText, GeminiError } from '@/lib/gemini';
import { bollinger, last, macd, rsi, sma } from '@/lib/indicators';
import { getSignal, SETUP_TF, TF_DAY_RANGES } from '@/lib/signal/engine';
import type { SignalAnalysis, TfAnalysis } from '@/lib/signal/types';

/**
 * AI explanation layer over the deterministic signal engine
 * (docs/SIGNAL-AGENT-PLAN.md).
 *
 * Division of labor (spec §8):
 * - lib/signal/* COMPUTES everything: multi-timeframe indicators, structure,
 *   confluence score, and the trade plan (entry/SL/TP/RR). Pure, unit-tested,
 *   no AI involved.
 * - This module feeds that JSON to Gemini gemini-2.5-flash and renders the
 *   answer as a formatted, bilingual "Trading Guru" analysis. The model may
 *   NEVER introduce a number that isn't in the engine output; when engine
 *   data is unavailable it must say so instead of guessing.
 * - If the engine's data path fails entirely, a lightweight real-candle
 *   context (CoinGecko-backed) keeps chat functional in degraded mode —
 *   clearly labelled, with no fabricated levels.
 *
 * Pure parts (buildMarketContext, normalizeSymbol, validatePrediction,
 * parsePredictionJson, looksRomanUrdu) are unit-tested in market-agent.test.ts.
 */

/** [timeMs, open, high, low, close, volume|null] — same shape as /api/crypto-chart. */
export type Candle = [number, number, number, number, number, number | null];

export type Bias = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface Prediction {
  bias: Bias;
  confidence: number; // 0–100, evidence strength only — never a guarantee
  summary: string; // 3–5 easy sentences (language mirrors the user)
  reasons: string[];
  risks: string[];
}

export interface IndicatorSnapshot {
  price: number;
  change24hPct: number | null;
  windowChangePct: number | null;
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  macdHist: number | null;
  bollingerLower: number | null;
  bollingerUpper: number | null;
  windowHigh: number;
  windowLow: number;
}

export interface MarketContext {
  symbol: string;
  source: string;
  candleCount: number;
  intervalSec: number | null;
  windowStartMs: number;
  windowEndMs: number;
  fetchedAtMs: number;
  stale: boolean;
  indicators: IndicatorSnapshot;
  /** Grounded text block handed to Gemini (numbers labelled calculated vs provider). */
  text: string;
}

/* -------------------------------------------------------------------------- */
/* Symbol handling                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Normalize user input ('btc', 'BTCUSDT', '$eth ') to a supported base
 * symbol, or null when the coin isn't in FinScope's universe.
 */
export function normalizeSymbol(input: string): string | null {
  const cleaned = input.trim().replace(/^\$/, '').replace(/USDT$/i, '').toUpperCase();
  return SYMBOL_TO_COINGECKO[cleaned] ? cleaned : null;
}

/** Supported symbol list for error messages. */
export function supportedSymbols(): string[] {
  return Object.keys(SYMBOL_TO_COINGECKO);
}

/* -------------------------------------------------------------------------- */
/* Lightweight context (degraded-mode fallback when the engine path fails)     */
/* -------------------------------------------------------------------------- */

interface FetchedCandles {
  candles: Candle[];
  source: string;
  fetchedAtMs: number;
  stale: boolean;
}

const AGENT_RANGE_DAYS = 90;
const AGENT_INTERVAL = '4h';

/**
 * Fetch ~90 days of REAL candles for a coin.
 * Primary: Binance klines (4h). Fallback: CoinGecko OHLC (90d).
 */
async function fetchAgentCandles(base: string): Promise<FetchedCandles> {
  const coinId = coinIdForSymbol(base);
  if (!coinId) throw new UpstreamError(`Unsupported symbol: ${base}`, 400);

  try {
    const klines = await fetchBinanceKlines(binancePair(base), AGENT_INTERVAL, AGENT_RANGE_DAYS);
    const rangeStartMs = Date.now() - AGENT_RANGE_DAYS * 86_400_000;

    const candles: Candle[] = [];
    for (const k of klines.data) {
      const timeMs = Number(k[0]);
      const close = Number(k[4]);
      if (!Number.isFinite(timeMs) || !Number.isFinite(close) || timeMs < rangeStartMs) continue;
      const volume = Number(k[5]);
      candles.push([timeMs, Number(k[1]), Number(k[2]), Number(k[3]), close, Number.isFinite(volume) ? volume : null]);
    }
    if (candles.length > 0) {
      return { candles, source: 'Binance klines (real exchange data)', fetchedAtMs: klines.fetchedAt, stale: klines.stale };
    }
    throw new UpstreamError(`Binance returned no klines in range for ${base}`, 404);
  } catch (binanceError) {
    console.warn(
      `[Market Agent] Binance unavailable for ${base} (${(binanceError as Error)?.message}); falling back to CoinGecko OHLC`
    );
  }

  const ohlc = await coingecko.ohlc(coinId, AGENT_RANGE_DAYS);
  const candles: Candle[] = (ohlc.data ?? []).map((c) => [c[0], c[1], c[2], c[3], c[4], null]);
  if (candles.length === 0) {
    throw new UpstreamError(`No chart data available for ${base}`, 404);
  }
  return { candles, source: 'CoinGecko OHLC (provider data)', fetchedAtMs: ohlc.fetchedAt, stale: ohlc.stale };
}

/* -------------------------------------------------------------------------- */
/* Pure context building (unit-tested; degraded mode)                         */
/* -------------------------------------------------------------------------- */

const fmtNum = (n: number | null): string =>
  n !== null && Number.isFinite(n) ? String(Number(n.toPrecision(6))) : 'n/a';
const fmtPct = (n: number | null): string => (n === null ? 'n/a' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);

/**
 * Compute the indicator snapshot + grounded text block from real candles.
 * Pure: no network, no randomness — same input ⇒ same output.
 * Used when the signal engine cannot run (upstream outage) so the AI still
 * has honest, real data — just without structure/plan levels.
 */
export function buildMarketContext(
  symbol: string,
  candles: Candle[],
  meta: { source: string; fetchedAtMs: number; stale?: boolean; candleIntervalSec?: number | null }
): MarketContext {
  if (candles.length === 0) throw new Error('buildMarketContext: no candles');

  const closes = candles.map((c) => c[4]);
  const highs = candles.map((c) => c[2]);
  const lows = candles.map((c) => c[3]);

  const price = last(closes) as number;
  const rsi14 = last(rsi(closes, 14).rsi);
  const sma20 = last(sma(closes, 20));
  const sma50 = last(sma(closes, 50));
  const macdHist = last(macd(closes).histogram);
  const bb = bollinger(closes, 20, 2);
  const bbLower = last(bb.lower);
  const bbUpper = last(bb.upper);

  const spacingSec =
    meta.candleIntervalSec ??
    (candles.length > 1 ? Math.round((candles[1][0] - candles[0][0]) / 1000) : null);

  // ~24h change from the actual candle spacing (null when the window is too short).
  let change24hPct: number | null = null;
  if (spacingSec && spacingSec > 0) {
    const back = Math.round(86_400 / spacingSec);
    const idx = closes.length - 1 - back;
    if (idx >= 0 && closes[idx] !== 0) {
      change24hPct = ((price - closes[idx]) / closes[idx]) * 100;
    }
  }

  // Full-window change computed directly (first vs last close).
  const firstClose = closes[0];
  const windowChangePct = firstClose !== 0 ? ((price - firstClose) / firstClose) * 100 : null;

  const windowStartMs = candles[0][0];
  const windowEndMs = candles[candles.length - 1][0];

  const indicators: IndicatorSnapshot = {
    price,
    change24hPct,
    windowChangePct,
    rsi14,
    sma20,
    sma50,
    macdHist,
    bollingerLower: bbLower,
    bollingerUpper: bbUpper,
    windowHigh: Math.max(...highs),
    windowLow: Math.min(...lows),
  };

  const iso = (ms: number) => new Date(ms).toISOString();
  const intervalLabel = spacingSec ? `${spacingSec >= 3600 ? spacingSec / 3600 + 'h' : spacingSec / 60 + 'm'}` : 'unknown';

  const text = [
    `SYMBOL: ${symbol}`,
    `Provider: ${meta.source}`,
    `Fetched: ${iso(meta.fetchedAtMs)} (stale: ${meta.stale ? 'true' : 'false'})`,
    `Window: ${iso(windowStartMs)} → ${iso(windowEndMs)}, ${candles.length} candles @ ${intervalLabel}`,
    `Last close: ${fmtNum(price)}`,
    `Window high / low: ${fmtNum(indicators.windowHigh)} / ${fmtNum(indicators.windowLow)}`,
    `~24h change (calculated): ${fmtPct(change24hPct)}`,
    `Full-window change (calculated): ${fmtPct(windowChangePct)}`,
    `RSI-14 Wilder (calculated): ${rsi14 === null ? 'n/a' : rsi14.toFixed(1)}`,
    `SMA-20 / SMA-50 (calculated): ${fmtNum(sma20)} / ${fmtNum(sma50)}`,
    `MACD 12/26/9 histogram (calculated): ${fmtNum(macdHist)}`,
    `Bollinger 20/2σ lower–upper (calculated): ${fmtNum(bbLower)} – ${fmtNum(bbUpper)}`,
  ].join('\n');

  return {
    symbol,
    source: meta.source,
    candleCount: candles.length,
    intervalSec: spacingSec,
    windowStartMs,
    windowEndMs,
    fetchedAtMs: meta.fetchedAtMs,
    stale: Boolean(meta.stale),
    indicators,
    text,
  };
}

/* -------------------------------------------------------------------------- */
/* Language mirroring (bilingual product requirement)                         */
/* -------------------------------------------------------------------------- */

const STRONG_URDU = /\b(kya|batao|bata|bataye|mujhe|chahiye|kyun|kyu|kaise|kaisa|theek|nahi|krna|karna|karu|karo|bataen)\b/i;
const URDU_HINTS = [
  'hai', 'hain', 'kahta', 'chahta', 'chah', 'mera', 'meri', 'mere', 'tum', 'aap',
  'abhi', 'raha', 'rahi', 'hota', 'hoti', 'kitna', 'kitni', 'zyada', 'zayada',
  'thoda', 'bhai', 'yaar', 'kro', 'pta', 'kaunsa', 'kaunsi', 'galat', 'sahi',
  'acha', 'achha', 'dikha', 'dekh', 'lena', 'dena', 'lunga', 'loonga', 'ma',
  'randha', 'sabse', 'nuksan', 'fayda', 'zaroorat', 'karta', 'karti', 'kare',
];

/**
 * Heuristic language mirror: Roman-Urdu inputs get Roman-Urdu answers,
 * English inputs get English. One unambiguous marker or two hints wins.
 */
export function looksRomanUrdu(text: string): boolean {
  if (STRONG_URDU.test(text)) return true;
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  let hits = 0;
  for (const w of words) {
    if (URDU_HINTS.includes(w)) {
      hits++;
      if (hits >= 2) return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Engine serialization for the model                                         */
/* -------------------------------------------------------------------------- */

const r2 = (n: number | null | undefined, d = 2): string =>
  n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : n.toFixed(d);

function tfLine(t: TfAnalysis): string {
  const s = t.structure;
  return (
    `  ${t.tf}: price=${r2(t.price, t.price < 10 ? 6 : 2)}, EMA20/50/200=${r2(t.ema20)}/${r2(t.ema50)}/${r2(t.ema200)}, ` +
    `RSI=${r2(t.rsi14, 1)}, MACDh=${r2(t.macdHist, 3)}, ATR=${r2(t.atr14)} (${r2((t.atrPct ?? 0) * 100, 2)}%), ` +
    `ADX=${r2(t.adx14, 1)} DI+/−=${r2(t.plusDi, 1)}/${r2(t.minusDi, 1)}, StochRSI K/D=${r2(t.stochK, 0)}/${r2(t.stochD, 0)}, ` +
    `volZ=${r2(t.volumeZ, 1)}${t.volumeSpike ? ' SPIKE' : ''}, OBV=${t.obvTrend ?? 'n/a'}, ` +
    `trend=${s.trend}, BOS=${s.bos ?? 'none'}, S/R=${r2(s.support)}/${r2(s.resistance)}, ` +
    `regime=${t.regime}${t.lastPattern ? `, pattern=${t.lastPattern.name}` : ''}`
  );
}

/** Compact, unambiguous engine dump for the LLM (only source of numbers). */
export function serializeEngine(a: SignalAnalysis): string {
  const p = a.plan;
  const planLines =
    p.direction === 'NO_TRADE' && p.stopLoss === null
      ? `  direction=NO_TRADE; no entry/SL/TP qualify right now. Valid again when: ${p.validAgainWhen ?? 'confluence aligns'}`
      : [
          `  direction=${p.direction}${p.direction === 'NO_TRADE' ? ' (levels shown are what WOULD qualify)' : ''}`,
          `  entry=${p.entryType}${p.entryPrice !== null ? ` @ ${r2(p.entryPrice)}` : ''}` +
            (p.entryZone ? ` (zone ${r2(p.entryZone[0])}–${r2(p.entryZone[1])})` : ''),
          `  stopLoss=${r2(p.stopLoss)} (${p.stopLossAtrMultiple} × ATR)`,
          ...p.takeProfits.map((tp, i) => `  TP${i + 1}=${r2(tp.price)} (RR ${tp.rr}, close ${tp.closePct}%)`),
          `  headline R:R=${p.riskReward ?? 'n/a'}, duration=${p.duration ?? 'n/a'}, time-invalidation=${p.timeInvalidationHours ?? 'n/a'}h`,
          `  invalidation: ${p.invalidation ?? 'n/a'}`,
          `  breakeven: ${p.breakevenRule}`,
          p.validAgainWhen ? `  note: ${p.validAgainWhen}` : '',
        ].filter(Boolean).join('\n');

  return [
    `SIGNAL ENGINE OUTPUT (deterministic — computed in code from real Binance candles; this block is the ONLY source of numbers):`,
    `symbol=${a.symbol} price=${r2(a.price, a.price < 10 ? 6 : 2)} generated=${a.generatedAt} source=${a.source}`,
    `weights=${a.weightsVersion}`,
    `timeframes:`,
    ...['1d', '4h', '1h', '15m'].filter((tf) => a.timeframes[tf]).map((tf) => tfLine(a.timeframes[tf])),
    `scoring: total=${a.scoring.total}/±100, direction=${a.scoring.direction}, evidence-confidence=${a.scoring.confidence}/100, ` +
      `agreeing-groups=${a.scoring.agreeingGroups} (need ≥${a.scoring.requiredAgreeingGroups})`,
    `factor groups: ${a.scoring.groups.map((g) => `${g.name}=${g.score}×${g.weight}`).join(', ')}`,
    a.scoring.noTradeReasons.length ? `no-trade reasons: ${a.scoring.noTradeReasons.join('; ')}` : 'no-trade reasons: none',
    `trade plan:`,
    planLines,
    `caveats: ${a.caveats.join(' / ')}`,
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/* Honest system prompts                                                      */
/* -------------------------------------------------------------------------- */

const SYSTEM_RULES = `CORE HONESTY RULES — these override everything else:
1. Sirf aur sirf jo DATA block diya hai wahi numbers use karo. Koi bhi price, indicator, level, percentage apne se mat banao. Data me na ho to likho "ye data me nahi hai".
2. Kabhi profit ka wada mat karo: "guaranteed", "100%", "confirmed", "pakka" bilkul nahi. Predictions probabilistic hain — markets ulta bhi ho sakte hain.
3. Ye FINANCIAL ADVICE NAHI hai (paper-trading app). Har jawab ke end me chhota disclaimer do.
4. Confidence/evidence 0–100 hai — profit ki guarantee kabhi nahi. Engine ki evidence-confidence se zyada kabhi mat dikhao.
5. Jab engine NO_TRADE kahe to tum usse LONG/SHORT nahi bana sakte — gate wajah batao aur kya valid karega batao.
6. Data missing/delayed ho to saaf kaho — chhupa mat karo. Provider data aur (calculated) labels ki pabandi karo.`;

const LANGUAGE_RULES = `LANGUAGE:
- Apni zubaan USER ki zubaan ke mutabiq rakho: user Roman Urdu likhe to poora Roman Urdu jawab (English trading terms theek hain); user English likhe to English jawab.`;

const FORMAT_RULES = `FORMAT (har coin/trade sawal ke liye — markdown, bilkul structured):
**📊 TREND** — 1D/4H/1H readings engine ke numbers ke saath
**🧭 SETUP / STRUCTURE** — HH/HL ya LH/LL, BOS, support/resistance, regime, candle patterns
**🎯 VERDICT** — LONG / SHORT / WAIT (NO TRADE) — engine scoring.direction ke mutabiq; agar NO_TRADE to kaunsa gate fail hai aur kya ise valid karega
**📍 ENTRY** — market ya zone, exact number ke saath
**🛑 STOP LOSS** — exact price + ATR multiple + kis structure ke peeche hai
**🎯 TAKE PROFIT** — TP1/TP2/TP3: price, R:R, kitna % close, breakeven rule
**⏱ DURATION** — scalp/intraday/swing + time invalidation
**⚠ RISK & ALTERNATIVE** — idea kaise cancel hoga; agar price ulta chala to kya
Short bullet lines, blank lines ke saath — taa ke user ko padhne me aasani ho.
Sawal concept ka ho (jaise "RSI kya hai") to chhota jawab do, lekin phir bhi **bold labels** ke saath.
Har jawab END karega ek disclaimer line se (Roman Urdu ya English — jawab ki zubaan me).`;

const GURU_SYSTEM = `You are "FinScope Trading Guru" — a senior trading analyst inside FinScope, a real-time PAPER-TRADING (virtual money) crypto dashboard. You are NOT a casual chatbot: every trade-related answer is a complete, properly formatted analysis built ONLY from the deterministic signal-engine data block provided with each message.

${SYSTEM_RULES}

${LANGUAGE_RULES}

${FORMAT_RULES}`;

const PREDICTION_SYSTEM = `You are FinScope AI, the prediction module of FinScope — a real-time PAPER-TRADING (virtual money) crypto dashboard. You receive the deterministic signal-engine output and return ONE honest structured prediction that explains it.

${SYSTEM_RULES}

${LANGUAGE_RULES}

You respond ONLY with the JSON schema the task message specifies — no extra text, no markdown fences. summary must be 3–5 easy sentences in the SAME language family as the engine-facing task (default Roman Urdu) that walk through trend → verdict → why, ending with a "this can be wrong" note.`;

const NO_DATA_BLOCK = `LIVE DATA: (is turn ke liye koi live market data nahi diya gaya)
Rule: koi bhi price ya indicator value quote mat karo — kehdo ke live numbers abhi available nahi hain. Concepts samjha sakte ho.`;

/* -------------------------------------------------------------------------- */
/* Prediction validation (pure, unit-tested)                                  */
/* -------------------------------------------------------------------------- */

const BIASES = new Set<Bias>(['LONG', 'SHORT', 'NEUTRAL']);

function cleanStringArray(value: unknown, maxItems: number, maxLen: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const items: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const s = raw.trim().slice(0, maxLen);
    if (s) items.push(s);
    if (items.length >= maxItems) break;
  }
  return items.length > 0 ? items : null;
}

/** Validate/coerce a model-produced prediction object; null when unusable. */
export function validatePrediction(raw: unknown): Prediction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const bias = o.bias as Bias;
  if (!BIASES.has(bias)) return null;

  const confidenceRaw = Number(o.confidence);
  if (!Number.isFinite(confidenceRaw)) return null;
  const confidence = Math.min(100, Math.max(0, Math.round(confidenceRaw)));

  const summary = typeof o.summary === 'string' ? o.summary.trim().slice(0, 900) : '';
  if (!summary) return null;

  const reasons = cleanStringArray(o.reasons, 5, 240);
  const risks = cleanStringArray(o.risks, 4, 240);
  if (!reasons || !risks) return null;

  return { bias, confidence, summary, reasons, risks };
}

/** Parse Gemini's JSON reply (tolerating fences/prose); null when unusable. */
export function parsePredictionJson(text: string): Prediction | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const direct = validatePrediction(JSON.parse(stripped));
    if (direct) return direct;
  } catch {
    /* fall through to object extraction */
  }
  // JSON mode is usually strict, but tolerate a model that wraps the object
  // in a sentence: take the first balanced {...} block.
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return validatePrediction(JSON.parse(stripped.slice(start, end + 1)));
    } catch {
      return null;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Generation with one retry (live testing saw rare format/truncation fails)   */
/* -------------------------------------------------------------------------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateWithRetry(opts: Parameters<typeof generateText>[0]): Promise<string> {
  try {
    return await generateText(opts);
  } catch (err) {
    const retryable =
      err instanceof GeminiError &&
      err.status === 502 &&
      /(truncated|format|empty content)/i.test(err.message);
    if (!retryable) throw err;
    console.warn(`[Market Agent] Retrying Gemini call once after: ${err.message}`);
    await sleep(900);
    return generateText(opts);
  }
}

/* -------------------------------------------------------------------------- */
/* Data acquisition: engine first, lightweight context as degraded fallback   */
/* -------------------------------------------------------------------------- */

interface AgentData {
  engine: SignalAnalysis | null;
  light: MarketContext | null;
  dataBlock: string;
}

async function gatherData(symbol: string): Promise<AgentData> {
  try {
    const engine = await getSignal(symbol);
    return { engine, light: null, dataBlock: serializeEngine(engine) };
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 500;
    console.warn(`[Market Agent] Signal engine unavailable for ${symbol} (status ${status}); using lightweight context`);
    const fetched = await fetchAgentCandles(symbol); // may throw → bubbles to route
    const ctx = buildMarketContext(symbol, fetched.candles, {
      source: fetched.source,
      fetchedAtMs: fetched.fetchedAtMs,
      stale: fetched.stale,
    });
    return {
      engine: null,
      light: ctx,
      dataBlock:
        `LIGHTWEIGHT DATA (engine unavailable — structure/plan levels NOT computed, do not invent any):\n${ctx.text}`,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Prediction (with short cache to protect Gemini quota)                      */
/* -------------------------------------------------------------------------- */

const PREDICT_TTL_MS = 60_000;
const CACHE_MAX = 100;
const predictCache = new Map<string, { at: number; value: PredictResult }>();

export interface PredictResult {
  symbol: string;
  /** null when the AI layer failed — engine-only result (see aiError). */
  prediction: Prediction | null;
  /** True when only deterministic engine data is shown (AI unavailable). */
  engineOnly: boolean;
  aiError: string | null;
  /** Deterministic engine output for the card (null in degraded mode). */
  engine: Pick<SignalAnalysis, 'scoring' | 'plan' | 'weightsVersion' | 'caveats'> | null;
  indicators: {
    price: number;
    rsi14: number | null;
    adx14: number | null;
    atrPct: number | null;
    ema50: number | null;
    ema200: number | null;
    regime: string | null;
  };
  data: {
    source: string;
    candleCount: number;
    windowStart: string;
    windowEnd: string;
    fetchedAt: string;
    stale: boolean;
    /** True when the deterministic engine was unavailable (no plan levels). */
    degraded: boolean;
  };
  generatedAt: string;
  cached: boolean;
}

function buildPredictionPrompt(symbol: string, dataBlock: string, engine: SignalAnalysis | null): string {
  const biasRule = engine
    ? `Engine scoring.direction = ${engine.scoring.direction} (evidence-confidence ${engine.scoring.confidence}). bias MUST match it (LONG/SHORT/NEUTRAL — engine NO_TRADE ⇒ NEUTRAL), and confidence must NOT exceed the engine's evidence-confidence. If you truly disagree, answer NEUTRAL with lower confidence and explain why in reasons.`
    : `Engine data is unavailable — bias must be NEUTRAL and confidence ≤ 45, with reasons explaining the missing data.`;

  return `${dataBlock}

TASK: Based ONLY on the data above, produce one honest trading read for ${symbol} in this exact JSON schema:
{
  "bias": "LONG" | "SHORT" | "NEUTRAL",
  "confidence": <integer 0-100>,
  "summary": "<3-5 easy Roman Urdu sentences: TREND kaisa hai → engine ka VERDICT → entry/SL/TP level mention → ke ye galat bhi ho sakta hai>",
  "reasons": ["<Roman Urdu wajah jo DATA ke kisi asal number se judi ho>", ... 2 to 5],
  "risks": ["<Roman Urdu khatra / kya hone par ye galat sabit hoga>", ... 2 to 4]
}
Bias rule: ${biasRule}
Har reason/ risk DATA ke actual number se juda ho. Koi profit promise nahi. JSON ke ilawa kuch nahi likhna.`;
}

/**
 * Generate (or serve cached) an honest prediction for a coin.
 * Requires a configured GEMINI_API_KEY (throws GeminiError 503 otherwise).
 */
export async function predictSignal(base: string): Promise<PredictResult> {
  const now = Date.now();
  const cached = predictCache.get(base);
  if (cached && now - cached.at < PREDICT_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const data = await gatherData(base);
  const engine = data.engine;

  // The AI layer is best-effort: if Gemini fails (quota, truncation, config)
  // we fall back to an ENGINE-ONLY result — deterministic levels still render,
  // with `aiError` explaining exactly what is missing. Only when there is no
  // engine data either does the error propagate.
  let prediction: Prediction | null = null;
  let aiError: string | null = null;
  try {
    const raw = await generateWithRetry({
      systemInstruction: PREDICTION_SYSTEM,
      prompt: buildPredictionPrompt(base, data.dataBlock, engine),
      json: true,
      temperature: 0.3,
      // Thinking is off: 2.5-flash thinking tokens count against this budget
      // and truncated the JSON in live testing (finishReason MAX_TOKENS).
      thinkingBudget: 0,
      maxOutputTokens: 1500,
    });

    prediction = parsePredictionJson(raw);
    if (!prediction) {
      console.warn(
        '[Market Agent] Unparseable prediction JSON:',
        JSON.stringify(raw.slice(0, 400)),
        `length=${raw.length}`
      );
      aiError = 'AI returned an unexpected prediction format — neeche ka engine analysis phir bhi live hai.';
    }
  } catch (err) {
    if (!engine) throw err;
    const message = (err as Error)?.message ?? 'unknown error';
    console.warn(`[Market Agent] Gemini prediction failed; serving engine-only result: ${message}`);
    aiError =
      err instanceof GeminiError && err.status === 503
        ? 'AI is not configured on this server (missing GEMINI_API_KEY) — neeche ka engine analysis live hai.'
        : err instanceof GeminiError && err.status === 429
          ? 'AI abhi rate-limited hai — neeche ka engine analysis live hai; thodi der baad AI dobara try karein.'
          : 'AI explanation abhi available nahi — neeche ka engine analysis live hai.';
  }

  if (!prediction && !engine) {
    throw new GeminiError(aiError ?? 'AI returned an unexpected prediction format. Please retry.', 502);
  }

  const setupTf = engine ? engine.timeframes[SETUP_TF] : null;
  const engineWindowStart = engine
    ? new Date(Date.now() - Math.max(...Object.values(TF_DAY_RANGES)) * 86_400_000).toISOString()
    : null;
  const engineCandleCount = engine
    ? Object.values(engine.timeframes).reduce((s, t) => s + t.candleCount, 0)
    : 0;
  const value: PredictResult = {
    symbol: base,
    prediction,
    engineOnly: prediction === null,
    aiError,
    engine: engine
      ? {
          scoring: engine.scoring,
          plan: engine.plan,
          weightsVersion: engine.weightsVersion,
          caveats: engine.caveats,
        }
      : null,
    indicators: engine
      ? {
          price: engine.price,
          rsi14: setupTf?.rsi14 ?? null,
          adx14: setupTf?.adx14 ?? null,
          atrPct: setupTf?.atrPct ?? null,
          ema50: setupTf?.ema50 ?? null,
          ema200: setupTf?.ema200 ?? null,
          regime: setupTf?.regime ?? null,
        }
      : {
          price: data.light!.indicators.price,
          rsi14: data.light!.indicators.rsi14,
          adx14: null,
          atrPct: null,
          ema50: null,
          ema200: null,
          regime: null,
        },
    data: engine
      ? {
          source: engine.source,
          candleCount: engineCandleCount,
          windowStart: engineWindowStart as string,
          windowEnd: new Date().toISOString(),
          fetchedAt: engine.generatedAt,
          stale: false,
          degraded: false,
        }
      : {
          source: data.light!.source,
          candleCount: data.light!.candleCount,
          windowStart: new Date(data.light!.windowStartMs).toISOString(),
          windowEnd: new Date(data.light!.windowEndMs).toISOString(),
          fetchedAt: new Date(data.light!.fetchedAtMs).toISOString(),
          stale: data.light!.stale,
          degraded: true,
        },
    generatedAt: new Date().toISOString(),
    cached: false,
  };

  if (predictCache.size >= CACHE_MAX) {
    const oldest = predictCache.keys().next().value;
    if (oldest !== undefined) predictCache.delete(oldest);
  }
  predictCache.set(base, { at: now, value });

  return value;
}

/* -------------------------------------------------------------------------- */
/* Chat assistant                                                              */
/* -------------------------------------------------------------------------- */

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  reply: string;
  generatedAt: string;
  context: {
    symbol: string;
    source: string;
    price: number;
    rsi14: number | null;
    change24hPct: number | null;
    candleCount: number;
    /** Deterministic verdict for the meta line (null in degraded mode). */
    direction?: string;
    confidence?: number;
  } | null;
}

/**
 * Grounded chat reply in "Trading Guru" format. When a symbol is given, the
 * deterministic engine output (trend/structure/score/plan) is attached;
 * without a symbol the model must answer without quoting live numbers.
 */
export async function chatReply(opts: {
  message: string;
  symbol?: string | null;
  history?: ChatTurn[];
}): Promise<ChatResult> {
  const { message, symbol, history = [] } = opts;

  let dataBlock = NO_DATA_BLOCK;
  let context: ChatResult['context'] = null;

  if (symbol) {
    const data = await gatherData(symbol);
    dataBlock = data.dataBlock;
    if (data.engine) {
      const setup = data.engine.timeframes[SETUP_TF];
      context = {
        symbol,
        source: data.engine.source,
        price: data.engine.price,
        rsi14: setup?.rsi14 ?? null,
        change24hPct: null,
        candleCount: Object.values(data.engine.timeframes).reduce((s, t) => s + t.candleCount, 0),
        direction: data.engine.scoring.direction,
        confidence: data.engine.scoring.confidence,
      };
    } else if (data.light) {
      context = {
        symbol,
        source: data.light.source,
        price: data.light.indicators.price,
        rsi14: data.light.indicators.rsi14,
        change24hPct: data.light.indicators.change24hPct,
        candleCount: data.light.candleCount,
      };
    }
  }

  const languageLine = looksRomanUrdu(message)
    ? 'LANGUAGE MIRROR: user Roman Urdu likh raha hai — poora jawab Roman Urdu me do (English trading terms theek hain). Final disclaimer bhi Roman Urdu me.'
    : 'LANGUAGE MIRROR: user English likh raha hai — answer fully in English, including the final disclaimer.';

  const historyBlock =
    history.length > 0
      ? history.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')
      : '(pehli baat-cheet hai)';

  const prompt = `${dataBlock}

${languageLine}

CONVERSATION SO FAR:
${historyBlock}

USER KA SAWAL:
${message}

Ab usi zubaan me, proper formatted analysis (upar ka FORMAT_RULES) ke mutabiq jawab do.`;

  const reply = await generateWithRetry({
    systemInstruction: GURU_SYSTEM,
    prompt,
    temperature: 0.6,
    // Thinking off — snappy replies and quota-friendly (see gemini.ts).
    thinkingBudget: 0,
    maxOutputTokens: 4000,
  });

  return { reply, generatedAt: new Date().toISOString(), context };
}
