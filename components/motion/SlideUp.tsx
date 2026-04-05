'use client';

import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { type ReactNode, forwardRef } from 'react';

interface SlideUpProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children?: ReactNode;
  duration?: number;
  delay?: number;
  distance?: number;
  once?: boolean;
}

export const SlideUp = forwardRef<HTMLDivElement, SlideUpProps>(
  (
    {
      children,
      duration = 0.6,
      delay = 0,
      distance = 60,
      once = true,
      ...props
    },
    ref
  ) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: distance }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration,
          delay,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        viewport={{ once }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

SlideUp.displayName = 'SlideUp';
