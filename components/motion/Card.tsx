'use client';

import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { type ReactNode, forwardRef } from 'react';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children?: ReactNode;
  liftAmount?: number;
  duration?: number;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, liftAmount = 8, duration = 0.3, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        whileHover={{
          y: -liftAmount,
          transition: { duration },
        }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

Card.displayName = 'Card';
