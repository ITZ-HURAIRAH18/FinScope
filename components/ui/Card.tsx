import { HTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'glass-subtle' | 'elevated';
  hoverable?: boolean;
  children: React.ReactNode;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      hoverable = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      default: 'card',
      glass: 'glass',
      'glass-subtle': 'glass-subtle',
      elevated: 'card card-elevated',
    };

    return (
      <div
        ref={ref}
        className={clsx(
          variantClasses[variant],
          hoverable && 'card-hover',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// Card Header Component
function CardHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('px-5 py-4 border-b border-card-border', className)}
      {...props}
    >
      {children}
    </div>
  );
}

CardHeader.displayName = 'CardHeader';

// Card Content Component
function CardContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('px-5 py-4', className)} {...props}>
      {children}
    </div>
  );
}

CardContent.displayName = 'CardContent';

// Card Footer Component
function CardFooter({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('px-5 py-3 border-t border-card-border bg-secondary/30', className)}
      {...props}
    >
      {children}
    </div>
  );
}

CardFooter.displayName = 'CardFooter';

// Card Title Component
function CardTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={clsx('text-lg font-semibold text-foreground tracking-tight', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

CardTitle.displayName = 'CardTitle';

// Card Description Component
function CardDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={clsx('text-sm text-muted-foreground mt-0.5', className)}
      {...props}
    >
      {children}
    </p>
  );
}

CardDescription.displayName = 'CardDescription';

export { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription };
export type { CardProps };
