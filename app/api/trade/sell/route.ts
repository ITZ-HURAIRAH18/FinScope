import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  isValidSymbolParam,
  VALID_TRADE_TYPES,
  verifyTradePrice,
  PriceUnavailableError,
  PRICE_TOLERANCE_PCT,
} from '@/lib/trade-price';

/**
 * Sell route — paper trading.
 *
 * Integrity fixes (docs/AUDIT-REPORT.md C3):
 * - The execution price is server-verified against the live provider quote.
 *   Previously the client's `price` was trusted verbatim.
 * - The holding decrement is ATOMIC with a `quantity >= sold` guard
 *   (`updateMany` + conditional). The old read-then-write pattern let two
 *   concurrent sells both pass the pre-check and drive the holding negative
 *   (free money). A losing concurrent sell now gets a clean 400.
 * - Balance credit uses an atomic `increment`.
 */

class TradeError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'TradeError';
  }
}

/** Float holdings that round down to dust are cleaned up, not left as rows. */
const DUST_EPSILON = 1e-9;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { symbol, type, quantity, price } = await req.json();

    if (!isValidSymbolParam(symbol) || !VALID_TRADE_TYPES.has(type)) {
      return NextResponse.json({ error: 'Invalid symbol or asset type' }, { status: 400 });
    }
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 });
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: 'Price must be a positive number' }, { status: 400 });
    }

    // Server-side price verification (C3).
    let executionPrice: number;
    try {
      const verification = await verifyTradePrice(symbol, type, price);
      if (verification.deviationPct > PRICE_TOLERANCE_PCT) {
        return NextResponse.json(
          {
            error: 'Submitted price deviates from the current market price',
            currentPrice: verification.executionPrice,
            deviationPct: Number(verification.deviationPct.toFixed(2)),
          },
          { status: 409 }
        );
      }
      executionPrice = verification.executionPrice;
    } catch (error) {
      if (error instanceof PriceUnavailableError) {
        return NextResponse.json(
          { error: 'Could not verify the current market price. Please try again shortly.' },
          { status: 503 }
        );
      }
      throw error;
    }

    const total = quantity * executionPrice;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const holding = await tx.portfolio.findUnique({
        where: {
          userId_symbol_type: { userId: user.id, symbol, type },
        },
      });

      if (!holding) {
        throw new TradeError('You do not own this asset', 400);
      }

      // Atomic conditional decrement — the guard re-checks the quantity at
      // write time, so a concurrent sell can't overdraw the holding (C3).
      const sold = await tx.portfolio.updateMany({
        where: { id: holding.id, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (sold.count === 0) {
        throw new TradeError('Insufficient holdings', 400);
      }

      // Clean up fully-sold holdings (float dust below 1e-9 counts as zero).
      await tx.portfolio.deleteMany({
        where: { id: holding.id, quantity: { lte: DUST_EPSILON } },
      });

      // Atomic balance credit.
      await tx.user.update({
        where: { id: user.id },
        data: { balance: { increment: total } },
      });

      const updatedUser = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { balance: true },
      });
      const portfolioEntry = await tx.portfolio.findUnique({
        where: {
          userId_symbol_type: { userId: user.id, symbol, type },
        },
      });

      // Record transaction at the verified execution price.
      const transaction = await tx.transaction.create({
        data: {
          userId: user.id,
          symbol,
          type,
          action: 'SELL',
          quantity,
          price: executionPrice,
          total,
        },
      });

      return {
        balance: updatedUser.balance,
        portfolio: portfolioEntry,
        transaction,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TradeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Sell transaction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
