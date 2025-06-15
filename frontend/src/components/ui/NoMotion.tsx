import React from 'react';

// Fallback components that mimic motion API but with no animation
export const motion = {
  div: React.forwardRef<HTMLDivElement, any>(({ children, className, style, ...props }, ref) => (
    <div ref={ref} className={className} style={style} {...props}>
      {children}
    </div>
  )),
  button: React.forwardRef<HTMLButtonElement, any>(({ children, className, style, ...props }, ref) => (
    <button ref={ref} className={className} style={style} {...props}>
      {children}
    </button>
  )),
  section: React.forwardRef<HTMLElement, any>(({ children, className, style, ...props }, ref) => (
    <section ref={ref} className={className} style={style} {...props}>
      {children}
    </section>
  )),
  span: React.forwardRef<HTMLSpanElement, any>(({ children, className, style, ...props }, ref) => (
    <span ref={ref} className={className} style={style} {...props}>
      {children}
    </span>
  )),
  header: React.forwardRef<HTMLElement, any>(({ children, className, style, ...props }, ref) => (
    <header ref={ref} className={className} style={style} {...props}>
      {children}
    </header>
  )),
  nav: React.forwardRef<HTMLElement, any>(({ children, className, style, ...props }, ref) => (
    <nav ref={ref} className={className} style={style} {...props}>
      {children}
    </nav>
  )),
  main: React.forwardRef<HTMLElement, any>(({ children, className, style, ...props }, ref) => (
    <main ref={ref} className={className} style={style} {...props}>
      {children}
    </main>
  )),
  footer: React.forwardRef<HTMLElement, any>(({ children, className, style, ...props }, ref) => (
    <footer ref={ref} className={className} style={style} {...props}>
      {children}
    </footer>
  )),
  h1: React.forwardRef<HTMLHeadingElement, any>(({ children, className, style, ...props }, ref) => (
    <h1 ref={ref} className={className} style={style} {...props}>
      {children}
    </h1>
  )),
  h2: React.forwardRef<HTMLHeadingElement, any>(({ children, className, style, ...props }, ref) => (
    <h2 ref={ref} className={className} style={style} {...props}>
      {children}
    </h2>
  )),
  h3: React.forwardRef<HTMLHeadingElement, any>(({ children, className, style, ...props }, ref) => (
    <h3 ref={ref} className={className} style={style} {...props}>
      {children}
    </h3>
  )),
  p: React.forwardRef<HTMLParagraphElement, any>(({ children, className, style, ...props }, ref) => (
    <p ref={ref} className={className} style={style} {...props}>
      {children}
    </p>
  )),
  ul: React.forwardRef<HTMLUListElement, any>(({ children, className, style, ...props }, ref) => (
    <ul ref={ref} className={className} style={style} {...props}>
      {children}
    </ul>
  )),
  li: React.forwardRef<HTMLLIElement, any>(({ children, className, style, ...props }, ref) => (
    <li ref={ref} className={className} style={style} {...props}>
      {children}
    </li>
  )),
  input: React.forwardRef<HTMLInputElement, any>(({ children, className, style, ...props }, ref) => (
    <input ref={ref} className={className} style={style} {...props}>
      {children}
    </input>
  )),
  aside: React.forwardRef<HTMLElement, any>(({ children, className, style, ...props }, ref) => (
    <aside ref={ref} className={className} style={style} {...props}>
      {children}
    </aside>
  )),
  article: React.forwardRef<HTMLElement, any>(({ children, className, style, ...props }, ref) => (
    <article ref={ref} className={className} style={style} {...props}>
      {children}
    </article>
  )),
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