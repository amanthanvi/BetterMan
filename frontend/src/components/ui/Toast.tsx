import React, { useEffect } from 'react';
import { CheckIcon, Cross1Icon, InfoCircledIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { cn } from '@/utils/cn';

interface ToastProps {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({
  id,
  message,
  type = 'info',
  duration = 3000,
  onClose,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const icons = {
    success: <CheckIcon className="w-5 h-5" />,
    error: <Cross1Icon className="w-5 h-5" />,
    info: <InfoCircledIcon className="w-5 h-5" />,
    warning: <ExclamationTriangleIcon className="w-5 h-5" />,
  };

  const colors = {
    success: 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    error: 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400',
    info: 'bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
    warning: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  };

  return (
    <div className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg',
        colors[type]
      )}
    >
      {icons[type]}
      <p className="text-sm font-medium">{message}</p>
      <button
        onClick={() => onClose(id)}
        className="ml-auto hover:opacity-70 transition-opacity"
      >
        <Cross1Icon className="w-4 h-4" />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type?: ToastProps['type'] }>;
  removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      <>
        {toasts.map((toast) => (
          <Toast key={toast.id}
                    id={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={removeToast} />
        ))}
      </>
    </div>
  );
};

// Helper function for showing toasts
export const toast = {
  success: (message: string) => {
    const store = (window as any).__appStore;
    if (store) {
      store.addToast(message, 'success');
    }
  },
  error: (message: string) => {
    const store = (window as any).__appStore;
    if (store) {
      store.addToast(message, 'error');
    }
  },
  info: (message: string) => {
    const store = (window as any).__appStore;
    if (store) {
      store.addToast(message, 'info');
    }
  },
  warning: (message: string) => {
    const store = (window as any).__appStore;
    if (store) {
      store.addToast(message, 'warning');
    }
  }
};