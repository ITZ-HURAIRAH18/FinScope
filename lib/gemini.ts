/**
 * Minimal Gemini REST client (Google Generative Language API, v1beta).
 *
 * Why fetch and not an SDK: the project reuses existing dependencies
 * (audit rule) — one `generateContent` call needs no extra package, and the
 * API key never leaves the server (no NEXT_PUBLIC_ prefix, sent only as the
 * `x-goog-api-key` header so it never appears in URLs or request logs).
 *
 * Model: gemini-2.5-flash (fixed per product requirement).
 *
 * Error contract thrown to callers:
 *   503 — key not configured (`geminiConfigured()` is false)
 *   429 — Google-side quota/rate limit (retryAfterSec is a best-effort hint)
 *   504 — request timed out
 *   502 — upstream rejected/failed (bad key, bad request, 5xx, empty reply)
 */

const MODEL = 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 45_000;

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSec?: number
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

/** True when the server has a Gemini API key configured. */
export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export interface GenerateOptions {
  prompt: string;
  /** System instruction (the honesty/persona rules live here). */
  systemInstruction: string;
  /** Ask for an application/json response (Gemini JSON mode). */
  json?: boolean;
  /** Lower = more deterministic. Defaults to 0.4. */
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Gemini 2.5 thinking budget (0 = disabled). Thinking tokens count toward
   * maxOutputTokens and can starve/truncate the visible answer — disable for
   * short structured output. Undefined = model default.
   */
  thinkingBudget?: number;
}

/** Run one generateContent call and return the concatenated text. */
export async function generateText(opts: GenerateOptions): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiError('GEMINI_API_KEY is not configured', 503);

  const body = {
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      ...(opts.thinkingBudget !== undefined
        ? { thinkingConfig: { thinkingBudget: opts.thinkingBudget } }
        : {}),
    },
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    const e = err as Error;
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new GeminiError('Gemini request timed out', 504);
    }
    throw new GeminiError(`Gemini request failed: ${e.message}`, 502);
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* body unreadable — status alone is still actionable */
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      // Server-side observability: Google's quota message says WHICH limit.
      console.warn('[Gemini] 429 quota exceeded:', detail.slice(0, 300));
      throw new GeminiError('Gemini rate limit reached', 429, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30);
    }
    if (res.status === 401 || res.status === 403) {
      // Never include the key itself — just enough to act on.
      throw new GeminiError('Gemini API key was rejected (check GEMINI_API_KEY)', 502);
    }
    throw new GeminiError(`Gemini error ${res.status}: ${detail || 'no detail'}`, 502);
  }

  let data: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };
  try {
    data = await res.json();
  } catch {
    throw new GeminiError('Gemini returned invalid JSON', 502);
  }

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    // Truncated output can't be parsed reliably — fail loudly, not silently.
    throw new GeminiError('AI response was truncated (MAX_TOKENS). Please retry.', 502);
  }

  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new GeminiError('Gemini returned no content', 502);
  }
  const text = parts.map((p) => p?.text ?? '').join('');
  if (!text.trim()) {
    throw new GeminiError('Gemini returned empty content', 502);
  }
  return text;
}
