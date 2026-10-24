"use client";

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Card, CardContent } from '@/components/ui';

/**
 * Step 2 of the password-reset flow: enter the emailed 6-digit code and a
 * new password. Mirrors the hardened verify-email contract:
 * - server errors are generic ("Invalid or expired code") for every
 *   failure mode, so this page never reveals whether the email exists;
 * - 429 carries a `retryAfterSec` which we surface verbatim (lockout or
 *   rate limit — both mean "wait");
 * - resend simply re-requests a code for the same address (60 s server
 *   cooldown, 3/hour cap).
 */
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email') || '';

  const [email, setEmail] = useState(emailParam);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [done, setDone] = useState(false);

  // If the user landed here without an email (direct navigation), ask for it.
  const needsEmail = !emailParam;

  useEffect(() => {
    if (emailParam) setEmail(emailParam);
  }, [emailParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 429) {
        setError(
          data.retryAfterSec
            ? `Too many attempts. Try again in ${data.retryAfterSec} seconds.`
            : data.error || 'Too many attempts. Please try again later.'
        );
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        setError(data.error || 'Something went wrong');
        setIsLoading(false);
        return;
      }

      setDone(true);
      setIsLoading(false);
      // Land on login with a success banner (login page reads ?reset=success).
      setTimeout(() => router.push('/auth/login?reset=success'), 1800);
    } catch {
      setError('Network error — check your connection and retry');
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    setIsResending(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 429) {
        setError(
          data.retryAfterSec
            ? `New code requested too soon — try again in ${data.retryAfterSec} seconds.`
            : 'Too many requests. Please try again later.'
        );
      } else if (response.ok) {
        setInfo('If an account exists, a new code has been sent. It expires in 10 minutes.');
        setOtp('');
      } else {
        setError(data.error || 'Could not resend the code');
      }
    } catch {
      setError('Network error — could not resend');
    } finally {
      setIsResending(false);
    }
  };

  if (done) {
    return (
      <Card>
        <CardContent className="py-5 space-y-4 text-center">
          <div className="w-12 h-12 mx-auto rounded-lg bg-success-muted border border-success/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground mb-1">Password reset</h1>
            <p className="text-sm text-muted-foreground">
              Your password has been changed. Redirecting you to sign in…
            </p>
          </div>
          <Button variant="primary" size="lg" className="w-full" onClick={() => router.push('/auth/login?reset=success')}>
            Go to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-5 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground mb-1">Set a new password</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code we emailed you, then choose a new password.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-error-muted border border-error/20 rounded-md text-xs text-error">
            {error}
          </div>
        )}
        {info && (
          <div className="p-3 bg-success-muted border border-success/20 rounded-md text-xs text-success">
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {needsEmail && (
            <Input
              id="email"
              type="email"
              label="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@example.com"
            />
          )}

          <Input
            id="otp"
            type="text"
            label="Verification Code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus={!needsEmail}
            placeholder="123456"
          />

          <Input
            id="password"
            type="password"
            label="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="At least 6 characters"
          />

          <Input
            id="confirmPassword"
            type="password"
            label="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Repeat the new password"
          />

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isLoading}>
            {isLoading ? 'Resetting…' : 'Reset password'}
          </Button>
        </form>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Link href="/auth/login" className="text-primary hover:text-primary-hover transition-colors font-medium">
            Back to sign in
          </Link>
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="text-primary hover:text-primary-hover transition-colors font-medium disabled:opacity-50"
          >
            {isResending ? 'Sending…' : 'Resend code'}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" viewBox="0 0 24 12" fill="currentColor">
                <path d="M0 11.5L2 9.5L5 10.5L8 6.5L11 8.5L14 3.5L17 5.5L20 1.5L22 2.5L24 0.5V12H0V11.5Z" />
              </svg>
            </div>
            <span className="text-2xl font-semibold text-foreground tracking-tight">FinScope</span>
          </Link>
        </div>

        <Suspense
          fallback={
            <main className="text-center text-sm text-muted-foreground">Loading…</main>
          }
        >
          <ResetPasswordForm />
        </Suspense>

        {/* Back to Home */}
        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
