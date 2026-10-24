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
 * Buy route — paper trading.
 *
 * Integrity fixes (docs/AUDIT-REPORT.md C3):
 * - The execution price is server-verified against the live provider quote
 *   (CoinGecko for crypto, Finnhub for stocks). Previously ANY client-sent
 *   price was trusted, so one tampered request could buy at $0.01.
 * - Balance is deducted with an ATOMIC conditional update
 *   (`balance >= total` guard). The previous read-then-write pattern let two
 *   concurrent buys both pass the pre-check and drive the balance negative.
 * - The holding merge (quantity + weighted average price) is one atomic SQL
 *   UPDATE ... using the pre-update row values, so concurrent buys of the
 *   same symbol can't lose quantity.
 */

/** Thrown inside the transaction to abort with a controlled HTTP-mapped error. */
class TradeError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'TradeError';
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { symbol, type, quantity, price } = await req.json();

    // Validate inputs
    if (!isValidSymbolParam(symbol) || !VALID_TRADE_TYPES.has(type)) {
      return NextResponse.json({ error: 'Invalid symbol or asset type' }, { status: 400 });
    }
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 });
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: 'Price must be a positive number' }, { status: 400 });
    }

    // Server-side price verification — the trade never executes on the
    // client's word alone (C3).
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

    // Execute transaction
    const result = await prisma.$transaction(async (tx) => {
      // Atomic conditional balance deduction: the `balance >= total` guard
      // makes concurrent buys safe — a loser gets count === 0 and aborts.
      const deducted = await tx.user.updateMany({
        where: { id: user.id, balance: { gte: total } },
        data: { balance: { decrement: total } },
      });
      if (deducted.count === 0) {
        throw new TradeError('Insufficient balance', 400);
      }

      // Atomic holding merge — in a single UPDATE statement Postgres evaluates
      // the average-price formula against the PRE-update row values, so
      // concurrent buys of the same symbol serialize correctly.
      const merged = await tx.$executeRaw`
        UPDATE "Portfolio"
        SET quantity = quantity + ${quantity},
            "averageBuyPrice" = (quantity * "averageBuyPrice" + ${quantity} * ${executionPrice}) / (quantity + ${quantity}),
            "updatedAt" = NOW()
        WHERE "userId" = ${user.id} AND symbol = ${symbol} AND type = ${type}`;

      if (merged === 0) {
        // No holding yet — create it. If a concurrent request created the row
        // between our UPDATE and this INSERT, the unique constraint fires
        // (P2002); retry the merge once instead of failing the trade.
        try {
          await tx.portfolio.create({
            data: {
              userId: user.id,
              symbol,
              type,
              quantity,
              averageBuyPrice: executionPrice,
            },
          });
        } catch (createError: any) {
          if (createError?.code === 'P2002') {
            await tx.$executeRaw`
              UPDATE "Portfolio"
              SET quantity = quantity + ${quantity},
                  "averageBuyPrice" = (quantity * "averageBuyPrice" + ${quantity} * ${executionPrice}) / (quantity + ${quantity}),
                  "updatedAt" = NOW()
              WHERE "userId" = ${user.id} AND symbol = ${symbol} AND type = ${type}`;
          } else {
            throw createError;
          }
        }
      }

      const updatedUser = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { balance: true },
      });
      const portfolioEntry = await tx.portfolio.findUnique({
        where: {
          userId_symbol_type: { userId: user.id, symbol, type },
        },
      });

      // Record transaction at the verified execution price
      const transaction = await tx.transaction.create({
        data: {
          userId: user.id,
          symbol,
          type,
          action: 'BUY',
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
    console.error('Buy transaction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
