import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { symbol, type, quantity, price } = await req.json();

    // Validate inputs
    if (!symbol || !type || !quantity || !price) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (quantity <= 0 || price <= 0) {
      return NextResponse.json(
        { error: 'Quantity and price must be positive' },
        { status: 400 }
      );
    }

    const total = quantity * price;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user has the holding
    const holding = await prisma.portfolio.findUnique({
      where: {
        userId_symbol_type: {
          userId: user.id,
          symbol,
          type,
        },
      },
    });

    if (!holding) {
      return NextResponse.json(
        { error: 'You do not own this asset' },
        { status: 400 }
      );
    }

    if (holding.quantity < quantity) {
      return NextResponse.json(
        { error: 'Insufficient holdings' },
        { status: 400 }
      );
    }

    // Execute transaction
    const result = await prisma.$transaction(async (tx) => {
      // Add balance
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { balance: user.balance + total },
      });

      // Update or delete portfolio entry
      let portfolioEntry;
      if (holding.quantity === quantity) {
        // Sell all - delete the holding
        await tx.portfolio.delete({
          where: { id: holding.id },
        });
        portfolioEntry = null;
      } else {
        // Partial sell - update quantity
        portfolioEntry = await tx.portfolio.update({
          where: { id: holding.id },
          data: {
            quantity: holding.quantity - quantity,
          },
        });
      }

      // Record transaction
      const transaction = await tx.transaction.create({
        data: {
          userId: user.id,
          symbol,
          type,
          action: 'SELL',
          quantity,
          price,
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
    console.error('Sell transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
