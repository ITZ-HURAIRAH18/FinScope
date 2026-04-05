import { InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'subtle';
  error?: string;
  label?: string;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = 'default',
      error,
      label,
      helperText,
      className,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'input',
            variant === 'subtle' && 'input-subtle',
            error && 'border-error focus-visible:ring-error/50 focus-visible:border-error',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-error">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-xs text-muted-foreground">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
export type { InputProps };
