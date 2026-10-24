import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - Fetch user's watchlist
// With ?symbol=&type= returns a single membership flag instead of the whole
// list (fixes the N+1 full-list fetch on every star button — audit S2).
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const type = searchParams.get('type');

    if (symbol && type) {
      // Case-insensitive: legacy rows stored the symbol exactly as submitted,
      // so an exact-match unique lookup could miss older entries.
      const item = await prisma.watchlist.findFirst({
        where: {
          userId: session.user.id,
          type,
          symbol: { equals: symbol, mode: 'insensitive' },
        },
        select: { symbol: true },
      });
      return NextResponse.json({ inWatchlist: !!item }, { status: 200 });
    }

    const watchlist = await prisma.watchlist.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ watchlist }, { status: 200 });
  } catch (error) {
    console.error('Watchlist fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch watchlist' },
      { status: 500 }
    );
  }
}

// POST - Add to watchlist
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { symbol, type, meta } = body;

    if (!symbol || !type) {
      return NextResponse.json(
        { error: 'Symbol and type are required' },
        { status: 400 }
      );
    }

    // Check if already in watchlist — case-insensitive so "btc"/"BTC" can't
    // create duplicate rows (the unique constraint alone is case-sensitive).
    const existing = await prisma.watchlist.findFirst({
      where: {
        userId: session.user.id,
        type,
        symbol: { equals: symbol, mode: 'insensitive' },
      },
    });

    if (existing) {
      // Idempotent success: the desired state ("item in watchlist") holds.
      // (Was a 400 — which made the star button roll back its optimistic
      // flip even though the item IS in the watchlist.)
      return NextResponse.json(
        { message: 'Already in watchlist', item: existing },
        { status: 200 }
      );
    }

    // Add to watchlist (symbols stored uppercase — both asset classes use
    // uppercase tickers across the app).
    // M3 race fix: two concurrent adds can both pass the findFirst above;
    // the unique constraint then rejects the loser with P2002. Treat that as
    // idempotent success instead of a generic 500.
    let watchlistItem;
    try {
      watchlistItem = await prisma.watchlist.create({
        data: {
          userId: session.user.id,
          symbol: symbol.toUpperCase(),
          type,
          meta: meta || {},
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const existingItem = await prisma.watchlist.findFirst({
          where: {
            userId: session.user.id,
            type,
            symbol: { equals: symbol, mode: 'insensitive' },
          },
        });
        return NextResponse.json(
          { message: 'Already in watchlist', item: existingItem },
          { status: 200 }
        );
      }
      throw error;
    }

    return NextResponse.json(
      { watchlistItem, message: 'Added to watchlist' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Add to watchlist error:', error);
    return NextResponse.json(
      { error: 'Failed to add to watchlist' },
      { status: 500 }
    );
  }
}

// DELETE - Remove from watchlist
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const type = searchParams.get('type');

    if (!symbol || !type) {
      return NextResponse.json(
        { error: 'Symbol and type are required' },
        { status: 400 }
      );
    }

    // Delete by id after a case-insensitive lookup: the unique constraint
    // requires the exact stored casing, which legacy rows may not share
    // with the current caller (audit S2 — toggles must actually work).
    const item = await prisma.watchlist.findFirst({
      where: {
        userId: session.user.id,
        type,
        symbol: { equals: symbol, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (item) {
      await prisma.watchlist.delete({ where: { id: item.id } });
    }

    return NextResponse.json(
      { message: 'Removed from watchlist' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Remove from watchlist error:', error);
    return NextResponse.json(
      { error: 'Failed to remove from watchlist' },
      { status: 500 }
    );
  }
}
