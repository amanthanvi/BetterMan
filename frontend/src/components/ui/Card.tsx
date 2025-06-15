import React from 'react';

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined' | 'glass';
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const cardVariants = {
  default: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
  elevated: 'bg-white dark:bg-gray-800 shadow-lg',
  outlined: 'bg-transparent border-2 border-gray-300 dark:border-gray-600',
  glass: 'bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border border-white/20 dark:border-gray-700/30',
};

const paddingVariants = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ 
  className, 
  variant = 'default', 
  interactive = false, 
  padding = 'md', 
  children, 
  ...props 
}: CardProps) {
  if (interactive) {
    return (
      <div 
        className={cn(
          'rounded-xl transition-all duration-200',
          cardVariants[variant],
          paddingVariants[padding],
          'cursor-pointer hover:shadow-xl dark:hover:shadow-gray-900/50',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
  
  return (
    <div 
      className={cn(
        'rounded-xl transition-all duration-200',
        cardVariants[variant],
        paddingVariants[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

Card.displayName = 'Card';

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn('mb-4 pb-4 border-b border-gray-200 dark:border-gray-700', className)}
      {...props} 
    />
  );
}

CardHeader.displayName = 'CardHeader';

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 
      className={cn('text-lg font-semibold text-gray-900 dark:text-gray-100', className)}
      {...props} 
    />
  );
}

CardTitle.displayName = 'CardTitle';

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p 
      className={cn('mt-1 text-sm text-gray-600 dark:text-gray-400', className)}
      {...props} 
    />
  );
}

CardDescription.displayName = 'CardDescription';

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('', className)} {...props} />
  );
}

CardContent.displayName = 'CardContent';

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn('mt-4 pt-4 border-t border-gray-200 dark:border-gray-700', className)}
      {...props} 
    />
  );
}

CardFooter.displayName = 'CardFooter';