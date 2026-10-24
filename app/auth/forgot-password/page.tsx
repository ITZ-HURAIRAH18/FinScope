"use client";

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Card, CardContent } from '@/components/ui';

/**
 * Step 1 of the password-reset flow: request a code by email.
 *
 * The API answer is uniform for existing and non-existing accounts (H3 —
 * no enumeration), so the success screen is deliberately worded
 * "If an account exists…" for every address. On success we continue to
 * /auth/reset-password, which is where the emailed code is entered.
 */
function ForgotPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

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
            ? `Too many requests. Try again in ${data.retryAfterSec} seconds.`
            : data.error || 'Too many requests. Please try again later.'
        );
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        setError(data.error || 'Something went wrong');
        setIsLoading(false);
        return;
      }

      // Uniform success — proceed to the code + new-password step.
      setSent(true);
      setIsLoading(false);
    } catch {
      setError('Network error — check your connection and retry');
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <Card>
        <CardContent className="py-5 space-y-4 text-center">
          <div className="w-12 h-12 mx-auto rounded-lg bg-success-muted border border-success/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground mb-1">Check your inbox</h1>
            <p className="text-sm text-muted-foreground">
              If an account exists for <span className="text-foreground font-medium">{email}</span>,
              we&apos;ve sent a 6-digit reset code. It expires in 10 minutes.
            </p>
          </div>
          <div className="p-3 bg-secondary/60 border border-border/60 rounded-md text-xs text-muted-foreground text-left">
            Didn&apos;t receive it? Check your spam folder, or make sure the
            address matches the one you registered with.
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => router.push(`/auth/reset-password?email=${encodeURIComponent(email)}`)}
          >
            Enter the code
          </Button>
          <div className="text-center text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-primary hover:text-primary-hover transition-colors font-medium"
            >
              Use a different email
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-5 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground mb-1">Forgot your password?</h1>
          <p className="text-sm text-muted-foreground">
            Enter the email you registered with and we&apos;ll send you a code to set a new password.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-error-muted border border-error/20 rounded-md text-xs text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
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

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isLoading}>
            {isLoading ? 'Sending code…' : 'Send reset code'}
          </Button>
        </form>

        <div className="text-center text-xs text-muted-foreground">
          Remembered it?{' '}
          <Link href="/auth/login" className="text-primary hover:text-primary-hover transition-colors font-medium">
            Back to sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ForgotPasswordPage() {
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
          <ForgotPasswordForm />
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
