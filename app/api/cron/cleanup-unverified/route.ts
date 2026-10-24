import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Deletes unverified accounts whose OTP token has expired.
 *
 * SECURITY (audit finding C2): both methods require the CRON_SECRET bearer
 * token. An earlier revision exposed an unauthenticated POST that allowed
 * anyone to trigger deletions and returned deleted users' email addresses.
 * Client-side triggering was removed entirely — the Vercel cron defined in
 * vercel.json is the only caller (Vercel injects `Authorization: Bearer
 * $CRON_SECRET` automatically).
 */

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: 'Unauthorized - cron secret required' },
        { status: 401 }
      );
    }

    return await performCleanup();
  } catch (error) {
    console.error('Error in cleanup cron job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function performCleanup() {
  const now = new Date();

  // Delete expired unverified users (count only — no PII in the response)
  const deleteResult = await prisma.user.deleteMany({
    where: {
      emailVerified: null,
      tokenExpires: {
        lt: now,
      },
    },
  });

  console.log(`[cron] Deleted ${deleteResult.count} unverified users with expired tokens`);

  return NextResponse.json({
    success: true,
    deletedCount: deleteResult.count,
    timestamp: now.toISOString(),
  });
}
