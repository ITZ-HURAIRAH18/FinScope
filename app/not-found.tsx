import Link from "next/link";
import { Button } from "@/components/ui";

/**
 * 404 page (audit: didn't exist — users hitting a bad URL got the raw
 * Next.js default).
 */
export default function NotFound() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-5xl font-semibold text-primary font-mono mb-4">404</div>
        <h1 className="text-lg font-semibold text-foreground mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-6">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/">
            <Button variant="primary" size="sm">Go home</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="secondary" size="sm">Markets</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
