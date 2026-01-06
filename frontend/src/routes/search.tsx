import { createRoute, lazyRouteComponent } from '@tanstack/react-router'

import { rootRoute } from './__root'

export const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  validateSearch: (search: Record<string, unknown>) => {
    const q = typeof search.q === 'string' ? search.q : ''
    const section = typeof search.section === 'string' ? search.section.trim() : ''
    return { q, ...(section ? { section } : {}) }
  },
  component: lazyRouteComponent(() => import('../pages/SearchPage')),
})

