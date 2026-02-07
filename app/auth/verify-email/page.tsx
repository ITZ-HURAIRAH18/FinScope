"use client";

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OTPVerification from '@/components/OTPVerification';

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  if (!email) {
    router.push('/auth/register');
    return null;
  }

  return <OTPVerification email={email} mode="signup" />;
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </main>
    }>
      <VerifyEmailForm />
    </Suspense>
  );
}
