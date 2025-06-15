import React, { useEffect, useState } from 'react';
import type { HTMLMotionProps, AnimatePresenceProps } from 'framer-motion';

interface SafeMotionProps extends Omit<HTMLMotionProps<"div">, 'children'> {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface SafeAnimatePresenceProps extends Omit<AnimatePresenceProps, 'children'> {
  children: React.ReactNode;
}

// Create a safe wrapper that only loads framer-motion on the client
export const SafeMotion: React.FC<SafeMotionProps> = ({ 
  children, 
  fallback,
  ...props 
}) => {
  const [Motion, setMotion] = useState<any>(null);

  useEffect(() => {
    // Dynamically import framer-motion only on client side
    import('framer-motion').then((mod) => {
      setMotion(() => mod.motion);
    });
  }, []);

  if (!Motion) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <div {...(props as any)}>{children}</div>;
  }

  return <Motion.div {...props}>{children}</Motion.div>;
};

export const SafeAnimatePresence: React.FC<SafeAnimatePresenceProps> = ({ 
  children,
  ...props 
}) => {
  const [AnimatePresence, setAnimatePresence] = useState<any>(null);

  useEffect(() => {
    // Dynamically import framer-motion only on client side
    import('framer-motion').then((mod) => {
      setAnimatePresence(() => mod.AnimatePresence);
    });
  }, []);

  if (!AnimatePresence) {
    return <>{children}</>;
  }

  return <AnimatePresence {...props}>{children}</AnimatePresence>;
};

// Export a hook for using motion programmatically
export const useMotion = () => {
  const [motion, setMotion] = useState<any>(null);

  useEffect(() => {
    import('framer-motion').then((mod) => {
      setMotion(mod.motion);
    });
  }, []);

  return motion;
};