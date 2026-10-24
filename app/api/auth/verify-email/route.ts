import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWelcomeEmail, sendOTPEmail, generateOTP, hashOTP, verifyOTPHash } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';

/**
 * Email verification endpoint (OTP).
 *
 * Hardening (docs/AUDIT-REPORT.md H2/H3/S3):
 * - OTP is compared as a bcrypt hash — the DB never holds the plaintext code.
 * - 5 failed attempts per code lock verification for 15 minutes (per-account,
 *   persisted in the DB so a server restart can't reset the counter).
 * - Sliding-window rate limits: POST 10/15 min per email + 30/15 min per IP;
 *   resend 3/hour per email + 10/hour per IP (≥60 s effective cooldown).
 * - Enumeration-safe (H3): unknown emails, already-verified accounts and
 *   wrong codes all return the same generic message; the countdown endpoint
 *   (GET) is stateless — it computes from a client-provided expiry and never
 *   consults the database, so its response is identical for every address.
 *   The authoritative expiry is still enforced server-side in POST.
 */

const MAX_OTP_ATTEMPTS = 5;
const OTP_LOCK_MS = 15 * 60_000;
const RESEND_WINDOW_MS = 60 * 60_000;
const OTP_TTL_MS = 10 * 60_000;
/** Uniform error used for every "code doesn't work" case (H3). */
const INVALID_CODE_MSG = 'Invalid or expired OTP code';
/** Upper bound echoed back to clients, so a forged `exp` can't fake long windows. */
const MAX_ECHO_TTL_SEC = Math.ceil(OTP_TTL_MS / 1000);

/** Precomputed bcrypt hash (of an unguessable random string) used to burn the
 *  same comparison work when the email/OTP doesn't exist, so response timing
 *  can't distinguish "no such account" from "wrong code" (H3). The plaintext
 *  is unknowable and protects nothing — it exists only to give bcrypt.compare
 *  a well-formed target. */
const DUMMY_OTP_HASH = '$2a$10$QJAgjeDoAh3KiWkB4dmhD.ndODcCQG5Xu6GwICa.gxPuWZCUVmRgK';

function rateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: 'Too many attempts. Please try again later.', retryAfterSec },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  );
}

/**
 * GET: remaining OTP validity in seconds.
 *
 * Stateless by design (H3): reads the client's own `exp` (epoch ms) — the
 * value issued by register/resend and carried in the page URL — and echoes
 * back `exp - now`. It never touches the DB, so probing it with an email
 * reveals NOTHING about whether that address is registered. The real expiry
 * lives server-side in `tokenExpires` and is enforced by POST below.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ip = clientIp(request.headers);
    const limit = rateLimit(`verify-get:ip:${ip}`, 60, 15 * 60_000);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSec);

    const exp = Number(searchParams.get('exp'));
    const remainingSeconds =
      Number.isFinite(exp) && exp > Date.now()
        ? Math.min(MAX_ECHO_TTL_SEC, Math.floor((exp - Date.now()) / 1000))
        : 0;

    return NextResponse.json({ remainingSeconds }, { status: 200 });
  } catch (error) {
    console.error('Get remaining time error:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

/** POST: verify the OTP against its stored bcrypt hash. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body;

    if (!email || !otp || typeof email !== 'string' || typeof otp !== 'string') {
      return NextResponse.json(
        { error: 'Email and OTP are required' },
        { status: 400 }
      );
    }

    const ip = clientIp(request.headers);

    // Two independent sliding windows: one stops hammering a single account,
    // the other stops one IP from spraying many accounts (H2).
    const emailLimit = rateLimit(`verify-post:email:${email.trim().toLowerCase()}`, 10, 15 * 60_000);
    if (!emailLimit.allowed) return rateLimitResponse(emailLimit.retryAfterSec);
    const ipLimit = rateLimit(`verify-post:ip:${ip}`, 30, 15 * 60_000);
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterSec);

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // For unknown emails, burn the same bcrypt work as the real path before
    // replying, so timing can't separate "no such account" from "wrong code".
    const storedHash = user?.emailVerificationToken ?? null;
    const otpMatches = await verifyOTPHash(otp, storedHash ?? DUMMY_OTP_HASH);

    if (!user || user.emailVerified || !storedHash || !user.tokenExpires) {
      // H3: unknown email / already verified / no pending code all get the
      // identical generic answer.
      return NextResponse.json({ error: INVALID_CODE_MSG }, { status: 400 });
    }

    // Lockout check (H2): persisted counter, survives server restarts.
    if (user.otpLockedUntil && user.otpLockedUntil > new Date()) {
      const retryAfterSec = Math.ceil((user.otpLockedUntil.getTime() - Date.now()) / 1000);
      return rateLimitResponse(retryAfterSec);
    }

    if (user.tokenExpires < new Date() || !otpMatches) {
      // Expired AND wrong-code share one code path: for expiry we still
      // count the attempt (an attacker shouldn't get free unlimited guesses
      // against an expired-but-still-hashed code).
      const attempts = user.otpAttempts + 1;
      const lockNow = attempts >= MAX_OTP_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          otpAttempts: attempts,
          ...(lockNow ? { otpLockedUntil: new Date(Date.now() + OTP_LOCK_MS) } : {}),
        },
      });
      if (lockNow) {
        return rateLimitResponse(Math.ceil(OTP_LOCK_MS / 1000));
      }
      return NextResponse.json({ error: INVALID_CODE_MSG }, { status: 400 });
    }

    // Verify the user — clear code, attempts and lock.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        emailVerificationToken: null,
        tokenExpires: null,
        otpAttempts: 0,
        otpLockedUntil: null,
      },
    });

    // Send welcome email
    try {
      await sendWelcomeEmail(user.email, user.name);
    } catch (error) {
      console.error('Error sending welcome email:', error);
    }

    return NextResponse.json({ message: 'Email verified successfully!' }, { status: 200 });
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

/** PUT: resend OTP — throttled ≥60 s per email (email bombing, H2).
 *  Unknown/verified emails get the same uniform response (H3). */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const ip = clientIp(request.headers);

    // Two tiers: a ≥60 s cooldown between sends (spacing, not just a count)
    // AND 3/hour per email (audit H2: "resend cooldown ≥ 60 s").
    const cooldown = rateLimit(`resend-cooldown:${email.trim().toLowerCase()}`, 1, 60_000);
    if (!cooldown.allowed) return rateLimitResponse(cooldown.retryAfterSec);
    const emailLimit = rateLimit(`resend:email:${email.trim().toLowerCase()}`, 3, RESEND_WINDOW_MS);
    if (!emailLimit.allowed) return rateLimitResponse(emailLimit.retryAfterSec);
    const ipLimit = rateLimit(`resend:ip:${ip}`, 10, RESEND_WINDOW_MS);
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterSec);

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Identical body for every email address — only the mailbox owner would
    // ever notice that no code arrived.
    const uniformAccepted = NextResponse.json(
      { message: 'If this email is pending verification, a new code has been sent.', remainingSeconds: 600 },
      { status: 200 }
    );

    if (!user || user.emailVerified) {
      return uniformAccepted;
    }

    // Mint a new OTP: new hash, fresh expiry, attempts/lock reset.
    const otp = generateOTP();
    const hashedOtp = await hashOTP(otp);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: hashedOtp,
        tokenExpires: new Date(Date.now() + OTP_TTL_MS),
        otpAttempts: 0,
        otpLockedUntil: null,
      },
    });

    try {
      await sendOTPEmail(normalizedEmail, user.name, otp);
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
    }

    return uniformAccepted;
  } catch (error) {
    console.error('Resend OTP error:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
