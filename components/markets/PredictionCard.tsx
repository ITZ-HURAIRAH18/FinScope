"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles, ShieldAlert, AlertTriangle, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

/**
 * AI Prediction card — Gemini explanation OVER the deterministic signal
 * engine (docs/SIGNAL-AGENT-PLAN.md).
 *
 * Layout philosophy (what each number is):
 * - Trade Plan + Confluence = computed in code (lib/signal/*: ATR, structure,
 *   weighted factor groups). Labelled "engine / deterministic" — never AI.
 * - AI summary/reasons/risks = Gemini's plain-language read of that same
 *   engine JSON (it may not invent numbers).
 * - Provenance: provider, candle count, window, weights version (v1, NOT
 *   backtested), and always a "not financial advice" disclaimer.
 * - If Gemini fails, `engineOnly` renders the deterministic analysis alone.
 */

interface Prediction {
  bias: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  summary: string;
  reasons: string[];
  risks: string[];
}

interface TakeProfit {
  price: number;
  rr: number;
  closePct: number;
}

interface TradePlan {
  direction: "LONG" | "SHORT" | "NO_TRADE";
  entryType: "market" | "limit-zone";
  entryPrice: number | null;
  entryZone: [number, number] | null;
  stopLoss: number | null;
  stopLossAtrMultiple: number | null;
  takeProfits: TakeProfit[];
  riskReward: number | null;
  duration: "scalp" | "intraday" | "swing" | null;
  timeInvalidationHours: number | null;
  invalidation: string | null;
  breakevenRule: string;
  validAgainWhen: string | null;
}

interface ScoreGroup {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

interface Scoring {
  groups: ScoreGroup[];
  total: number;
  confidence: number;
  direction: "LONG" | "SHORT" | "NO_TRADE";
  agreeingGroups: number;
  requiredAgreeingGroups: number;
  noTradeReasons: string[];
}

interface PredictResponse {
  symbol: string;
  prediction: Prediction | null;
  engineOnly: boolean;
  aiError: string | null;
  engine: {
    scoring: Scoring;
    plan: TradePlan;
    weightsVersion: string;
    caveats: string[];
  } | null;
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
    degraded: boolean;
  };
  generatedAt: string;
}

type Status = "loading" | "ready" | "unauth" | "unconfigured" | "ratelimited" | "error";

const AUTO_REFRESH_MS = 90_000;

const BIAS_STYLE: Record<Prediction["bias"], { variant: "success" | "error" | "muted"; label: string; className: string }> = {
  LONG: { variant: "success", label: "LONG ▲", className: "text-success border-success/40 bg-success/10" },
  SHORT: { variant: "error", label: "SHORT ▼", className: "text-error border-error/40 bg-error/10" },
  NEUTRAL: { variant: "muted", label: "NEUTRAL ●", className: "" },
};

const PLAN_STYLE: Record<TradePlan["direction"], { variant: "success" | "error" | "muted"; label: string; className: string }> = {
  LONG: { variant: "success", label: "LONG ▲", className: "text-success border-success/40 bg-success/10" },
  SHORT: { variant: "error", label: "SHORT ▼", className: "text-error border-error/40 bg-error/10" },
  NO_TRADE: { variant: "muted", label: "WAIT / NO TRADE ●", className: "" },
};

/** Position sizing: (balance × risk%) ÷ SL distance = units. Pure UI math. */
function PositionSizer({ plan, price }: { plan: TradePlan; price: number }) {
  const [balance, setBalance] = useState("10000");
  const [risk, setRisk] = useState("1");

  const entry = plan.entryPrice ?? price;
  const slDist = plan.stopLoss !== null ? Math.abs(entry - plan.stopLoss) : null;
  const b = Number(balance);
  const r = Number(risk);

  const valid = Number.isFinite(b) && b > 0 && Number.isFinite(r) && r > 0 && r <= 10 && slDist !== null && slDist > 0;
  const riskUsd = valid ? (b * r) / 100 : null;
  const units = valid && riskUsd !== null ? riskUsd / slDist : null;
  const notional = units !== null ? units * entry : null;
  const leverage = notional !== null && b > 0 ? notional / b : null;

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 space-y-2">
      <div className="section-label flex items-center gap-1.5">
        <Calculator className="w-3 h-3" aria-hidden />
        Position size calculator
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-muted-foreground space-y-1">
          Balance (USDT)
          <input
            type="number"
            min="1"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className="w-full h-7 rounded border border-input bg-background px-2 text-xs font-mono outline-none focus:ring-1 focus:ring-ring/40"
          />
        </label>
        <label className="text-[10px] text-muted-foreground space-y-1">
          Risk per trade (%)
          <input
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="w-full h-7 rounded border border-input bg-background px-2 text-xs font-mono outline-none focus:ring-1 focus:ring-ring/40"
          />
        </label>
      </div>
      {valid && units !== null && riskUsd !== null ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[10px] text-muted-foreground">Size</div>
            <div className="value-mono text-xs">{units < 1 ? units.toFixed(4) : units.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Risk ($)</div>
            <div className="value-mono text-xs text-warning">{riskUsd.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Leverage</div>
            <div className={`value-mono text-xs ${(leverage ?? 0) > 5 ? "text-error" : ""}`}>
              {leverage === null ? "n/a" : `${leverage.toFixed(2)}×`}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">Balance/risk valid nahi ya SL distance missing.</p>
      )}
      {(leverage ?? 0) > 5 && (
        <p className="text-[10px] text-error">
          ⚠ Leverage 5× se zyada hai — liquidation risk bahut high hai. Paper trading me hi rakhein.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">
        Formula: size = (balance × risk%) ÷ SL distance. Default 1% risk per trade.
      </p>
    </div>
  );
}

export default function PredictionCard({ symbol }: { symbol: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<PredictResponse | null>(null);
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const response = await fetch(
        `/api/analysis/predict?symbol=${encodeURIComponent(symbol)}`
      );
      const body = await response.json().catch(() => ({}));

      if (response.ok) {
        setData(body as PredictResponse);
        setStatus("ready");
        return;
      }
      if (response.status === 401) return setStatus("unauth");
      if (response.status === 503) return setStatus("unconfigured");
      if (response.status === 429) {
        const retry = body.retryAfterSec ? ` Retry in ${body.retryAfterSec}s.` : "";
        setMessage(`${body.error ?? "Rate limited."}${retry}`);
        return setStatus("ratelimited");
      }
      setMessage(body.error ?? "Prediction failed. Please retry.");
      setStatus("error");
    } catch {
      setMessage("Network error — could not reach the prediction service.");
      setStatus("error");
    } finally {
      busyRef.current = false;
    }
  }, [symbol]);

  useEffect(() => {
    setStatus("loading");
    setData(null);
    load();
  }, [load]);

  // "Real-time" refresh: re-asks every 90s (server caches 60s per symbol,
  // and the endpoint is rate-limited to 10/min/user, so this is gentle).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const prediction = data?.prediction ?? null;
  const plan = data?.engine?.plan ?? null;
  const scoring = data?.engine?.scoring ?? null;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" aria-hidden />
            AI Prediction
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={status === "loading"}
            aria-label="Refresh prediction"
            className="h-7 w-7 p-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${status === "loading" ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ---- Non-ready states ------------------------------------------------ */}
        {status === "loading" && !data && (
          <div className="space-y-3 animate-pulse" aria-busy="true">
            <div className="h-7 w-32 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
            <div className="h-4 w-2/3 rounded bg-muted" />
          </div>
        )}

        {status === "unauth" && (
          <p className="text-sm text-muted-foreground">
            Sign in to get AI predictions for {symbol}.
          </p>
        )}
        {status === "unconfigured" && (
          <p className="text-sm text-muted-foreground flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" aria-hidden />
            AI predictions are not configured on this server (missing GEMINI_API_KEY).
          </p>
        )}
        {(status === "error" || status === "ratelimited") && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" aria-hidden />
              {message}
            </p>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        )}

        {/* ---- Ready content ---------------------------------------------------- */}
        {data && status === "ready" && (
          <>
            {/* AI layer notice (engine-only fallback) */}
            {data.engineOnly && data.aiError && (
              <p className="text-xs text-warning flex items-start gap-2 bg-warning/10 rounded-md px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                {data.aiError}
              </p>
            )}

            {prediction && (
              <div className="flex items-center justify-between">
                <Badge
                  variant={BIAS_STYLE[prediction.bias].variant}
                  className={BIAS_STYLE[prediction.bias].className}
                >
                  {BIAS_STYLE[prediction.bias].label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(data.generatedAt).toLocaleTimeString()}
                </span>
              </div>
            )}

            {/* Confidence — explicitly framed as an estimate, not a guarantee. */}
            {prediction && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Model confidence</span>
                  <span className="text-xs font-mono">{prediction.confidence}/100</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${prediction.confidence}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Andaza hai, guarantee nahi — evidence ki strength hai, profit ka probability nahi.
                </p>
              </div>
            )}

            {/* AI summary (engine explained in easy language) */}
            {prediction && (
              <p className="text-sm leading-relaxed text-foreground/90 border-l-2 border-primary/40 pl-3">
                {prediction.summary}
              </p>
            )}

            {/* ---- Trade plan — DETERMINISTIC (engine), not AI ------------------ */}
            {plan && (
              <div className="rounded-md border border-border/70 p-2.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="section-label">Trade Plan</span>
                  <Badge variant="muted" className="text-[9px]">
                    Engine · ATR + structure (deterministic)
                  </Badge>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant={PLAN_STYLE[plan.direction].variant}
                    className={PLAN_STYLE[plan.direction].className}
                  >
                    {PLAN_STYLE[plan.direction].label}
                  </Badge>
                  {plan.duration && (
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {plan.duration} · {plan.timeInvalidationHours}h window
                    </span>
                  )}
                </div>

                {plan.direction === "NO_TRADE" && !plan.stopLoss && plan.validAgainWhen && (
                  <p className="text-xs text-muted-foreground">{plan.validAgainWhen}</p>
                )}

                {plan.stopLoss !== null && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="stat-block">
                      <div className="section-label text-[10px]">
                        Entry {plan.entryType === "limit-zone" ? "(limit zone)" : "(market)"}
                      </div>
                      <div className="value-mono text-xs">
                        {plan.entryPrice === null
                          ? "n/a"
                          : plan.entryZone
                            ? `${formatCurrency(plan.entryZone[0])} – ${formatCurrency(plan.entryZone[1])}`
                            : formatCurrency(plan.entryPrice)}
                      </div>
                    </div>
                    <div className="stat-block">
                      <div className="section-label text-[10px]">Stop loss ({plan.stopLossAtrMultiple}× ATR)</div>
                      <div className="value-mono text-xs text-error">{formatCurrency(plan.stopLoss)}</div>
                    </div>
                    <div className="stat-block">
                      <div className="section-label text-[10px]">R:R (to TP2)</div>
                      <div className="value-mono text-xs">1 : {plan.riskReward ?? "n/a"}</div>
                    </div>
                    <div className="stat-block">
                      <div className="section-label text-[10px]">Entry price ref.</div>
                      <div className="value-mono text-xs">{formatCurrency(data.indicators.price)}</div>
                    </div>
                  </div>
                )}

                {plan.takeProfits.length > 0 && (
                  <div className="text-xs border-t border-border/60 pt-2">
                    <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground mb-1">
                      <span>Target</span>
                      <span className="text-right">Price</span>
                      <span className="text-right">R:R</span>
                      <span className="text-right">Close %</span>
                    </div>
                    {plan.takeProfits.map((tp, i) => (
                      <div key={i} className="grid grid-cols-4 gap-1 py-0.5 border-t border-border/40">
                        <span className="text-muted-foreground">TP{i + 1}</span>
                        <span className="text-right font-mono">{formatCurrency(tp.price)}</span>
                        <span className="text-right font-mono">{tp.rr.toFixed(2)}</span>
                        <span className="text-right font-mono">{tp.closePct}%</span>
                      </div>
                    ))}
                  </div>
                )}

                {plan.invalidation && (
                  <p className="text-[10px] text-muted-foreground">
                    <strong className="text-foreground/80">Invalidation:</strong> {plan.invalidation}
                  </p>
                )}
                {plan.direction !== "NO_TRADE" && plan.validAgainWhen && (
                  <p className="text-[10px] text-muted-foreground">
                    <strong className="text-foreground/80">Note:</strong> {plan.validAgainWhen}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">{plan.breakevenRule}</p>

                {plan.stopLoss !== null && plan.entryPrice !== null && (
                  <PositionSizer plan={plan} price={data.indicators.price} />
                )}
              </div>
            )}

            {/* ---- Confluence score — DETERMINISTIC ------------------------------ */}
            {scoring && (
              <div className="rounded-md border border-border/70 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="section-label">Confluence Score</span>
                  <span className="value-mono text-xs">
                    {scoring.total > 0 ? "+" : ""}
                    {scoring.total}/±100 · {scoring.agreeingGroups}/{scoring.groups.length} groups
                    <span className="text-muted-foreground"> (need ≥{scoring.requiredAgreeingGroups})</span>
                  </span>
                </div>
                <div className="space-y-1.5">
                  {scoring.groups.map((g) => (
                    <div key={g.name} className="flex items-center gap-2">
                      <span className="w-20 text-[10px] text-muted-foreground uppercase shrink-0">{g.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${g.score >= 0 ? "bg-success" : "bg-error"}`}
                          style={{ width: `${Math.min(100, Math.abs(g.score))}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-[10px] font-mono shrink-0">
                        {g.score > 0 ? "+" : ""}
                        {g.score}
                      </span>
                    </div>
                  ))}
                </div>
                {scoring.noTradeReasons.length > 0 && (
                  <ul className="space-y-1">
                    {scoring.noTradeReasons.map((r, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground flex gap-2">
                        <span className="text-warning" aria-hidden>⏸</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Reasons / risks (AI, grounded in engine numbers) */}
            {prediction && (
              <div>
                <div className="section-label mb-1.5">Data ke reasons</div>
                <ul className="space-y-1">
                  {prediction.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-2">
                      <span className="text-success" aria-hidden>✓</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {prediction && (
              <div>
                <div className="section-label mb-1.5 text-warning">Khatraat</div>
                <ul className="space-y-1">
                  {prediction.risks.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-2">
                      <span className="text-warning" aria-hidden>⚠</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Real indicator values (setup timeframe 4h) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="stat-block">
                <div className="section-label text-[10px]">Last close (provider)</div>
                <div className="value-mono text-xs">{formatCurrency(data.indicators.price)}</div>
              </div>
              <div className="stat-block">
                <div className="section-label text-[10px]">RSI-14 · ADX (4h, calc.)</div>
                <div className="value-mono text-xs">
                  {data.indicators.rsi14 === null ? "n/a" : data.indicators.rsi14.toFixed(1)} ·{" "}
                  {data.indicators.adx14 === null ? "n/a" : data.indicators.adx14.toFixed(1)}
                </div>
              </div>
              <div className="stat-block">
                <div className="section-label text-[10px]">ATR % · regime (4h, calc.)</div>
                <div className="value-mono text-xs">
                  {data.indicators.atrPct === null ? "n/a" : `${(data.indicators.atrPct * 100).toFixed(2)}%`} ·{" "}
                  {data.indicators.regime ?? "n/a"}
                </div>
              </div>
              <div className="stat-block">
                <div className="section-label text-[10px]">EMA-50 / EMA-200 (4h)</div>
                <div className="value-mono text-xs">
                  {data.indicators.ema50 === null || data.indicators.ema200 === null
                    ? "n/a"
                    : `${formatCurrency(data.indicators.ema50)} / ${formatCurrency(data.indicators.ema200)}`}
                </div>
              </div>
            </div>

            {/* Provenance + disclaimer */}
            <div className="text-[10px] text-muted-foreground border-t border-border/60 pt-2 space-y-1">
              <div>
                Data: {data.data.source} · {data.data.candleCount} candles (15m/1h/4h/1d)
                {data.data.degraded ? " · engine unavailable (lightweight mode)" : ""}
                {data.data.stale ? " · cached (stale)" : ""}
              </div>
              <div>
                Window: {new Date(data.data.windowStart).toLocaleDateString()} →{" "}
                {new Date(data.data.windowEnd).toLocaleDateString()} · {new Date(data.data.fetchedAt).toLocaleTimeString()}
              </div>
              {data.engine && (
                <div>Weights: {data.engine.weightsVersion}</div>
              )}
              <div className="flex items-start gap-1.5">
                <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />
                <span>
                  Engine levels + AI explanation — <strong>financial advice nahi</strong>. Ye
                  paper-trading analysis hai; predictions galat bhi ho sakti hain, apna risk dekh
                  kar trade karein.
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
