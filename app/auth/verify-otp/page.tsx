"use client";

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function VerifyOTPForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    } else {
      router.push('/auth/login');
    }
  }, [searchParams, router]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      setError('Your verification time has expired. Please register again.');
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Verification failed');
        setIsLoading(false);
        return;
      }

      setSuccess('Email verified successfully! Redirecting to login...');
      setTimeout(() => {
        router.push('/auth/login?verified=success');
      }, 2000);
    } catch (error) {
      setError('Something went wrong');
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError('');
    setSuccess('');
    setIsResending(true);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to resend OTP');
        setIsResending(false);
        return;
      }

      setSuccess('New OTP sent to your email!');
      setTimeLeft(600); // Reset timer
      setIsResending(false);
    } catch (error) {
      setError('Something went wrong');
      setIsResending(false);
    }
  };

  return (
    <main className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="w-12 h-12 bg-gradient-to-r from-red-600 via-red-500 to-pink-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-2xl">F</span>
            </div>
            <span className="text-3xl font-bold gradient-text">FinScope</span>
          </Link>
        </div>

        {/* Verification Form */}
        <div className="glass-card p-8 rounded-2xl">
          <h1 className="text-3xl font-bold text-white mb-2">Verify Your Email</h1>
          <p className="text-gray-400 mb-6">
            We sent a 6-digit code to <span className="text-white font-semibold">{email}</span>
          </p>

          {/* Timer */}
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg text-center">
            <p className="text-blue-400 text-sm mb-1">Time remaining</p>
            <p className="text-white text-2xl font-bold font-mono">{formatTime(timeLeft)}</p>
          </div>

          {success && (
            <div className="mb-4 p-4 bg-green-500/10 border border-green-500/50 rounded-lg">
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-300 mb-2">
                Verification Code
              </label>
              <input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white text-center text-2xl font-mono tracking-widest placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || otp.length !== 6 || timeLeft <= 0}
              className="w-full px-6 py-3 bg-gradient-to-r from-red-600 via-red-500 to-pink-500 rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-red-500/50 transition transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? 'Verifying...' : 'Verify Email'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm mb-2">
              Didn&apos;t receive the code?
            </p>
            <button
              onClick={handleResendOTP}
              disabled={isResending || timeLeft <= 0}
              className="text-red-400 hover:text-red-300 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResending ? 'Sending...' : 'Resend OTP'}
            </button>
          </div>
        </div>

        {/* Back to Login */}
        <div className="mt-6 text-center">
          <Link href="/auth/login" className="text-gray-400 hover:text-white transition">
            ← Back to Login
          </Link>
        </div>
      </div>
    </main>
  );
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
