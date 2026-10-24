"use client";

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OTPVerification from '@/components/OTPVerification';

function VerifyOTPForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  useEffect(() => {
    // Redirect in an effect, not during render (React side-effect-in-render,
    // audit L-finding).
    if (!email) router.replace('/auth/login');
  }, [email, router]);

  if (!email) return null;

  // Login flow: no expiry anchor exists yet (the user was bounced here from
  // the login form), so the component starts a fresh local window. The server
  // still enforces the real `tokenExpires` when the code is submitted.
  return <OTPVerification email={email} mode="login" />;
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground text-sm">Loading...</div>
      </main>
    }>
      <VerifyOTPForm />
    </Suspense>
  );
}
