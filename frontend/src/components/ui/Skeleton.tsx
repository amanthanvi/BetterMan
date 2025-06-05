import React from 'react';
import { cn } from '@/utils/cn';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'text',
  width,
  height,
  animation = 'pulse',
  ...props
}) => {
  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-md',
  };

  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  };

  return (
    <div
      className={cn(
        'bg-gray-200 dark:bg-gray-700',
        variantStyles[variant],
        animationStyles[animation],
        className
      )}
      style={{
        width: width || (variant === 'circular' ? '40px' : '100%'),
        height: height || (variant === 'text' ? '1em' : '40px'),
      }}
      {...props}
    />
  );
};

// Document skeleton component
export const DocumentSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <Skeleton variant="text" width="200px" height="2rem" />
      <Skeleton variant="rounded" width="80px" height="1.5rem" />
    </div>
    <Skeleton variant="text" width="60%" />
    <Skeleton variant="text" width="80%" />
    <div className="space-y-2 mt-6">
      <Skeleton variant="text" />
      <Skeleton variant="text" />
      <Skeleton variant="text" width="90%" />
      <Skeleton variant="text" width="70%" />
    </div>
  </div>
);

// Search result skeleton
export const SearchResultSkeleton: React.FC = () => (
  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
    <div className="flex items-start gap-3">
      <Skeleton variant="circular" width="40px" height="40px" />
      <div className="flex-1 space-y-2">
        <Skeleton variant="text" width="30%" />
        <Skeleton variant="text" width="80%" />
        <Skeleton variant="text" width="60%" />
      </div>
    </div>
  </div>
);

// Card skeleton
export const CardSkeleton: React.FC = () => (
  <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
    <Skeleton variant="rectangular" height="200px" className="mb-4" />
    <Skeleton variant="text" width="60%" height="1.5rem" className="mb-2" />
    <Skeleton variant="text" />
    <Skeleton variant="text" width="80%" />
  </div>
);