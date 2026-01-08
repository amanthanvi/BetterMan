import { createRoute, lazyRouteComponent } from '@tanstack/react-router'

import { rootRoute } from './__root'

export const sectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/section/$section',
  component: lazyRouteComponent(() => import('../pages/SectionPage')),
})

