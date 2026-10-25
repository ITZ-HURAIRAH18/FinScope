"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send, Loader2, ShieldAlert, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";

/**
 * "Trading Guru" chat — Gemini explanation over the deterministic signal
 * engine (docs/SIGNAL-AGENT-PLAN.md).
 *
 * How it stays honest (docs/AUDIT-REPORT.md):
 * - Each symbol message is answered from the signal-engine JSON (multi-TF
 *   indicators, structure, confluence score, trade plan) computed in code by
 *   lib/signal/*. The model may only explain those numbers. Without a symbol
 *   it is forbidden from quoting any live price.
 * - System prompt enforces the structured format (TREND → SETUP → VERDICT →
 *   ENTRY → SL → TP → DURATION → RISK), language mirroring (Roman Urdu or
 *   English), no profit promises, and an always-on "not financial advice".
 * - Server enforces session + 12 msgs/min rate limit + strict input caps.
 * - Replies render lightweight markdown (**bold**, bullets, numbered lists)
 *   built as React nodes — no HTML injection surface.
 */

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Small provenance line shown under an assistant reply. */
  meta?: string;
  /** Rendered as an inline error notice instead of a chat bubble. */
  error?: boolean;
}

interface ChatResponse {
  reply: string;
  generatedAt: string;
  context: {
    symbol: string;
    source: string;
    price: number;
    rsi14: number | null;
    change24hPct: number | null;
    candleCount: number;
    direction?: string;
    confidence?: number;
  } | null;
}

const MAX_HISTORY_TURNS = 6;
const GREETING: Message = {
  role: "assistant",
  content:
    "Assalam-o-Alaikum! Main **FinScope Trading Guru** hoon. Kisi bhi coin ka sawal poochein — jaise \"BTC abhi long karun ya short?\" — to main real engine data dekh kar poora structured analysis deta hoon:\n\n**TREND → SETUP → VERDICT → ENTRY → STOP LOSS → TAKE PROFIT → DURATION → RISK**\n\nRoman Urdu aur English dono me jawab mil jayega (jis me aap likhenge, usi me). Ek baat yaad rakhein: main analysis deta hoon, **financial advice nahi**, aur 100% guarantee koi nahi de sakta.",
};

/* -------------------------------------------------------------------------- */
/* Lightweight markdown rendering (bold / bullets / numbered) — React nodes    */
/* -------------------------------------------------------------------------- */

function inlineBold(text: string, keyBase: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
        <strong key={`${keyBase}-${i}`} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <span key={`${keyBase}-${i}`}>{part}</span>
      )
    );
}

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "gap" };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      if (blocks.length > 0 && blocks[blocks.length - 1].type !== "gap") {
        blocks.push({ type: "gap" });
      }
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === "ul") last.items.push(bullet[1]);
      else blocks.push({ type: "ul", items: [bullet[1]] });
    } else if (numbered) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === "ol") last.items.push(numbered[1]);
      else blocks.push({ type: "ol", items: [numbered[1]] });
    } else if (heading) {
      blocks.push({ type: "p", text: `**${heading[1]}**` });
    } else {
      blocks.push({ type: "p", text: line });
    }
  }
  return blocks;
}

function RichText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((b, bi) => {
        if (b.type === "gap") return <div key={bi} className="h-1.5" />;
        if (b.type === "ul")
          return (
            <ul key={bi} className="space-y-0.5 pl-4 list-disc list-outside">
              {b.items.map((it, ii) => (
                <li key={ii}>{inlineBold(it, `${bi}-${ii}`)}</li>
              ))}
            </ul>
          );
        if (b.type === "ol")
          return (
            <ol key={bi} className="space-y-0.5 pl-4 list-decimal list-outside">
              {b.items.map((it, ii) => (
                <li key={ii}>{inlineBold(it, `${bi}-${ii}`)}</li>
              ))}
            </ol>
          );
        return <p key={bi}>{inlineBold(b.text, String(bi))}</p>;
      })}
    </>
  );
}

export default function TradingAgent({ symbol }: { symbol: string }) {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  const send = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || busy) return;

      setNotice(null);
      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setBusy(true);

      try {
        // Server re-validates all of this — client limits only keep the
        // conversation window (and token cost) bounded.
        const history = messages
          .filter((m) => !m.error)
          .slice(-MAX_HISTORY_TURNS)
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, symbol, history }),
        });
        const body = await response.json().catch(() => ({}));

        if (response.ok) {
          const data = body as ChatResponse;
          const c = data.context;
          const meta = c
            ? `Data: ${c.source} · ${c.candleCount} candles · RSI ${
                c.rsi14 === null ? "n/a" : c.rsi14.toFixed(1)
              }${c.direction ? ` · Engine: ${c.direction} ${c.confidence ?? 0}/100` : ""}`
            : undefined;
          setMessages((prev) => [...prev, { role: "assistant", content: data.reply, meta }]);
          return;
        }

        // Failure: restore the typed message and surface the reason.
        setInput(text);
        if (response.status === 401) setNotice("Sign in to use the AI assistant.");
        else if (response.status === 503)
          setNotice("AI assistant is not configured on this server (missing GEMINI_API_KEY).");
        else if (response.status === 429)
          setNotice(`${body.error ?? "Rate limited."}${body.retryAfterSec ? ` Retry in ${body.retryAfterSec}s.` : ""}`);
        else setNotice(body.error ?? "Reply failed. Please retry.");
      } catch {
        setInput(text);
        setNotice("Network error — could not reach the assistant.");
      } finally {
        setBusy(false);
      }
    },
    [input, busy, messages, symbol]
  );

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" aria-hidden />
            Trading Guru
            <span className="text-xs font-normal text-muted-foreground">(AI assistant)</span>
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 min-h-0">
        {/* Conversation */}
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1" role="log" aria-live="polite">
          {messages.map((m, i) =>
            m.error ? (
              <div key={i} className="text-xs text-warning flex items-start gap-2 bg-warning/10 rounded-md px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                {m.content}
              </div>
            ) : (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed break-words ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                      : "bg-muted text-foreground space-y-1.5"
                  }`}
                >
                  {m.role === "assistant" ? <RichText text={m.content} /> : m.content}
                  {m.meta && (
                    <div className="text-[10px] opacity-70 mt-1.5 border-t border-foreground/10 pt-1">
                      {m.meta}
                    </div>
                  )}
                </div>
              </div>
            )
          )}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                Engine data dekh kar analysis bana raha hoon…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {notice && (
          <p className="text-xs text-warning flex items-start gap-2 bg-warning/10 rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
            {notice}
          </p>
        )}

        {/* Input */}
        <form onSubmit={send} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={800}
            placeholder={`Kuch poochein — jaise "${symbol} abhi long karun ya short?"`}
            aria-label="Message the AI assistant"
            className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
            disabled={busy}
          />
          <Button type="submit" size="sm" disabled={busy || !input.trim()} aria-label="Send message">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>

        {/* Disclaimer — always visible */}
        <div className="text-[10px] text-muted-foreground flex items-start gap-1.5 border-t border-border/60 pt-2">
          <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />
          <span>
            AI se jo bhi mile wo <strong>financial advice nahi</strong> — analysis aur risk
            samajhne ke liye hai. Predictions galat ho sakti hain; real money se pehle khud
            research karein.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
