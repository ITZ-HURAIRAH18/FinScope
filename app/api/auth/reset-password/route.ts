import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyOTPHash, sendPasswordChangedEmail } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';

/**
 * Password-reset confirmation endpoint — exchanges the emailed OTP for a new
 * password.
 *
 * Hardening — identical model to POST /api/auth/verify-email (H2/H3):
 * - The DB only ever holds a bcrypt hash of the reset code
 *   (`passwordResetToken`); this route compares against the hash.
 * - 5 failed attempts lock the reset for 15 minutes, persisted in the DB
 *   (`resetAttempts` / `resetLockedUntil`) so a restart can't clear it.
 * - Uniform generic error for every "code doesn't work" case: unknown email,
 *   no pending code, expired code and wrong code are indistinguishable.
 * - DUMMY hash comparison burns identical bcrypt work for unknown emails, so
 *   timing can't separate "no such account" from "wrong code".
 * - Sliding-window rate limits: 10/15 min per email + 30/15 min per IP.
 *
 * On success: the new password is hashed (cost 12 — same as registration),
 * all reset state is cleared, and a "password changed" security notification
 * is emailed to the account (best-effort, non-blocking for the response).
 *
 * Documented residual: sessions are JWTs with a 30-day lifetime, so a reset
 * cannot retroactively revoke tokens already issued on other devices (would
 * require a server-side session registry / token-version check). The change
 * takes effect at the next sign-in, and the notification email tells the
 * owner to act if the change wasn't theirs.
 */

const MAX_RESET_ATTEMPTS = 5;
const RESET_LOCK_MS = 15 * 60_000;
const INVALID_MSG = 'Invalid or expired code';

/** Precomputed bcrypt hash of an unguessable random string — used only to
 *  make the unknown-email path do the same bcrypt.compare work as the real
 *  path (H3 timing oracle). It protects nothing; the plaintext is unknowable. */
const DUMMY_OTP_HASH = '$2a$10$QJAgjeDoAh3KiWkB4dmhD.ndODcCQG5Xu6GwICa.gxPuWZCUVmRgK';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: 'Too many attempts. Please try again later.', retryAfterSec },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp, password } = body;

    if (
      !email || typeof email !== 'string' || !EMAIL_RE.test(email) ||
      !otp || typeof otp !== 'string' ||
      !password || typeof password !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Email, code and new password are required' },
        { status: 400 }
      );
    }
    // Same password policy as registration (register route enforces 6–128).
    if (password.length < 6 || password.length > 128) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: INVALID_MSG }, { status: 400 });
    }

    const ip = clientIp(request.headers);
    const normalizedEmail = email.trim().toLowerCase();

    // Two independent windows: stop hammering one account AND stop one IP
    // spraying many accounts (H2).
    const emailLimit = rateLimit(`reset:email:${normalizedEmail}`, 10, 15 * 60_000);
    if (!emailLimit.allowed) return rateLimitResponse(emailLimit.retryAfterSec);
    const ipLimit = rateLimit(`reset:ip:${ip}`, 30, 15 * 60_000);
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterSec);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Burn the same bcrypt work as the real path before replying, so timing
    // can't separate "no such account" from "wrong code" (H3).
    const storedHash = user?.passwordResetToken ?? null;
    const otpMatches = await verifyOTPHash(otp, storedHash ?? DUMMY_OTP_HASH);

    if (!user || !storedHash || !user.passwordResetExpires) {
      return NextResponse.json({ error: INVALID_MSG }, { status: 400 });
    }

    // Persisted lockout check (H2) — survives restarts.
    if (user.resetLockedUntil && user.resetLockedUntil > new Date()) {
      const retryAfterSec = Math.ceil((user.resetLockedUntil.getTime() - Date.now()) / 1000);
      return rateLimitResponse(retryAfterSec);
    }

    if (user.passwordResetExpires < new Date() || !otpMatches) {
      // Expired and wrong-code share one path; both count as attempts so an
      // attacker gets no free guesses against an expired-but-hashed code.
      const attempts = user.resetAttempts + 1;
      const lockNow = attempts >= MAX_RESET_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetAttempts: attempts,
          ...(lockNow ? { resetLockedUntil: new Date(Date.now() + RESET_LOCK_MS) } : {}),
        },
      });
      if (lockNow) {
        return rateLimitResponse(Math.ceil(RESET_LOCK_MS / 1000));
      }
      return NextResponse.json({ error: INVALID_MSG }, { status: 400 });
    }

    // Success: hash the new password (cost 12, same as registration) and
    // clear every piece of reset state atomically in one update.
    const newHashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: newHashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
        resetAttempts: 0,
        resetLockedUntil: null,
      },
    });

    // Security notification (best-effort): tells the real owner the password
    // changed — and gives them the reset link if it wasn't them.
    try {
      await sendPasswordChangedEmail(user.email, user.name);
    } catch (emailError) {
      console.error('Error sending password-changed email:', emailError);
    }

    return NextResponse.json(
      { message: 'Password has been reset. You can now sign in.' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Reset-password error:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
