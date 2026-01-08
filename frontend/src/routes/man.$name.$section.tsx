import { createRoute, lazyRouteComponent } from '@tanstack/react-router'

import { rootRoute } from './__root'

export const manByNameAndSectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/man/$name/$section',
  component: lazyRouteComponent(() => import('../pages/ManByNameAndSectionPage')),
})

