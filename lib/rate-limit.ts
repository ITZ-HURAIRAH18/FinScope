/**
 * Sliding-window rate limiter for auth and other abuse-prone endpoints.
 *
 * docs/AUDIT-REPORT.md H2: register/verify/resend/login had no throttling at
 * all — unlimited OTP brute force, email bombing via resend, and SMTP quota
 * abuse.
 *
 * Design notes:
 * - In-memory, per-process (Map of key → timestamps of recent hits).
 *   This is appropriate for a single-instance deployment (self-hosted /
 *   `next start`, Docker, a VM). On serverless (Vercel/Cloud Functions) each
 *   instance has its own memory, so the limit is per-instance — still a useful
 *   brake, but NOT a global guarantee. For a global guarantee swap the store
 *   for Redis/Upstash; the API below is intentionally store-agnostic.
 * - Sliding window (not fixed bucket) so a caller can't get 2×N requests by
 *   straddling a bucket boundary.
 * - Entries are lazily pruned; an idle key costs nothing.
 */

interface Window {
  hits: number[];
}

const store = new Map<string, Window>();

/** Hard cap on tracked keys to bound memory if callers use unique keys. */
const MAX_KEYS = 50_000;

function prune(window: Window, now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  // hits are appended in order; drop the oldest expired ones.
  let firstValid = 0;
  while (firstValid < window.hits.length && window.hits[firstValid] <= cutoff) {
    firstValid++;
  }
  if (firstValid > 0) window.hits = window.hits.slice(firstValid);
}

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current window (min 0). */
  remaining: number;
  /** Seconds until the oldest hit expires (0 when allowed and not near limit). */
  retryAfterSec: number;
}

/**
 * Record a hit for `key` and report whether the request may proceed.
 *
 * @param key      Unique identifier, e.g. `register:ip:1.2.3.4` or `verify:email:user@example.com`.
 * @param limit    Max requests per window.
 * @param windowMs Window length in ms.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  let window = store.get(key);
  if (!window) {
    // Bound memory: evict the oldest key when at capacity.
    if (store.size >= MAX_KEYS) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    window = { hits: [] };
    store.set(key, window);
  }

  prune(window, now, windowMs);

  if (window.hits.length >= limit) {
    const oldestHit = window.hits[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldestHit + windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  window.hits.push(now);
  return { allowed: true, remaining: limit - window.hits.length, retryAfterSec: 0 };
}

/**
 * Best-effort client IP for rate limiting. Relies on X-Forwarded-For set by
 * the hosting platform / reverse proxy; falls back to a shared bucket so
 * direct connections can't escape throttling entirely.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    // First entry is the original client.
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return 'unknown';
}

/** 429 response helper with standard Retry-After header. */
export function tooManyRequests(retryAfterSec: number, message = 'Too many requests. Please try again later.') {
  return new Response(JSON.stringify({ error: message, retryAfterSec }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSec),
    },
  });
}
