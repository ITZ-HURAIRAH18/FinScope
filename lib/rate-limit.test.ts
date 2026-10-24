import { describe, it, expect, vi, afterEach } from 'vitest';
import { rateLimit, clientIp, tooManyRequests } from './rate-limit';

/**
 * Unit tests for the sliding-window rate limiter (audit H2/S3: register,
 * verify, resend and login previously had no throttling at all).
 *
 * The limiter stores hits in a module-level Map keyed by `key`, so every
 * test uses a unique key to stay isolated. Window expiry is exercised with
 * fake timers instead of real sleeps.
 */

afterEach(() => {
  vi.useRealTimers();
});

let keyCounter = 0;
const uniqueKey = () => `test-key-${Date.now()}-${keyCounter++}`;

describe('rateLimit', () => {
  it('allows requests up to the limit and reports remaining', () => {
    const key = uniqueKey();
    const r1 = rateLimit(key, 3, 60_000);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = rateLimit(key, 3, 60_000);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = rateLimit(key, 3, 60_000);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('blocks the request AFTER the limit and sets retryAfterSec > 0', () => {
    const key = uniqueKey();
    rateLimit(key, 2, 60_000);
    rateLimit(key, 2, 60_000);

    const blocked = rateLimit(key, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('a blocked request does NOT consume budget', () => {
    const key = uniqueKey();
    rateLimit(key, 1, 60_000);
    rateLimit(key, 1, 60_000); // blocked
    const stillBlocked = rateLimit(key, 1, 60_000); // still blocked, same window
    expect(stillBlocked.allowed).toBe(false);
  });

  it('slides: hits expire after the window and budget is restored', () => {
    vi.useFakeTimers();
    const key = uniqueKey();
    const start = Date.now();
    vi.setSystemTime(start);

    rateLimit(key, 2, 60_000);
    rateLimit(key, 2, 60_000);
    expect(rateLimit(key, 2, 60_000).allowed).toBe(false);

    // Advance past the window: both hits expire.
    vi.setSystemTime(start + 61_000);
    const after = rateLimit(key, 2, 60_000);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(1);
  });

  it('slides partially: one of two hits expiring frees one slot', () => {
    vi.useFakeTimers();
    const key = uniqueKey();
    const start = Date.now();
    vi.setSystemTime(start);

    rateLimit(key, 2, 60_000); // hit at t0
    vi.setSystemTime(start + 30_000);
    rateLimit(key, 2, 60_000); // hit at t0+30s
    expect(rateLimit(key, 2, 60_000).allowed).toBe(false);

    // t0+61s: the first hit expired, the second (t0+30s) is still inside.
    vi.setSystemTime(start + 61_000);
    const after = rateLimit(key, 2, 60_000);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(0); // one slot used by the t0+30s hit
  });

  it('keys are independent', () => {
    const keyA = uniqueKey();
    const keyB = uniqueKey();
    rateLimit(keyA, 1, 60_000);
    expect(rateLimit(keyA, 1, 60_000).allowed).toBe(false);
    // A different key still has full budget.
    expect(rateLimit(keyB, 1, 60_000).allowed).toBe(true);
  });

  it('retryAfterSec reflects time until the oldest hit expires', () => {
    vi.useFakeTimers();
    const key = uniqueKey();
    const start = Date.now();
    vi.setSystemTime(start);

    rateLimit(key, 1, 60_000);
    // 20s later the window has 40s left.
    vi.setSystemTime(start + 20_000);
    const blocked = rateLimit(key, 1, 60_000);
    expect(blocked.allowed).toBe(false);
    // ceil(40s) with ≥1s floor → 40.
    expect(blocked.retryAfterSec).toBe(40);
  });
});

describe('clientIp', () => {
  it('uses the first x-forwarded-for entry', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(clientIp(headers)).toBe('1.2.3.4');
  });

  it('trims whitespace around the first entry', () => {
    const headers = new Headers({ 'x-forwarded-for': ' 9.9.9.9 , 10.0.0.1' });
    expect(clientIp(headers)).toBe('9.9.9.9');
  });

  it('falls back to "unknown" when the header is absent', () => {
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('tooManyRequests', () => {
  it('returns 429 with a Retry-After header and JSON body', async () => {
    const res = tooManyRequests(42, 'Slow down');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    const body = await res.json();
    expect(body.error).toBe('Slow down');
    expect(body.retryAfterSec).toBe(42);
  });

  it('uses a default message when none is given', async () => {
    const res = tooManyRequests(10);
    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
  });
});
