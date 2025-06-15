import React from 'react';
import { cn } from '@/utils/cn';

export interface PremiumButtonProps extends HTMLMotionProps<"button"> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'gradient';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  pill?: boolean;
  glow?: boolean;
}

export const PremiumButton = React.forwardRef<HTMLButtonElement, PremiumButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      pill = false,
      glow = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = cn(
      'relative inline-flex items-center justify-center font-medium',
      'transition-all duration-200 ease-out',
      'focus:outline-none focus:ring-2 focus:ring-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      pill ? 'rounded-full' : 'rounded-lg',
      fullWidth && 'w-full'
    );

    const sizeStyles = {
      xs: 'px-2.5 py-1.5 text-xs gap-1.5',
      sm: 'px-3 py-2 text-sm gap-2',
      md: 'px-4 py-2.5 text-base gap-2.5',
      lg: 'px-6 py-3 text-lg gap-3',
      xl: 'px-8 py-4 text-xl gap-3.5',
    };

    const variantStyles = {
      primary: cn(
        'bg-blue-600 text-white',
        'hover:bg-blue-700 active:bg-blue-800',
        'focus:ring-blue-500',
        'shadow-sm hover:shadow-md',
        glow && 'shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40'
      ),
      secondary: cn(
        'bg-gray-100 text-gray-900',
        'hover:bg-gray-200 active:bg-gray-300',
        'dark:bg-gray-800 dark:text-gray-100',
        'dark:hover:bg-gray-700 dark:active:bg-gray-600',
        'focus:ring-gray-500 dark:focus:ring-gray-400',
        'border border-gray-200 dark:border-gray-700'
      ),
      ghost: cn(
        'text-gray-700 dark:text-gray-300',
        'hover:bg-gray-100 dark:hover:bg-gray-800',
        'active:bg-gray-200 dark:active:bg-gray-700',
        'focus:ring-gray-500'
      ),
      danger: cn(
        'bg-red-600 text-white',
        'hover:bg-red-700 active:bg-red-800',
        'focus:ring-red-500',
        'shadow-sm hover:shadow-md',
        glow && 'shadow-lg shadow-red-500/25 hover:shadow-red-500/40'
      ),
      success: cn(
        'bg-emerald-600 text-white',
        'hover:bg-emerald-700 active:bg-emerald-800',
        'focus:ring-emerald-500',
        'shadow-sm hover:shadow-md',
        glow && 'shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40'
      ),
      gradient: cn(
        'bg-gradient-to-r from-blue-500 to-purple-600',
        'hover:from-blue-600 hover:to-purple-700',
        'text-white shadow-md hover:shadow-lg',
        'focus:ring-purple-500',
        glow && 'shadow-xl shadow-purple-500/30 hover:shadow-purple-500/50'
      ),
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          sizeStyles[size],
          variantStyles[variant],
          className
        )}
        disabled={disabled || isLoading}>
        {...props}
      >
        {/* Loading spinner */}
        {isLoading && (
          <span
            className="absolute inset-0 flex items-center justify-center"}
          >
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </span>
        )}

        {/* Button content */}
        <span
          className={cn(
            'inline-flex items-center gap-2',
            isLoading && 'opacity-0'
          )}
        >
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </span>

        {/* Hover effect for gradient variant */}
        {variant === 'gradient' && (
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0">
            style={{ mixBlendMode: 'overlay'} /> }}
        )}
      </button>
    );
  }
);

PremiumButton.displayName = 'PremiumButton';