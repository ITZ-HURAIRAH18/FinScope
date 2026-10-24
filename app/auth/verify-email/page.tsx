"use client";

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OTPVerification from '@/components/OTPVerification';

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  // Expiry anchor issued by the register/resend response and carried in the
  // URL — the countdown never needs to ask the server "does this email have
  // a pending code?" (that question was an enumeration oracle, audit H3).
  const expParam = searchParams.get('exp');
  const expiresAt = expParam ? Number(expParam) : null;

  useEffect(() => {
    // Redirect in an effect, not during render (React side-effect-in-render,
    // audit L-finding).
    if (!email) router.replace('/auth/register');
  }, [email, router]);

  if (!email) return null;

  return (
    <OTPVerification
      email={email}
      mode="signup"
      expiresAt={expiresAt && Number.isFinite(expiresAt) ? expiresAt : null}
    />
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground text-sm">Loading...</div>
      </main>
    }>
      <VerifyEmailForm />
    </Suspense>
  );
}
