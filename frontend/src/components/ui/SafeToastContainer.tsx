import React from 'react';
import { ToastContainer } from './Toast';

interface SafeToastContainerProps {
  toasts: any;
  removeToast: (id: string) => void;
}

export const SafeToastContainer: React.FC<SafeToastContainerProps> = ({ toasts, removeToast }) => {
  // Ensure toasts is always an array
  const safeToasts = Array.isArray(toasts) ? toasts : [];
  
  return <ToastContainer toasts={safeToasts} removeToast={removeToast} />;
};