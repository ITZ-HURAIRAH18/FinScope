import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  generateOTP,
  hashOTP,
  sendPasswordResetEmail,
  sendPasswordResetGuidanceEmail,
} from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';

/**
 * Password-reset request endpoint (forgot-password flow).
 *
 * Hardening — mirrors register/verify-email (docs/AUDIT-REPORT.md H2/H3):
 * - Enumeration-safe: BOTH branches return the same byte-identical body with
 *   the same status. Unknown emails, unverified accounts and Google-only
 *   accounts (no password to reset) all get the uniform answer; only a
 *   mailbox owner ever sees the reset code.
 * - Timing: the same bcrypt hashing work happens BEFORE the existence branch,
 *   so response timing can't separate "registered" from "not registered".
 * - Rate limits: ≥60 s cooldown per email (spacing), 3/hour per email,
 *   10/hour per IP — this endpoint can trigger outbound SMTP, so it gets the
 *   same anti-bombing treatment as the OTP resend route (H2).
 * - The stored code is a bcrypt hash with a 10-minute expiry and its own
 *   attempt/lockout counters (enforced by /api/auth/reset-password).
 *
 * Accepted residual (same as register): on the existing-account branch the
 * SMTP round-trip is awaited, which is a weak timing signal — bounded by the
 * 3/hour per-email limit above.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_SEC = 600; // 10 minutes — matches the verify-email OTP window

/** Identical response for every address (H3). `expiresIn` lets the client
 *  build its countdown anchor without the server reflecting any per-account
 *  state. */
const UNIFORM_RESPONSE = {
  message:
    'If an account exists for that email, a password reset code has been sent. Please check your inbox.',
  expiresIn: RESET_TTL_SEC,
};

function rateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: 'Too many attempts. Please try again later.', retryAfterSec },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  );
}

/** Masked address for server logs (never log full emails). */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 3)}***@${domain}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const ip = clientIp(request.headers);
    const normalizedEmail = email.trim().toLowerCase();

    // Spacing + volume limits (H2): 1 send per 60 s, 3/hour per email,
    // 10/hour per IP. Checked BEFORE any DB/SMTP work.
    const cooldown = rateLimit(`forgot:cooldown:${normalizedEmail}`, 1, 60_000);
    if (!cooldown.allowed) return rateLimitResponse(cooldown.retryAfterSec);
    const emailLimit = rateLimit(`forgot:email:${normalizedEmail}`, 3, 60 * 60_000);
    if (!emailLimit.allowed) return rateLimitResponse(emailLimit.retryAfterSec);
    const ipLimit = rateLimit(`forgot:ip:${ip}`, 10, 60 * 60_000);
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterSec);

    // Same expensive work on BOTH branches before branching (H3 timing).
    const otp = generateOTP();
    const hashedOtp = await hashOTP(otp);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        name: true,
        emailVerified: true,
        password: true,
      },
    });

    // Uniform response object built once — byte-identical for every path.
    const uniform = NextResponse.json(UNIFORM_RESPONSE, { status: 200 });

    // Only a VERIFIED account that actually has a password may reset. All
    // other cases still return `uniform` so the API reveals nothing.
    if (!user) {
      console.log(
        `[Forgot-password] no account for ${maskEmail(normalizedEmail)} — uniform response, nothing sent`
      );
      return uniform;
    }
    if (!user.emailVerified || !user.password) {
      // Owner-allowable feedback (H3): the mailbox owner — and only they —
      // learns why no code was sent. Google accounts have no password to
      // reset; unverified accounts must verify first. The API answer is
      // still the uniform one. Mirrors the register flow's account-exists
      // email. (Best-effort: a failure here never changes the response.)
      const kind: 'google' | 'unverified' = !user.password ? 'google' : 'unverified';
      console.log(
        `[Forgot-password] ${kind === 'google' ? 'no password (OAuth sign-in)' : 'unverified account'} for ${maskEmail(normalizedEmail)} — guidance email`
      );
      try {
        await sendPasswordResetGuidanceEmail(normalizedEmail, user.name, kind);
      } catch (emailError) {
        console.error('Error sending password-reset guidance email:', emailError);
      }
      return uniform;
    }

    await prisma.user.update({
      where: { email: normalizedEmail },
      data: {
        passwordResetToken: hashedOtp,
        passwordResetExpires: new Date(Date.now() + RESET_TTL_SEC * 1000),
        resetAttempts: 0,
        resetLockedUntil: null,
      },
    });

    try {
      await sendPasswordResetEmail(normalizedEmail, user.name, otp);
      console.log(`[Forgot-password] reset code emailed to ${maskEmail(normalizedEmail)}`);
    } catch (emailError) {
      // The uniform 200 must not leak that an email was (or wasn't) attempted.
      console.error('Error sending password-reset email:', emailError);
    }

    return uniform;
  } catch (error) {
    console.error('Forgot-password error:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
