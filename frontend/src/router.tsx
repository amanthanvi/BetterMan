import { createRouter } from '@tanstack/react-router'

import { rootRoute } from './routes/__root'
import { indexRoute } from './routes/index'
import { searchRoute } from './routes/search'

const routeTree = rootRoute.addChildren([indexRoute, searchRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

