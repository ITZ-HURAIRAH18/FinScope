"use client";

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OTPVerification from '@/components/OTPVerification';

function VerifyOTPForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  if (!email) {
    router.push('/auth/login');
    return null;
  }

  return <OTPVerification email={email} mode="login" />;
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </main>
    }>
      <VerifyOTPForm />
    </Suspense>
  );
}
