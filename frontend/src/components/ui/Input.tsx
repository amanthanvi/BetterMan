import * as React from 'react';

interface InputProps {
  className?: string;
  type?: string;
  error?: string;
  label?: string;
  description?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  id?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  name?: string;
}

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(props, ref) {
    const {
      className,
      type = 'text',
      error,
      label,
      description,
      leftIcon,
      rightIcon,
      id,
      ...rest
    } = props;

    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <div className="text-gray-400 dark:text-gray-500">
                {leftIcon}
              </div>
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={type}
            className={cn(
              // Base styles
              'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm',
              'placeholder-gray-400 shadow-sm transition-colors',
              'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
              // Dark mode
              'dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500',
              'dark:focus:border-blue-400 dark:focus:ring-blue-400',
              // Error state
              error && 'border-red-300 focus:border-red-500 focus:ring-red-500 dark:border-red-600',
              // Icons
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className
            )}
            {...rest}
          />

          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <div className="text-gray-400 dark:text-gray-500">
                {rightIcon}
              </div>
            </div>
          )}
        </div>

        {description && !error && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
export type { InputProps };