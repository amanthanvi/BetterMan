"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}

const badgeVariants = {
  default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  primary: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  info: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
};

const badgeSizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'md', animate = false, children, ...props }, ref) => {
    const Component = animate ? motion.span : 'span';
    
    return (
      <Component
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium rounded-full',
          badgeVariants[variant],
          badgeSizes[size],
          className
        )}
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: 1 } : undefined}
        transition={animate ? { type: 'spring', stiffness: 500, damping: 25 } : undefined}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Badge.displayName = 'Badge';

// Compound component for badge with icon
export const BadgeIcon: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className 
}) => (
  <span className={cn('mr-1 -ml-0.5', className)}>{children}</span>
);

// Compound component for badge with close button
export const BadgeClose: React.FC<{ 
  onClick?: () => void; 
  className?: string;
  'aria-label'?: string;
}> = ({ 
  onClick, 
  className,
  'aria-label': ariaLabel = 'Remove'
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'ml-1 -mr-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full',
      'hover:bg-black/10 dark:hover:bg-white/10 transition-colors',
      className
    )}
    aria-label={ariaLabel}
  >
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
);