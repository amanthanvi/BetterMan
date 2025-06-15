/**
 * Animation System
 * 
 * CSS animation presets and utilities for
 * consistent animations throughout the app.
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

// Easing functions for CSS
export const easing = {
  // Default easing
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',
  
  // Emphasized easing (Material Design)
  emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  
  // Standard easing
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// CSS transition classes
export const transitions = {
  fade: 'transition-opacity',
  transform: 'transition-transform',
  all: 'transition-all',
  colors: 'transition-colors',
} as const;

// Duration classes for Tailwind
export const durationClasses = {
  instant: 'duration-0',
  fast: 'duration-100',
  normal: 'duration-200',
  slow: 'duration-300',
  slower: 'duration-500',
  slowest: 'duration-700',
} as const;