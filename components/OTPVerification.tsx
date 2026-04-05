"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Card, CardContent } from '@/components/ui';

interface OTPVerificationProps {
  email: string;
  mode?: 'signup' | 'login';
}

export default function OTPVerification({ email, mode = 'signup' }: OTPVerificationProps) {
  const router = useRouter();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isFetchingTime, setIsFetchingTime] = useState(true);

  useEffect(() => {
    const fetchRemainingTime = async () => {
      try {
        const response = await fetch(`/api/auth/verify-email?email=${encodeURIComponent(email)}`);
        const data = await response.json();

        if (response.ok && data.remainingSeconds !== undefined) {
          setTimeLeft(data.remainingSeconds);
        }
      } catch (error) {
        console.error('Error fetching remaining time:', error);
      } finally {
        setIsFetchingTime(false);
      }
    };

    fetchRemainingTime();
  }, [email]);

  useEffect(() => {
    if (isFetchingTime || timeLeft === null) return;

    if (timeLeft <= 0) {
      if (mode === 'signup') {
        setError('Your verification time has expired. Your account has been deleted. Please register again.');
      } else {
        setError('Your verification time has expired. Please request a new code.');
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, mode, isFetchingTime]);

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    const newOtp = pastedData.split('');
    setOtp([...newOtp, ...Array(6 - newOtp.length).fill('')]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otpCode }),
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

  const handleResend = async () => {
    setIsResending(true);
    setError('');
    setSuccess('');

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
      setOtp(['', '', '', '', '', '']);
      if (data.remainingSeconds !== undefined) {
        setTimeLeft(data.remainingSeconds);
      } else {
        setTimeLeft(600);
      }
      setIsResending(false);
    } catch (error) {
      console.error('Resend error:', error);
      setError('Something went wrong');
      setIsResending(false);
    }
  };

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

        {/* Verification Form */}
        <Card>
          <CardContent className="py-5 space-y-5">
            <div className="text-center">
              <div className="w-12 h-12 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25v-10.5a2.25 2.25 0 012.25-2.25h15a2.25 2.25 0 012.25 2.25z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75v-3m0 0v-3m0 0h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-foreground mb-1">Verify Your Email</h1>
              <p className="text-sm text-muted-foreground">
                {mode === 'signup' ? "We've sent a 6-digit code to" : "Please verify your email to continue"}
                <br />
                <span className="text-foreground font-medium">{email}</span>
              </p>
            </div>

            {/* Timer */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Time remaining:{' '}
                {isFetchingTime ? (
                  <span className="font-mono">Loading...</span>
                ) : (
                  <span className={`font-mono font-medium ${timeLeft !== null && timeLeft <= 0 ? 'text-error' : 'text-primary'}`}>
                    {formatTime(timeLeft)}
                  </span>
                )}
              </p>
              {mode === 'signup' && (
                <p className="text-xs text-muted-foreground mt-1">Account will be deleted if not verified</p>
              )}
            </div>

            {success && (
              <div className="p-3 bg-success-muted border border-success/20 rounded-md text-xs text-success text-center">
                {success}
              </div>
            )}

            {error && (
              <div className="p-3 bg-error-muted border border-error/20 rounded-md text-xs text-error text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* OTP Input */}
              <div className="flex justify-center gap-2">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    id={`otp-${index}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    className="w-11 h-12 text-center text-lg font-semibold rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50"
                    disabled={isLoading}
                  />
                ))}
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isLoading || otp.join('').length !== 6 || timeLeft === null || timeLeft <= 0}>
                {isLoading ? 'Verifying...' : 'Verify Email'}
              </Button>
            </form>

            {/* Resend */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Didn&apos;t receive the code?{' '}
                <button
                  onClick={handleResend}
                  disabled={isResending || timeLeft === null || timeLeft <= 0}
                  className="text-primary hover:text-primary-hover transition-colors font-medium disabled:opacity-50"
                >
                  {isResending ? 'Sending...' : 'Resend OTP'}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Back to Login */}
        <div className="mt-6 text-center">
          <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Login
          </Link>
        </div>
      </div>
    </main>
  );
}
