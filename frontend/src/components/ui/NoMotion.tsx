import * as React from 'react';

// Simple div component
const DivComponent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => React.createElement('div', { ...props, ref })
);

// Simple button component
const ButtonComponent = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  (props, ref) => React.createElement('button', { ...props, ref })
);

// Simple section component
const SectionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  (props, ref) => React.createElement('section', { ...props, ref })
);

// Simple span component
const SpanComponent = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  (props, ref) => React.createElement('span', { ...props, ref })
);

// Simple header component
const HeaderComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  (props, ref) => React.createElement('header', { ...props, ref })
);

// Simple nav component
const NavComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  (props, ref) => React.createElement('nav', { ...props, ref })
);

// Simple main component
const MainComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  (props, ref) => React.createElement('main', { ...props, ref })
);

// Simple footer component
const FooterComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  (props, ref) => React.createElement('footer', { ...props, ref })
);

// Simple h1 component
const H1Component = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  (props, ref) => React.createElement('h1', { ...props, ref })
);

// Simple h2 component
const H2Component = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  (props, ref) => React.createElement('h2', { ...props, ref })
);

// Simple h3 component
const H3Component = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  (props, ref) => React.createElement('h3', { ...props, ref })
);

// Simple p component
const PComponent = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  (props, ref) => React.createElement('p', { ...props, ref })
);

// Simple ul component
const UlComponent = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  (props, ref) => React.createElement('ul', { ...props, ref })
);

// Simple li component
const LiComponent = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
  (props, ref) => React.createElement('li', { ...props, ref })
);

// Simple input component
const InputComponent = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => React.createElement('input', { ...props, ref })
);

// Simple aside component
const AsideComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  (props, ref) => React.createElement('aside', { ...props, ref })
);

// Simple article component
const ArticleComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  (props, ref) => React.createElement('article', { ...props, ref })
);

// Export motion object
export const motion = {
  div: DivComponent,
  button: ButtonComponent,
  section: SectionComponent,
  span: SpanComponent,
  header: HeaderComponent,
  nav: NavComponent,
  main: MainComponent,
  footer: FooterComponent,
  h1: H1Component,
  h2: H2Component,
  h3: H3Component,
  p: PComponent,
  ul: UlComponent,
  li: LiComponent,
  input: InputComponent,
  aside: AsideComponent,
  article: ArticleComponent,
};

// AnimatePresence just renders children
export const AnimatePresence: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

// LayoutGroup just renders children
export const LayoutGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

// Export empty animation helpers
export const stagger = () => ({});
export const fadeInUp = {};
export const fadeIn = {};
export const scaleIn = {};
export const slideIn = {};