'use client';

import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { type ReactNode, forwardRef } from 'react';

interface FadeInProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children?: ReactNode;
  yOffset?: number;
  duration?: number;
  delay?: number;
  once?: boolean;
}

export const FadeIn = forwardRef<HTMLDivElement, FadeInProps>(
  (
    {
      children,
      yOffset = 20,
      duration = 0.5,
      delay = 0,
      once = true,
      ...props
    },
    ref
  ) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: yOffset }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration, delay, ease: 'easeOut' }}
        viewport={{ once }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

FadeIn.displayName = 'FadeIn';
