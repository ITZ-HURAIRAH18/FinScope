# FinScope Signal Agent — Architecture & Phase Plan

> Adapted from the user's "Real-Time Crypto Trading Analysis & Signal Agent"
> spec (Python/FastAPI/LangGraph/Claude/Redis/PostgreSQL) **to this project's
> existing structure**: Next.js 15 App Router + TypeScript + PostgreSQL
> (Prisma) + Gemini `gemini-2.5-flash`. No new runtime, no Python service, no
> MongoDB, no Redis — PostgreSQL stays the database.

## Core principle (from the spec, kept exactly)

1. **The signal is computed by a deterministic quantitative engine in code**
   (`lib/signal/*` — pure, unit-tested functions). Multi-timeframe trend,
   indicators, market structure, patterns, regime, confluence score, and the
   full trade plan (entry/SL/TP/RR/duration) are MATH, not AI output.
2. **The LLM only explains the computed JSON** in simple language (Roman Urdu
   or English, mirroring the user). It may never invent prices, indicator
   values, or levels — every number in its answer comes from the engine.
3. **Honesty**: no profit promises, no "100% accurate", always a risk
   disclaimer; scoring weights are v1 heuristics and are labelled
   "not yet backtested" until phase 5 exists.

## Spec → adaptation decisions

| Spec (Python stack) | FinScope adaptation | Why |
|---|---|---|
| Python + FastAPI + WebSockets | Next.js Route Handlers (TypeScript) | Project already streams via Binance WS in the browser + REST routes server-side; no second backend |
| pandas / pandas-ta | `lib/indicators.ts` (pure TS, unit-tested) | Already exists (SMA/EMA/RSI/MACD/Bollinger); extends with ATR/ADX/StochRSI/OBV/volume-spike |
| LangGraph + Claude tool-calling | Single structured Gemini calls (`lib/gemini.ts`) with the engine JSON injected as the data block | Tool-calling loop unnecessary when one deterministic computation feeds one explanation; Gemini key already configured |
| Redis cache | In-process TTL cache (`cachedJson`, signal cache) — per-process, documented | Single-instance self-hosted deployment (same note as rate limiter) |
| PostgreSQL (signals, trades, backtests) | Prisma/PostgreSQL (phase 5: `Signal` history table) | DB unchanged — no MongoDB, per requirement |
| Binance Futures data (funding/OI/L/S ratio) | Phase 4 (public `fapi.binance.com` endpoints, keyless, labelled provider data) | Deferred to keep phase 1 shippable |
| Backtester, optimizer, walk-forward | Phase 5 | Must not claim profitability before this exists |
| Telegram/WhatsApp alerts | Phase 6 | Needs bot tokens/secrets, out of scope until signals are persisted |

## Folder structure (target)

```
lib/
  indicators.ts            # pure indicator math (existing + ATR/ADX/StochRSI/OBV/spike)
  signal/
    types.ts               # SignalAnalysis / TfAnalysis / TradePlan interfaces
    structure.ts            # swings, HH/HL/LH/LL trend, S/R levels, BOS   (pure)
    levels.ts               # trade plan: entry, ATR+structure SL, TP1-3, RR, duration (pure)
    scoring.ts              # confluence score 0-100 → LONG/SHORT/NO-TRADE (pure, weighted)
    engine.ts               # orchestration: multi-TF candles → per-TF analysis → score → plan
  market-agent.ts          # LLM explanation layer over engine JSON (guru prompts, bilingual)
  gemini.ts                # Gemini REST client
  binance-rest.ts           # shared klines client (used by chart + signal engine)
app/api/
  signal/route.ts          # GET ?symbol=BTC → deterministic analysis JSON (no LLM cost)
  analysis/predict/route.ts# engine JSON + Gemini explanation (bias/confidence/reasons + plan)
  agent/chat/route.ts      # engine JSON + Gemini chat (Trend → Setup → Entry → SL → TP)
components/
  markets/PredictionCard.tsx   # prediction + trade plan + position-size calculator
  agent/TradingAgent.tsx       # formatted guru chat (bold/bullets/sections)
```

## Phases (adapted from spec §11 "build in phases")

- **Phase 1 — Data + indicators core (THIS IMPLEMENTATION)**
  Multi-TF klines (15m/1h/4h/1d, real Binance data), extended indicators
  (ATR, ADX, StochRSI, OBV, volume-spike), market structure (swings, trend,
  S/R, BOS), regime label, deterministic trade plan (entry/SL/TP1-3/R:R/
  duration/invalidation), `/api/signal` JSON, unit tests.
- **Phase 2 — Scoring maturity**: configurable weights, ≥4 factor groups,
  confidence ≥70 gate, R:R ≥ 1:2 gate, NO-TRADE conditions with reasons.
  (v1 heuristic weights ship in phase 1 but are labelled unbacktested.)
- **Phase 3 — LLM guru layer (core UI pulled forward in this change)**:
  bilingual formatted explanations, prediction card plan display,
  position-size calculator. (Full tool-calling agent loop stays out — one
  structured call per question is enough and cheaper.)
- **Phase 4 — Derivatives + order flow**: funding rate, open interest,
  long/short ratio (Binance Futures public API), depth imbalance, CVD —
  each labelled as provider data.
- **Phase 5 — Persistence + backtesting**: `Signal` table (outcome TP/SL/
  expired), equity curve / win rate / drawdown page, historical backtest
  with fees+slippage, walk-forward validation, weight tuning — only after
  this may anything claim "profitable".
- **Phase 6 — Scanner + alerts**: top-pairs ranker, chart entry/SL/TP lines
  + signal markers, Telegram notifications, weekly self-improvement report.

## Honest limitations (shown in product)

- Weights are v1 heuristics: **not backtested yet** (phase 5 pending).
- Paper-trading app: signals are analysis, never financial advice.
- Derivatives/order-flow inputs absent until phase 4 (engine says so).
