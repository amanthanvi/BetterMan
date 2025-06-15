import * as React from 'react';

// Helper function to create a mock motion component
function createMotionComponent<T extends keyof JSX.IntrinsicElements>(element: T) {
  const Component = React.forwardRef<any, any>((props, ref) => {
    return React.createElement(element, { ...props, ref });
  });
  Component.displayName = `motion.${element}`;
  return Component;
}

// Fallback components that mimic motion API but with no animation
export const motion = {
  div: createMotionComponent('div'),
  button: createMotionComponent('button'),
  section: createMotionComponent('section'),
  span: createMotionComponent('span'),
  header: createMotionComponent('header'),
  nav: createMotionComponent('nav'),
  main: createMotionComponent('main'),
  footer: createMotionComponent('footer'),
  h1: createMotionComponent('h1'),
  h2: createMotionComponent('h2'),
  h3: createMotionComponent('h3'),
  p: createMotionComponent('p'),
  ul: createMotionComponent('ul'),
  li: createMotionComponent('li'),
  input: createMotionComponent('input'),
  aside: createMotionComponent('aside'),
  article: createMotionComponent('article'),
};

// AnimatePresence doesn't do anything, just renders children
export const AnimatePresence: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

// LayoutGroup doesn't do anything, just renders children
export const LayoutGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

// Export empty stagger and variants
export const stagger = () => {};
export const fadeInUp = {};
export const fadeIn = {};
export const scaleIn = {};
export const slideIn = {};