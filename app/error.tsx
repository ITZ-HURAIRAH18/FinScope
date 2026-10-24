"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

/**
 * Route-level error boundary (audit: "No app/error.tsx / global-error.tsx /
 * not-found.tsx anywhere — UI-UPGRADE-SUMMARY.md claims error boundaries with
 * user-friendly messages (false)").
 *
 * Next.js calls this when a route segment throws during rendering. It must
 * be a client component and must not depend on the app's providers (they may
 * be the thing that crashed).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In a real deployment this is where you'd report to Sentry/Datadog.
    console.error("[RouteError]", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-error-muted border border-error/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-6">
          An unexpected error occurred while rendering this page.
          {error.digest && (
            <span className="block mt-2 text-xs font-mono">Reference: {error.digest}</span>
          )}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="primary" size="sm" onClick={reset}>
            Try again
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.location.href = "/"}>
            Go home
          </Button>
        </div>
      </div>
    </main>
  );
}
