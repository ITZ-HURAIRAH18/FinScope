/**
 * Signal engine + AI prediction + trading assistant smoke test.
 *
 * Verifies against a running dev server WITH GEMINI_API_KEY configured:
 *   1. predict/signal without session → 401; bad symbol → 400
 *   2. GET /api/signal?symbol=BTC → 200 deterministic engine JSON:
 *      4 timeframes (15m/1h/4h/1d), 5 confluence factor groups, trade plan
 *      (levels or explicit NO-TRADE), weights labelled NOT backtested,
 *      not-financial-advice caveat  ← Binance only, no Gemini quota
 *   3. predict BTC → 200 with engine block (scoring+plan) + honest AI shape
 *      (bias enum, confidence 0–100, Roman Urdu summary, ≥2 reasons,
 *      ≥2 risks, disclaimer) ← LIVE Gemini call #1
 *   4. repeat predict within 60s → 200 cached:true
 *   5. burst past 10/min → 429 with Retry-After
 *   6. chat → 200 reply, ** -formatted, grounded in live context,
 *      honesty marker  ← LIVE Gemini call #2
 *
 * All test mailboxes use the reserved `.test` TLD: SMTP delivery fails
 * silently server-side, so nothing is ever actually emailed.
 *
 * Usage: node scripts/smoke-agent.mjs   (requires dev server on :3000)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

const prisma = new PrismaClient();
const ts = Date.now();
const email = `agent-smoke-${ts}@finscope.test`;
const password = 'secret123';

let failures = 0;
const check = (label, cond, detail = '') => {
  const ok = Boolean(cond);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

const collect = (res) => ({
  status: res.status,
  headers: res.headers,
  json: async () => {
    try {
      return await res.json();
    } catch {
      return {};
    }
  },
});

/** Cookie jar: minimal set/merge for the NextAuth flow. */
const jar = new Map();
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
function absorb(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function api(path, { method = 'GET', body, headers = {}, form = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
      ...(body && form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(jar.size ? { Cookie: cookieHeader() } : {}),
      ...headers,
    },
    body: body ? (form ? new URLSearchParams(body).toString() : JSON.stringify(body)) : undefined,
    redirect: 'manual',
  });
  absorb(res);
  return collect(res);
}

async function main() {
  // ---------------------------------------------------------------- setup
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: { email, password, name: 'Agent Smoke' },
  });
  check('register throwaway account → 201', reg.status === 201, `got ${reg.status}`);

  const user = await prisma.user.findUnique({ where: { email } });
  check('user exists with hashed OTP', !!user && !!user.emailVerificationToken?.startsWith('$2'));
  if (!user) throw new Error('setup failed: user not created');

  // Known OTP written directly (SMTP never delivers .test addresses).
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: await bcrypt.hash('123456', 10),
      tokenExpires: new Date(Date.now() + 10 * 60_000),
      otpAttempts: 0,
      otpLockedUntil: null,
      emailVerified: null,
    },
  });
  const verify = await api('/api/auth/verify-email', { method: 'POST', body: { email, otp: '123456' } });
  check('verify account → 200', verify.status === 200, `got ${verify.status}`);

  // NextAuth credentials login (csrf + callback) to obtain a session cookie.
  const csrf = await api('/api/auth/csrf');
  const csrfBody = await csrf.json();
  const login = await api('/api/auth/callback/credentials', {
    method: 'POST',
    form: true,
    body: { csrfToken: csrfBody.csrfToken, email, password, json: 'true' },
  });
  const hasSession = [...jar.keys()].some((k) => k.includes('session-token'));
  check('credentials login sets session cookie', hasSession, `status ${login.status}, cookies: ${[...jar.keys()].join(',')}`);

  // -------------------------------------------------------- predict: auth
  jar.delete([...jar.keys()].find((k) => k.includes('session-token')));
  const unauth = await api('/api/analysis/predict?symbol=BTC');
  check('predict without session → 401', unauth.status === 401, `got ${unauth.status}`);
  // Restore session by logging in again.
  const login2 = await api('/api/auth/callback/credentials', {
    method: 'POST',
    form: true,
    body: { csrfToken: csrfBody.csrfToken, email, password, json: 'true' },
  });
  check(
    're-login sets session cookie',
    [...jar.keys()].some((k) => k.includes('session-token')),
    `status ${login2.status}`
  );

  const bad = await api('/api/analysis/predict?symbol=NOTACOIN');
  check('predict unsupported symbol → 400', bad.status === 400, `got ${bad.status}`);

  // -------------------------------------------------- signal engine: endpoint
  // Deterministic analysis (Binance only — no Gemini quota consumed here).
  const sigNoSession = await fetch(BASE + '/api/signal?symbol=BTC').then((r) => r.status);
  check('signal without session → 401', sigNoSession === 401, `got ${sigNoSession}`);

  const sigBad = await api('/api/signal?symbol=NOTACOIN');
  check('signal unsupported symbol → 400', sigBad.status === 400, `got ${sigBad.status}`);

  const sig = await api('/api/signal?symbol=BTC');
  const sigBody = await sig.json();
  check('signal BTC → 200 (deterministic engine)', sig.status === 200, `${sig.status} ${JSON.stringify(sigBody).slice(0, 300)}`);
  if (sig.status === 200) {
    check(
      'signal has 4 timeframes with live prices',
      ['15m', '1h', '4h', '1d'].every((tf) => (sigBody.timeframes?.[tf]?.price ?? 0) > 0),
      Object.keys(sigBody.timeframes ?? {}).join(',')
    );
    check(
      'confluence: 5 factor groups + valid direction',
      Array.isArray(sigBody.scoring?.groups) &&
        sigBody.scoring.groups.length === 5 &&
        ['LONG', 'SHORT', 'NO_TRADE'].includes(sigBody.scoring.direction),
      String(sigBody.scoring?.direction)
    );
    const pl = sigBody.plan;
    const planOk =
      pl &&
      (pl.direction === 'NO_TRADE'
        ? typeof pl.validAgainWhen === 'string'
        : typeof pl.stopLoss === 'number' && Array.isArray(pl.takeProfits) && pl.takeProfits.length === 3 && pl.riskReward > 0);
    check('trade plan: real levels or explicit NO-TRADE', planOk, JSON.stringify(pl).slice(0, 200));
    check('plan labels levels as deterministic', sigBody.plan && typeof sigBody.plan.breakevenRule === 'string', String(sigBody.plan?.breakevenRule));
    check('weights labelled NOT backtested', /not backtested/i.test(sigBody.weightsVersion ?? ''), String(sigBody.weightsVersion));
    check('caveat: not financial advice', (sigBody.caveats ?? []).some((c) => /not financial advice/i.test(c)), JSON.stringify(sigBody.caveats));
    const tf4 = sigBody.timeframes?.['4h'];
    check(
      '4h setup: structure + ATR + regime present',
      typeof tf4?.structure?.trend === 'string' && (tf4?.atr14 ?? 0) > 0 && typeof tf4?.regime === 'string',
      JSON.stringify({ trend: tf4?.structure?.trend, atr: tf4?.atr14, regime: tf4?.regime })
    );
  }

  // ---------------------------------------------------- predict: LIVE call
  const live = await api('/api/analysis/predict?symbol=BTC');
  const liveBody = await live.json();
  check('predict BTC → 200 (live Gemini)', live.status === 200, `${live.status} ${JSON.stringify(liveBody).slice(0, 300)}`);
  if (live.status === 200) {
    const p = liveBody.prediction;
    check('bias in {LONG,SHORT,NEUTRAL}', ['LONG', 'SHORT', 'NEUTRAL'].includes(p?.bias), String(p?.bias));
    check('confidence is 0–100 number', typeof p?.confidence === 'number' && p.confidence >= 0 && p.confidence <= 100, String(p?.confidence));
    check('summary non-empty (Roman Urdu answer)', typeof p?.summary === 'string' && p.summary.trim().length > 20, String(p?.summary).slice(0, 80));
    check('≥2 reasons', Array.isArray(p?.reasons) && p.reasons.length >= 2, JSON.stringify(p?.reasons));
    check('≥2 risks', Array.isArray(p?.risks) && p.risks.length >= 2, JSON.stringify(p?.risks));
    check('disclaimer words present in summary+risks', /financial advice|guarantee|galat|nahi/i.test(p.summary + p.risks.join(' ')), p.summary);
    check('real indicator snapshot attached', typeof liveBody.indicators?.price === 'number' && liveBody.indicators.price > 0, JSON.stringify(liveBody.indicators));
    check('data provider named', typeof liveBody.data?.source === 'string' && liveBody.data.source.length > 0, liveBody.data?.source);
    check('candle count sane (≥100)', liveBody.data?.candleCount >= 100, String(liveBody.data?.candleCount));
    check('not marked cached on first call', liveBody.cached === false, String(liveBody.cached));
    check(
      'engine block attached (deterministic scoring + plan)',
      liveBody.engine?.scoring?.groups?.length === 5 && typeof liveBody.engine?.plan?.direction === 'string',
      JSON.stringify({ dir: liveBody.engine?.scoring?.direction, plan: liveBody.engine?.plan?.direction })
    );
    check('AI layer active (not engine-only fallback)', liveBody.engineOnly === false, String(liveBody.aiError));
  }

  // ------------------------------------------------------------ cache hit
  const cached = await api('/api/analysis/predict?symbol=BTC');
  const cachedBody = await cached.json();
  check('repeat predict → 200 cached:true', cached.status === 200 && cachedBody.cached === true, `${cached.status} cached=${cachedBody.cached}`);

  // ------------------------------------------------------------- chat: auth
  const chatUnauth = await fetch(BASE + '/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  }).then((r) => r.status);
  check('chat without session → 401', chatUnauth === 401, `got ${chatUnauth}`);

  // -------------------------------------------------------------- chat: 400s
  const empty = await api('/api/agent/chat', { method: 'POST', body: { message: '   ' } });
  check('chat empty message → 400', empty.status === 400, `got ${empty.status}`);

  const badSym = await api('/api/agent/chat', { method: 'POST', body: { message: 'hi', symbol: 'NOPE' } });
  check('chat unsupported symbol → 400', badSym.status === 400, `got ${badSym.status}`);

  const badJson = await fetch(BASE + '/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader() },
    body: '{not json',
  }).then((r) => r.status);
  check('chat invalid JSON → 400', badJson === 400, `got ${badJson}`);

  // -------------------------------------------------------- chat: LIVE call
  // (before the predict burst so this Gemini call isn't competing with it)
  const chat = await api('/api/agent/chat', {
    method: 'POST',
    body: { message: 'BTC abhi kaisa hai? Seedha Roman Urdu me batao.', symbol: 'BTC' },
  });
  const chatBody = await chat.json();
  check('chat with symbol → 200 (live Gemini)', chat.status === 200, `${chat.status} ${JSON.stringify(chatBody).slice(0, 300)}`);
  if (chat.status === 200) {
    check('reply is non-empty text', typeof chatBody.reply === 'string' && chatBody.reply.length > 30, String(chatBody.reply).slice(0, 80));
    check('reply carries context (live data used)', chatBody.context?.symbol === 'BTC' && chatBody.context?.candleCount > 0, JSON.stringify(chatBody.context));
    check('reply includes honesty marker', /financial advice|guarantee|nahi|galat/i.test(chatBody.reply), String(chatBody.reply).slice(0, 120));
    check('reply uses structured formatting (bold labels)', /\*\*[^*]+\*\*/.test(chatBody.reply), String(chatBody.reply).slice(0, 160));
  }

  // -------------------------------------------------------- rate limiting
  let saw429 = false;
  let retryAfter = null;
  for (let i = 0; i < 12 && !saw429; i++) {
    const r = await api('/api/analysis/predict?symbol=BTC');
    if (r.status === 429) {
      saw429 = true;
      retryAfter = r.headers.get('retry-after');
      const b = await r.json();
      check('burst → 429 with Retry-After + body', Boolean(retryAfter) && typeof b.error === 'string', `retry=${retryAfter}`);
    }
  }
  check('10/min predict limit enforced', saw429, 'no 429 seen in 12 rapid requests');

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email } });
  if (u) {
    await prisma.transaction.deleteMany({ where: { userId: u.id } });
    await prisma.portfolio.deleteMany({ where: { userId: u.id } });
    await prisma.watchlist.deleteMany({ where: { userId: u.id } });
    await prisma.session.deleteMany({ where: { userId: u.id } });
    await prisma.account.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
}

try {
  await main();
} finally {
  await cleanup();
  await prisma.$disconnect();
}
