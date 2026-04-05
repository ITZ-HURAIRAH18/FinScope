'use client';

import { motion } from 'framer-motion';
import type { HTMLMotionProps, Variants } from 'framer-motion';
import { type ReactNode, forwardRef } from 'react';

interface StaggerContainerProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children?: ReactNode;
  staggerDelay?: number;
  baseDuration?: number;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

const childVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: 'easeOut',
    },
  },
};

export const StaggerContainer = forwardRef<HTMLDivElement, StaggerContainerProps>(
  ({ children, staggerDelay = 0.1, baseDuration = 0.5, ...props }, ref) => {
    const variants = {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: staggerDelay,
          delayChildren: 0.05,
        },
      },
    };

    const childVars = {
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: {
          duration: baseDuration,
          ease: 'easeOut' as const,
        },
      },
    };

    return (
      <motion.div
        ref={ref}
        variants={variants}
        initial="hidden"
        animate="visible"
        {...props}
      >
        {Array.isArray(children)
          ? children.map((child, index) => (
              <motion.div key={index} variants={childVars}>
                {child}
              </motion.div>
            ))
          : children}
      </motion.div>
    );
  }
);

StaggerContainer.displayName = 'StaggerContainer';
