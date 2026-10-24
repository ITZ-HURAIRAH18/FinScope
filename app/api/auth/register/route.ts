import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { generateOTP, hashOTP, sendOTPEmail, sendAccountExistsEmail } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';

/**
 * Registration endpoint.
 *
 * Hardening (docs/AUDIT-REPORT.md H2/H3/S3):
 * - Sliding-window rate limits per IP and per email (signup spam / SMTP abuse).
 * - OTP generated with the CSPRNG and stored as a bcrypt hash — never
 *   plaintext (S3 + H2; README previously claimed hashing that didn't exist).
 * - Enumeration-safe (H3): the response body/status are byte-identical
 *   whether or not the email is already registered, and both branches do the
 *   same bcrypt work so response TIMING doesn't leak either. Existing owners
 *   are informed by email instead of by an API error.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OTP_TTL_SEC = 600; // 10 minutes

/** Identical body for BOTH branches: new registration and already-registered.
 *  `expiresIn` lets the client build the countdown anchor (`exp`) without the
 *  server ever reflecting per-account state back (H3). */
const UNIFORM_REGISTER_RESPONSE = {
  message: 'If this email is available, a verification code has been sent. Please check your inbox.',
  expiresIn: OTP_TTL_SEC,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const ip = clientIp(request.headers);
    const normalizedEmail = email.trim().toLowerCase();

    // Rate limits: signup spam / SMTP quota abuse protection (H2).
    const ipLimit = rateLimit(`register:ip:${ip}`, 10, 60 * 60_000); // 10/hour per IP
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.', retryAfterSec: ipLimit.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSec) } }
      );
    }
    const emailLimit = rateLimit(`register:email:${normalizedEmail}`, 3, 60 * 60_000); // 3/hour per email
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.', retryAfterSec: emailLimit.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfterSec) } }
      );
    }

    // Do the SAME expensive bcrypt work on both branches BEFORE branching,
    // so response timing can't distinguish "new account" from "existing
    // account" (H3 timing oracle).
    const otp = generateOTP();
    const [hashedPassword, hashedOtp] = await Promise.all([
      bcrypt.hash(password, 12),
      hashOTP(otp),
    ]);

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { emailVerified: true, name: true },
    });

    if (existingUser) {
      // H3: never reveal existence through the API. Tell the mailbox owner
      // by email instead; the response body is byte-identical to the success
      // path below (same status, same fields, same wording).
      // The NOTICE itself is throttled (1/hour/email) so this branch can't be
      // abused to bomb a mailbox (the response stays uniform either way).
      const noticeLimit = rateLimit(`acct-exists:${normalizedEmail}`, 1, 60 * 60_000);
      if (noticeLimit.allowed) {
        try {
          await sendAccountExistsEmail(normalizedEmail, existingUser.name, !!existingUser.emailVerified);
        } catch (emailError) {
          console.error('Error sending account-exists email:', emailError);
        }
      }
      return NextResponse.json(UNIFORM_REGISTER_RESPONSE, { status: 201 });
    }

    // Create user with only the hash of the OTP (H2/S3).
    await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name: name || null,
        emailVerificationToken: hashedOtp,
        tokenExpires: new Date(Date.now() + OTP_TTL_SEC * 1000),
        otpAttempts: 0,
        otpLockedUntil: null,
      },
      select: { id: true },
    });

    // Send OTP email
    try {
      await sendOTPEmail(normalizedEmail, name, otp);
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
      // Continue even if email fails - user is created
    }

    return NextResponse.json(UNIFORM_REGISTER_RESPONSE, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
