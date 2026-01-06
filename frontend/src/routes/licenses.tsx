import { createRoute, lazyRouteComponent } from '@tanstack/react-router'

import { rootRoute } from './__root'

export const licensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/licenses',
  component: lazyRouteComponent(() => import('../pages/LicensesPage')),
})

