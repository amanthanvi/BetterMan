/**
 * Design System Components
 * 
 * Reusable, accessible, and performant UI components
 * following the BetterMan design system.
 */

import React, { forwardRef, ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';
import * as tokens from './tokens';

// Button variants
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default: 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600',
        destructive: 'bg-error-600 text-white hover:bg-error-700 dark:bg-error-500 dark:hover:bg-error-600',
        outline: 'border border-gray-300 bg-transparent hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
        ghost: 'hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100',
        link: 'text-primary-600 underline-offset-4 hover:underline dark:text-primary-400',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <button className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props />
    );
  }
);
Button.displayName = 'Button';

// Input component
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input type={type}
        className={cn(
          'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
          error
            ? 'border-error-500 focus-visible:ring-error-500'
            : 'border-gray-300 dark:border-gray-700',
          className
        )}
        ref={ref}
        {...props />
    );
  }
);
Input.displayName = 'Input';

// Card component
const cardVariants = cva(
  'rounded-lg border bg-card text-card-foreground',
  {
    variants: {
      variant: {
        default: 'border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900',
        elevated: 'border-gray-200 bg-white shadow-md hover:shadow-lg transition-shadow dark:border-gray-800 dark:bg-gray-900',
        outline: 'border-gray-300 dark:border-gray-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div ref={ref}
        className={cn(cardVariants({ variant, className }))}
        {...props />
    );
  }
);
Card.displayName = 'Card';

// Badge component
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
        secondary: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
        destructive: 'bg-error-100 text-error-800 dark:bg-error-900 dark:text-error-200',
        outline: 'border border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300',
        success: 'bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200',
        warning: 'bg-warning-100 text-warning-800 dark:bg-warning-900 dark:text-warning-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div ref={ref}
        className={cn(badgeVariants({ variant, className }))}
        {...props />
    );
  }
);
Badge.displayName = 'Badge';

// Skeleton loader
export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'text', animation = 'pulse', ...props }, ref) => {
    const baseClasses = 'bg-gray-200 dark:bg-gray-700';
    const animationClasses = {
      pulse: 'animate-pulse',
      wave: 'animate-shimmer',
      none: '',
    };
    const variantClasses = {
      text: 'h-4 w-full rounded',
      circular: 'rounded-full',
      rectangular: 'rounded-md',
    };

    return (
      <div ref={ref}
        className={cn(
          baseClasses,
          animationClasses[animation],
          variantClasses[variant],
          className
        )}
        {...props />
    );
  }
);
Skeleton.displayName = 'Skeleton';

// Alert component
const alertVariants = cva(
  'relative w-full rounded-lg border p-4',
  {
    variants: {
      variant: {
        default: 'bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100',
        destructive: 'border-error-200 bg-error-50 text-error-900 dark:border-error-800 dark:bg-error-950 dark:text-error-100',
        warning: 'border-warning-200 bg-warning-50 text-warning-900 dark:border-warning-800 dark:bg-warning-950 dark:text-warning-100',
        success: 'border-success-200 bg-success-50 text-success-900 dark:border-success-800 dark:bg-success-950 dark:text-success-100',
        info: 'border-info-200 bg-info-50 text-info-900 dark:border-info-800 dark:bg-info-950 dark:text-info-100',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: React.ReactNode;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, icon, children, ...props }, ref) => {
    return (
      <div ref={ref}
        role="alert"
        className={cn(alertVariants({ variant, className }))}
        {...props}
      >
        {icon && <div className="mb-2">{icon}</div>}
        {children}
      </div>
    );
  }
);
Alert.displayName = 'Alert';

// Loading spinner
export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = 'md', ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-8 w-8',
      xl: 'h-12 w-12',
    };

    return (
      <div ref={ref}
        className={cn('relative', sizeClasses[size], className)}
        {...props}
      >
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-gray-300 dark:border-gray-700" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary-600 border-t-transparent dark:border-primary-400" />
      </div>
    );
  }
);
Spinner.displayName = 'Spinner';

// Tooltip wrapper (basic implementation)
export interface TooltipProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  ({ children, content, position = 'top', className, ...props }, ref) => {
    return (
      <div ref={ref}
        className={cn('group relative inline-block', className)}
        {...props}
      >
        {children}
        <div className={cn(
            'pointer-events-none absolute z-tooltip scale-0 rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100 dark:bg-gray-100 dark:text-gray-900',
            {
              'bottom-full left-1/2 mb-2 -translate-x-1/2': position === 'top',
              'left-1/2 top-full mt-2 -translate-x-1/2': position === 'bottom',
              'right-full top-1/2 mr-2 -translate-y-1/2': position === 'left',
              'left-full top-1/2 ml-2 -translate-y-1/2': position === 'right',
            }
          )}
        >
          {content}
          <div className={cn(
              'absolute h-2 w-2 rotate-45 bg-gray-900 dark:bg-gray-100',
              {
                'left-1/2 top-full -translate-x-1/2 -translate-y-1': position === 'top',
                'bottom-full left-1/2 -translate-x-1/2 translate-y-1': position === 'bottom',
                'left-full top-1/2 -translate-x-1 -translate-y-1/2': position === 'left',
                'right-full top-1/2 -translate-y-1/2 translate-x-1': position === 'right',
              }
            ) />
        </div>
      </div>
    );
  }
);
Tooltip.displayName = 'Tooltip';

// Export all components
export default {
  Button,
  Input,
  Card,
  Badge,
  Skeleton,
  Alert,
  Spinner,
  Tooltip,
};