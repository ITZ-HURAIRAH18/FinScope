/**
 * Password-reset flow smoke test (forgot-password + reset-password).
 *
 * Verifies against a running dev server:
 *   1. forgot-password returns a byte-identical uniform body for an unknown
 *      email vs. a registered one (H3 — no enumeration)
 *   2. forgot-password enforces the ≥60 s resend cooldown (H2)
 *   3. reset-password with a wrong code on a ghost email is indistinguishable
 *      from a wrong code on a real account (H3)
 *   4. 5 failed attempts lock the reset for 15 minutes (H2)
 *   5. correct code resets the password: old hash no longer matches, new one
 *      does (bcrypt verified directly against the DB)
 *   6. the reset code is single-use: replay after success returns generic 400
 *
 * The test writes a KNOWN bcrypt hash of a known OTP straight into the DB
 * (simulating having read the emailed code — SMTP never actually delivers to
 * the reserved `.test` TLD, so nothing is emailed).
 *
 * Usage: node scripts/smoke-reset.mjs   (requires dev server on :3000)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const INVALID = 'Invalid or expired code';
const KNOWN_OTP = '654321';
const NEW_PASSWORD = 'brand-new-secret-9';

const prisma = new PrismaClient();
const ts = Date.now();
const email = `reset-smoke-${ts}@finscope.test`;
const ghostEmail = `reset-ghost-${ts}@finscope.test`;

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

async function main() {
  // Seed a verified account with a known original password.
  const originalHash = await bcrypt.hash('original-password-7', 12);
  await prisma.user.create({
    data: {
      email,
      password: originalHash,
      name: 'Reset Smoke',
      emailVerified: new Date(),
    },
  });

  // 1 — uniform forgot-password responses (H3)
  const known = await post('/api/auth/forgot-password', { email });
  const ghost = await post('/api/auth/forgot-password', { email: ghostEmail });
  check('forgot-password real email → 200', known.status === 200, JSON.stringify(known.body));
  check(
    'forgot-password ghost email → byte-identical 200 (H3)',
    ghost.status === 200 && JSON.stringify(ghost.body) === JSON.stringify(known.body),
    `got ${ghost.status} ${JSON.stringify(ghost.body)}`
  );
  check(
    'forgot-password response is uniform wording',
    typeof known.body.message === 'string' && known.body.message.startsWith('If an account exists'),
    JSON.stringify(known.body)
  );

  // 2 — resend cooldown ≥60 s (H2)
  const tooSoon = await post('/api/auth/forgot-password', { email });
  check(
    'forgot-password resend <60 s → 429 cooldown (H2)',
    tooSoon.status === 429 && typeof tooSoon.body.retryAfterSec === 'number',
    `got ${tooSoon.status} ${JSON.stringify(tooSoon.body)}`
  );

  // Simulate having read the emailed code: store its hash + fresh expiry.
  const hashedOtp = await bcrypt.hash(KNOWN_OTP, 10);
  await prisma.user.update({
    where: { email },
    data: {
      passwordResetToken: hashedOtp,
      passwordResetExpires: new Date(Date.now() + 10 * 60_000),
      resetAttempts: 0,
      resetLockedUntil: null,
    },
  });

  // 3 — wrong code behaves identically for ghost vs. real (H3)
  const wrongGhost = await post('/api/auth/reset-password', {
    email: ghostEmail,
    otp: '000000',
    password: NEW_PASSWORD,
  });
  const wrongReal = await post('/api/auth/reset-password', {
    email,
    otp: '000000',
    password: NEW_PASSWORD,
  });
  check('reset wrong code → generic 400', wrongReal.status === 400, JSON.stringify(wrongReal.body));
  check(
    'reset wrong code ghost == real (H3)',
    wrongGhost.status === wrongReal.status && wrongGhost.body.error === wrongReal.body.error,
    `ghost ${wrongGhost.status}/${wrongGhost.body.error} vs real ${wrongReal.status}/${wrongReal.body.error}`
  );
  check(
    'generic message matches contract',
    wrongReal.body.error === INVALID,
    `got "${wrongReal.body.error}", expected "${INVALID}"`
  );

  // 4 — 5 failed attempts → 15-minute lockout (H2)
  const attempts = [];
  for (let i = 0; i < 5; i++) {
    attempts.push(
      await post('/api/auth/reset-password', {
        email,
        otp: '000000',
        password: NEW_PASSWORD,
      })
    );
  }
  check(
    '5th failed attempt → 429 lockout (H2)',
    attempts[4].status === 429,
    `statuses: ${attempts.map((a) => a.status).join(',')}`
  );

  // Even the CORRECT code is rejected while locked.
  const whileLocked = await post('/api/auth/reset-password', {
    email,
    otp: KNOWN_OTP,
    password: NEW_PASSWORD,
  });
  check(
    'correct code while locked → still 429 (H2)',
    whileLocked.status === 429,
    `got ${whileLocked.status}`
  );

  // Lock persists across "restarts" because it is DB-backed: clear attempts
  // only (lock field untouched would still block — clear it like 15 min later).
  await prisma.user.update({
    where: { email },
    data: { resetAttempts: 0, resetLockedUntil: null },
  });

  // 5 — happy path: correct code changes the password
  const good = await post('/api/auth/reset-password', {
    email,
    otp: KNOWN_OTP,
    password: NEW_PASSWORD,
  });
  check('correct code → 200 reset', good.status === 200, JSON.stringify(good.body));

  const user = await prisma.user.findUnique({ where: { email } });
  check('new password hash matches', !!user && (await bcrypt.compare(NEW_PASSWORD, user.password)));
  check(
    'old password no longer matches',
    !!(user && !(await bcrypt.compare('original-password-7', user.password)))
  );
  check(
    'reset state fully cleared',
    !!user &&
      user.passwordResetToken === null &&
      user.passwordResetExpires === null &&
      user.resetAttempts === 0,
    user ? `token=${user.passwordResetToken} attempts=${user.resetAttempts}` : 'user missing'
  );

  // 6 — code is single-use: replay returns the same generic 400 (H3)
  const replay = await post('/api/auth/reset-password', {
    email,
    otp: KNOWN_OTP,
    password: 'another-password-1',
  });
  check(
    'replayed code → generic 400 (single-use, H3)',
    replay.status === 400 && replay.body.error === INVALID,
    `got ${replay.status} ${JSON.stringify(replay.body)}`
  );

  // Cleanup fixture.
  await prisma.user.delete({ where: { email } }).catch(() => {});

  console.log('');
  if (failures === 0) {
    console.log('ALL CHECKS PASSED');
  } else {
    console.log(`${failures} CHECK(S) FAILED`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error('Smoke test crashed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
