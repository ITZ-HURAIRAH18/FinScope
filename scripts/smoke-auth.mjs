/**
 * Auth hardening smoke test (docs/AUDIT-REPORT.md H2/H3/S3/S5).
 *
 * Verifies against a running dev server:
 *   1. Register returns byte-identical bodies for new vs existing emails (H3)
 *   2. GET countdown is stateless — no email param, no account state leak (H3)
 *   3. Wrong OTP on a nonexistent email == wrong OTP on a real one (H3)
 *   4. 5 wrong codes lock verification for 15 minutes (H2)
 *   5. Correct code verifies after the lock is lifted (happy path)
 *   6. Already-verified accounts answer with the same generic error (H3)
 *   7. Resend has a ≥60 s cooldown and answers uniformly (H2/H3)
 *
 * All test mailboxes use the reserved `.test` TLD: SMTP delivery fails
 * silently server-side, so nothing is ever actually emailed.
 *
 * Usage: node scripts/smoke-auth.mjs   (requires dev server on :3000)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const INVALID = 'Invalid or expired OTP code';

const prisma = new PrismaClient();
const ts = Date.now();
const email = `otp-smoke-${ts}@finscope.test`;
const ghostEmail = `otp-ghost-${ts}@finscope.test`;

let failures = 0;
const check = (label, cond, detail = '') => {
  const ok = Boolean(cond);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

const post = (path, body) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const put = (path, body) =>
  fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const get = (path) =>
  fetch(BASE + path).then(async (r) => ({ status: r.status, body: await r.json() }));

async function main() {
  // 1 — uniform register responses (H3)
  const first = await post('/api/auth/register', { email, password: 'secret123', name: 'Smoke' });
  const second = await post('/api/auth/register', { email, password: 'secret123', name: 'Smoke' });
  check('register new email → 201', first.status === 201, JSON.stringify(first.body));
  check(
    'register existing email → byte-identical 201 (H3)',
    second.status === 201 && JSON.stringify(second.body) === JSON.stringify(first.body),
    `got ${second.status} ${JSON.stringify(second.body)}`
  );
  check('register response carries expiresIn', typeof first.body.expiresIn === 'number');

  // 2 — stateless countdown (H3): identical for any/no exp input
  const future = await get(`/api/auth/verify-email?exp=${Date.now() + 300_000}`);
  const noExp = await get('/api/auth/verify-email');
  check(
    'GET countdown echoes exp without touching accounts (H3)',
    future.status === 200 && future.body.remainingSeconds > 280 && future.body.remainingSeconds <= 300,
    JSON.stringify(future.body)
  );
  check('GET with no exp → 0', noExp.status === 200 && noExp.body.remainingSeconds === 0);

  // 3 — ghost email behaves like a real one (H3)
  const ghost = await post('/api/auth/verify-email', { email: ghostEmail, otp: '000000' });
  check(
    'wrong code on unknown email → generic 400 (H3)',
    ghost.status === 400 && ghost.body.error === INVALID,
    JSON.stringify(ghost.body)
  );

  // Known code for the real user (simulates having read the OTP email)
  const user = await prisma.user.findUnique({ where: { email } });
  check('test user created with hashed OTP', !!user && !!user.emailVerificationToken && user.emailVerificationToken.startsWith('$2'), 'user missing or plaintext OTP');
  if (!user) throw new Error('setup failed: user not created');

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

  // 4 — attempt lockout (H2)
  const wrongAttempts = [];
  for (let i = 0; i < 5; i++) {
    wrongAttempts.push(await post('/api/auth/verify-email', { email, otp: '999999' }));
  }
  const firstFourOk = wrongAttempts.slice(0, 4).every((r) => r.status === 400 && r.body.error === INVALID);
  check('wrong codes 1-4 → generic 400', firstFourOk, JSON.stringify(wrongAttempts.map((r) => r.status)));
  check(
    'wrong code 5 → 429 lockout (H2)',
    wrongAttempts[4].status === 429,
    JSON.stringify(wrongAttempts[4].body)
  );
  const whileLocked = await post('/api/auth/verify-email', { email, otp: '123456' });
  check('correct code while locked → still 429 (H2)', whileLocked.status === 429, JSON.stringify(whileLocked.body));

  // 5 — lift lock, verify happy path
  await prisma.user.update({
    where: { id: user.id },
    data: { otpAttempts: 0, otpLockedUntil: null },
  });
  const good = await post('/api/auth/verify-email', { email, otp: '123456' });
  check('correct code → 200 verified', good.status === 200, JSON.stringify(good.body));

  // 6 — verified account answers generically (H3)
  const replay = await post('/api/auth/verify-email', { email, otp: '123456' });
  check(
    'already-verified → same generic 400 (H3)',
    replay.status === 400 && replay.body.error === INVALID,
    JSON.stringify(replay.body)
  );

  // 7 — resend cooldown + uniform body (H2/H3)
  const resendA = await put('/api/auth/verify-email', { email: ghostEmail });
  const resendB = await put('/api/auth/verify-email', { email: ghostEmail });
  check('resend unknown email → uniform 200 (H3)', resendA.status === 200, JSON.stringify(resendA.body));
  check('resend again <60 s → 429 cooldown (H2)', resendB.status === 429, JSON.stringify(resendB.body));
  const resendVerified = await put('/api/auth/verify-email', { email });
  check(
    'resend verified email → uniform 200 (H3)',
    resendVerified.status === 200 &&
      JSON.stringify(resendVerified.body) === JSON.stringify(resendA.body),
    JSON.stringify(resendVerified.body)
  );

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

async function cleanup() {
  for (const addr of [email, ghostEmail]) {
    const u = await prisma.user.findUnique({ where: { email: addr } });
    if (u) {
      await prisma.transaction.deleteMany({ where: { userId: u.id } });
      await prisma.portfolio.deleteMany({ where: { userId: u.id } });
      await prisma.watchlist.deleteMany({ where: { userId: u.id } });
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.account.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
  }
}

try {
  await main();
} finally {
  await cleanup();
  await prisma.$disconnect();
}
