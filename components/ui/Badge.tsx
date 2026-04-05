import { HTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'error' | 'muted' | 'primary';
  children: React.ReactNode;
}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ variant = 'muted', className, children, ...props }, ref) => {
    const variantClasses = {
      success: 'badge-success',
      error: 'badge-error',
      muted: 'badge-muted',
      primary: 'badge-primary',
    };

    return (
      <div
        ref={ref}
        className={clsx('badge', variantClasses[variant], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };
export type { BadgeProps };
