import { describe, expect, it } from 'vitest';
import {
  buildMarketContext,
  looksRomanUrdu,
  normalizeSymbol,
  parsePredictionJson,
  supportedSymbols,
  validatePrediction,
  type Candle,
} from '@/lib/market-agent';

/**
 * Unit tests for the AI market agent's PURE parts (no network, no Gemini):
 * real-data context building, symbol normalization, and prediction
 * validation — the pieces that guarantee the model only ever sees (and the
 * API only ever accepts) grounded, well-formed honest output.
 */

/** Deterministic ascending fixture: close_i = start + i, high = close+2, low = close-2. */
function ramp(n: number, start = 100, intervalSec = 3600): Candle[] {
  const t0 = Date.UTC(2026, 0, 1);
  const out: Candle[] = [];
  let prev = start;
  for (let i = 0; i < n; i++) {
    const close = start + i;
    out.push([t0 + i * intervalSec * 1000, prev, close + 2, close - 2, close, 1000]);
    prev = close;
  }
  return out;
}

describe('normalizeSymbol', () => {
  it('accepts base, suffixed, and lowercase forms', () => {
    expect(normalizeSymbol('BTC')).toBe('BTC');
    expect(normalizeSymbol('BTCUSDT')).toBe('BTC');
    expect(normalizeSymbol('btcusdt')).toBe('BTC');
    expect(normalizeSymbol(' eth ')).toBe('ETH');
    expect(normalizeSymbol('$sol')).toBe('SOL');
  });

  it('rejects symbols outside the FinScope universe', () => {
    expect(normalizeSymbol('FAKE')).toBeNull();
    expect(normalizeSymbol('FAKEUSDT')).toBeNull();
    expect(normalizeSymbol('')).toBeNull();
  });

  it('exposes the supported symbol list', () => {
    expect(supportedSymbols()).toContain('BTC');
    expect(supportedSymbols().length).toBeGreaterThan(5);
  });
});

describe('buildMarketContext', () => {
  const meta = { source: 'Binance klines (real exchange data)', fetchedAtMs: Date.UTC(2026, 3, 1) };

  it('computes the indicator snapshot from real closes', () => {
    const candles = ramp(120); // 120 × 1h, closes 100..219
    const ctx = buildMarketContext('BTC', candles, meta);

    expect(ctx.indicators.price).toBe(219); // last close, provider data
    expect(ctx.indicators.windowHigh).toBe(221); // close+2
    expect(ctx.indicators.windowLow).toBe(98); // 100−2
    expect(ctx.indicators.rsi14).not.toBeNull();
    expect(ctx.indicators.rsi14!).toBeGreaterThan(0);
    expect(ctx.indicators.rsi14!).toBeLessThanOrEqual(100);
    // Monotonic ramp ⇒ SMA-20 = mean(closes 200..219) = 209.5
    expect(ctx.indicators.sma20!).toBeCloseTo(209.5, 6);
    expect(ctx.indicators.sma50).not.toBeNull();
    expect(ctx.intervalSec).toBe(3600);
    expect(ctx.candleCount).toBe(120);
  });

  it('derives ~24h change from the actual candle spacing', () => {
    const candles = ramp(120); // 1h candles ⇒ 24 candles back
    const ctx = buildMarketContext('BTC', candles, meta);
    // (219 − 195) / 195 × 100
    expect(ctx.indicators.change24hPct).toBeCloseTo((24 / 195) * 100, 6);
    // Full window: (219 − 100) / 100
    expect(ctx.indicators.windowChangePct).toBeCloseTo(119, 6);
  });

  it('labels every number as calculated vs provider in the text block', () => {
    const ctx = buildMarketContext('BTC', ramp(120), meta);
    expect(ctx.text).toContain('SYMBOL: BTC');
    expect(ctx.text).toContain('Binance klines');
    expect(ctx.text).toContain('120 candles');
    expect(ctx.text).toContain('~24h change (calculated):');
    expect(ctx.text).toContain('RSI-14 Wilder (calculated):');
    expect(ctx.text).toContain('SMA-20 / SMA-50 (calculated):');
    expect(ctx.text).toContain('MACD 12/26/9 histogram (calculated):');
    expect(ctx.text).toContain('Last close:');
  });

  it('returns nulls instead of throwing when the window is too short', () => {
    const ctx = buildMarketContext('BTC', ramp(5), meta);
    expect(ctx.indicators.price).toBe(104);
    expect(ctx.indicators.rsi14).toBeNull();
    expect(ctx.indicators.sma20).toBeNull();
    expect(ctx.indicators.sma50).toBeNull();
    expect(ctx.indicators.macdHist).toBeNull();
    expect(ctx.indicators.change24hPct).toBeNull(); // not enough history
    expect(ctx.text).toContain('RSI-14 Wilder (calculated): n/a');
  });

  it('is deterministic (same input ⇒ same output)', () => {
    const a = buildMarketContext('BTC', ramp(60), meta);
    const b = buildMarketContext('BTC', ramp(60), meta);
    expect(a).toEqual(b);
  });

  it('throws only on an empty candle array', () => {
    expect(() => buildMarketContext('BTC', [], meta)).toThrow();
  });
});

describe('validatePrediction', () => {
  const valid = {
    bias: 'LONG',
    confidence: 62,
    summary: 'BTC ka data strong lag raha hai, lekin guarantee nahi.',
    reasons: ['RSI 62 par hai', 'SMA-20 SMA-50 se upar hai'],
    risks: ['Agar RSI 30 ke neeche jaaye to bias galat'],
  };

  it('accepts a well-formed prediction', () => {
    const out = validatePrediction(valid);
    expect(out).not.toBeNull();
    expect(out!.bias).toBe('LONG');
    expect(out!.reasons).toHaveLength(2);
    expect(out!.risks).toHaveLength(1);
  });

  it('clamps and rounds confidence into 0–100', () => {
    expect(validatePrediction({ ...valid, confidence: 150 })!.confidence).toBe(100);
    expect(validatePrediction({ ...valid, confidence: -5 })!.confidence).toBe(0);
    expect(validatePrediction({ ...valid, confidence: 62.6 })!.confidence).toBe(63);
  });

  it('rejects unknown biases, bad types, and missing fields', () => {
    expect(validatePrediction({ ...valid, bias: 'BUY' })).toBeNull();
    expect(validatePrediction({ ...valid, confidence: 'high' })).toBeNull();
    expect(validatePrediction({ ...valid, summary: '   ' })).toBeNull();
    expect(validatePrediction({ ...valid, reasons: [] })).toBeNull();
    expect(validatePrediction({ ...valid, risks: 'be careful' })).toBeNull();
    expect(validatePrediction(null)).toBeNull();
    expect(validatePrediction('LONG')).toBeNull();
  });

  it('caps item counts and per-item length (hostile model output)', () => {
    const out = validatePrediction({
      ...valid,
      reasons: Array.from({ length: 20 }, (_, i) => `reason ${i}`.padEnd(400, 'x')),
      risks: Array.from({ length: 9 }, () => 'risk'),
    });
    expect(out!.reasons).toHaveLength(5);
    expect(out!.risks).toHaveLength(4);
    expect(out!.reasons[0].length).toBeLessThanOrEqual(240);
  });
});

describe('parsePredictionJson', () => {
  const base = {
    bias: 'NEUTRAL',
    confidence: 48,
    summary: 'Data mixed hai, isliye neutral.',
    reasons: ['RSI 50 ke aas paas', 'MACD histogram taqreeban zero'],
    risks: ['Koi bhi ek side move sakta hai'],
  };

  it('parses plain JSON', () => {
    expect(parsePredictionJson(JSON.stringify(base))).toMatchObject({ bias: 'NEUTRAL' });
  });

  it('tolerates accidental markdown fences', () => {
    const fenced = '```json\n' + JSON.stringify(base) + '\n```';
    expect(parsePredictionJson(fenced)).toMatchObject({ bias: 'NEUTRAL' });
  });

  it('returns null for garbage or wrong-schema payloads', () => {
    expect(parsePredictionJson('not json at all')).toBeNull();
    expect(parsePredictionJson('{"bias":"LONG"}')).toBeNull(); // missing fields
    expect(parsePredictionJson('')).toBeNull();
  });
});

describe('looksRomanUrdu (language mirroring)', () => {
  it('detects typical Roman Urdu phrasing', () => {
    expect(looksRomanUrdu('ma BTC pa trade krna chahta hoon')).toBe(true);
    expect(looksRomanUrdu('kya yeh abhi sahi level hai?')).toBe(true);
    expect(looksRomanUrdu('BTC abhi long karein ya nahi')).toBe(true);
    expect(looksRomanUrdu('bhai mujhe eth ka analysis batao')).toBe(true);
  });

  it('keeps plain English in English', () => {
    expect(looksRomanUrdu('Should I go long on BTC here?')).toBe(false);
    expect(looksRomanUrdu('What is the RSI telling us')).toBe(false);
    expect(looksRomanUrdu('Explain the trade plan')).toBe(false);
    // A single ambiguous token ('ma' inside 'MA cross') must not flip it.
    expect(looksRomanUrdu("What's the MA crossover")).toBe(false);
  });
});
