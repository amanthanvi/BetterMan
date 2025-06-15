/**
 * Animation System
 * 
 * Framer Motion animation presets and utilities for
 * consistent, performant animations throughout the app.
 */


// Animation durations
export const duration = {
  instant: 0,
  fast: 0.1,
  normal: 0.2,
  slow: 0.3,
  slower: 0.4,
  slowest: 0.5,
} as const;

// Easing functions
export const easing = {
  // Default easing
  default: [0.4, 0, 0.2, 1],
  
  // Emphasized easing (Material Design)
  emphasized: [0.2, 0, 0, 1],
  emphasizedDecelerate: [0.05, 0.7, 0.1, 1],
  emphasizedAccelerate: [0.3, 0, 0.8, 0.15],
  
  // Standard easing
  easeIn: [0.4, 0, 1, 1],
  easeOut: [0, 0, 0.2, 1],
  easeInOut: [0.4, 0, 0.2, 1],
  
  // Spring physics
  spring: { type: 'spring', damping: 15, stiffness: 300 },
  springBouncy: { type: 'spring', damping: 10, stiffness: 400 },
  springSlow: { type: 'spring', damping: 20, stiffness: 100 },
} as const;

// Page transitions
export const pageTransition: Variants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.normal,
      ease: easing.default,
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: duration.fast,
      ease: easing.easeIn,
    },
  },
};

// Fade animations
export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: { duration: duration.normal },
  },
  exit: { 
    opacity: 0,
    transition: { duration: duration.fast },
  },
};

// Scale animations
export const scale: Variants = {
  initial: { 
    opacity: 0, 
    scale: 0.9,
  },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: {
      duration: duration.normal,
      ease: easing.default,
    },
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    transition: {
      duration: duration.fast,
      ease: easing.easeIn,
    },
  },
};

// Slide animations
export const slideUp: Variants = {
  initial: { 
    opacity: 0, 
    y: 30,
  },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: duration.normal,
      ease: easing.default,
    },
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: {
      duration: duration.fast,
      ease: easing.easeIn,
    },
  },
};

export const slideDown: Variants = {
  initial: { 
    opacity: 0, 
    y: -30,
  },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: duration.normal,
      ease: easing.default,
    },
  },
  exit: { 
    opacity: 0, 
    y: 10,
    transition: {
      duration: duration.fast,
      ease: easing.easeIn,
    },
  },
};

export const slideLeft: Variants = {
  initial: { 
    opacity: 0, 
    x: 30,
  },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: duration.normal,
      ease: easing.default,
    },
  },
  exit: { 
    opacity: 0, 
    x: -10,
    transition: {
      duration: duration.fast,
      ease: easing.easeIn,
    },
  },
};

export const slideRight: Variants = {
  initial: { 
    opacity: 0, 
    x: -30,
  },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: duration.normal,
      ease: easing.default,
    },
  },
  exit: { 
    opacity: 0, 
    x: 10,
    transition: {
      duration: duration.fast,
      ease: easing.easeIn,
    },
  },
};

// List animations
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.02,
      staggerDirection: -1,
    },
  },
};

export const listItem: Variants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.normal,
      ease: easing.default,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: duration.fast,
      ease: easing.easeIn,
    },
  },
};

// Modal/Dialog animations
export const modal: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 10,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: duration.normal,
      ease: easing.emphasized,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: {
      duration: duration.fast,
      ease: easing.emphasizedAccelerate,
    },
  },
};

export const backdrop: Variants = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: { duration: duration.fast },
  },
  exit: { 
    opacity: 0,
    transition: { duration: duration.fast },
  },
};

// Drawer animations
export const drawerLeft: Variants = {
  initial: { x: '-100%' },
  animate: { 
    x: 0,
    transition: {
      duration: duration.slow,
      ease: easing.emphasized,
    },
  },
  exit: { 
    x: '-100%',
    transition: {
      duration: duration.normal,
      ease: easing.emphasizedAccelerate,
    },
  },
};

export const drawerRight: Variants = {
  initial: { x: '100%' },
  animate: { 
    x: 0,
    transition: {
      duration: duration.slow,
      ease: easing.emphasized,
    },
  },
  exit: { 
    x: '100%',
    transition: {
      duration: duration.normal,
      ease: easing.emphasizedAccelerate,
    },
  },
};

// Tab animations
export const tab: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const tabContent: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: duration.normal,
      ease: easing.default,
    },
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: {
      duration: duration.fast,
    },
  },
};

// Hover animations
export const hoverScale: AnimationProps = {
  whileHover: { scale: 1.05 },
  whileTap: { scale: 0.95 },
  transition: { duration: duration.fast },
};

export const hoverGlow: AnimationProps = {
  whileHover: { 
    boxShadow: '0 0 20px rgba(99, 102, 241, 0.3)',
    transition: { duration: duration.normal },
  },
};

// Loading animations
export const pulse: Variants = {
  animate: {
    opacity: [1, 0.5, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

export const spin: Variants = {
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

export const bounce: Variants = {
  animate: {
    y: [0, -10, 0],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      ease: easing.default,
    },
  },
};

// Skeleton loading animation
export const shimmer: Variants = {
  animate: {
    backgroundPosition: ['200% 0', '-200% 0'],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

// Utility functions
export const createSlideAnimation = (
  direction: 'up' | 'down' | 'left' | 'right',
  distance: number = 30
): Variants => {
  const axis = direction === 'up' || direction === 'down' ? 'y' : 'x';
  const initialValue = 
    direction === 'up' || direction === 'left' ? distance : -distance;
  
  return {
    initial: { 
      opacity: 0, 
      [axis]: initialValue,
    },
    animate: { 
      opacity: 1, 
      [axis]: 0,
      transition: {
        duration: duration.normal,
        ease: easing.default,
      },
    },
    exit: { 
      opacity: 0, 
      [axis]: initialValue / 3,
      transition: {
        duration: duration.fast,
        ease: easing.easeIn,
      },
    },
  };
};

// Gesture animations
export const gestureProps = {
  whileTap: { scale: 0.98 },
  whileHover: { scale: 1.02 },
  transition: { duration: duration.fast },
};

// Presence animation wrapper
export const withPresence = (
  variants: Variants, 
  custom?: any
): AnimationProps => ({
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  variants,
  custom,
});