import React from 'react';

interface SafeMotionProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface SafeAnimatePresenceProps {
  children: React.ReactNode;
}

// Create a safe wrapper that just renders children without motion
export const SafeMotion: React.FC<SafeMotionProps> = ({ 
  children, 
  fallback,
  className,
  style,
  ...props 
}) => {
  return (
    <div className={className} style={style} {...props}>
      {children}
    </div>
  );
};

export const SafeAnimatePresence: React.FC<SafeAnimatePresenceProps> = ({ 
  children,
}) => {
  return <>{children}</>;
};

// Export a hook that returns null (no motion)
export const useMotion = () => {
  return null;
};