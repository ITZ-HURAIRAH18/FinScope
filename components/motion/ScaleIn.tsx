'use client';

import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { type ReactNode, forwardRef } from 'react';

interface ScaleInProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children?: ReactNode;
  duration?: number;
  delay?: number;
  scale?: number;
  once?: boolean;
}

export const ScaleIn = forwardRef<HTMLDivElement, ScaleInProps>(
  (
    {
      children,
      duration = 0.5,
      delay = 0,
      scale = 0.9,
      once = true,
      ...props
    },
    ref
  ) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale }}
        animate={{ opacity: 1, scale: 1 }}
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

ScaleIn.displayName = 'ScaleIn';
