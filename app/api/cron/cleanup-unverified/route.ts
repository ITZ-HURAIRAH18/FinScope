import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

// Allow POST for client-side triggering (no auth required)
export async function POST(request: NextRequest) {
  try {
    return await performCleanup();
  } catch (error) {
    console.error('Error in cleanup job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function performCleanup() {
  const now = new Date();

  // Find all unverified users whose token has expired
  const expiredUsers = await prisma.user.findMany({
    where: {
      emailVerified: null,
      tokenExpires: {
        lt: now,
      },
    },
  });

  // Delete expired unverified users
  const deleteResult = await prisma.user.deleteMany({
    where: {
      emailVerified: null,
      tokenExpires: {
        lt: now,
      },
    },
  });

  console.log(`Deleted ${deleteResult.count} unverified users with expired tokens`);

  return NextResponse.json({
    success: true,
    deletedCount: deleteResult.count,
    deletedUsers: expiredUsers.map(u => ({ id: u.id, email: u.email })),
    timestamp: now.toISOString(),
  });
}
