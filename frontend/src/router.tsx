import { createRouter } from '@tanstack/react-router'

import { rootRoute } from './routes/__root'
import { indexRoute } from './routes/index'
import { licensesRoute } from './routes/licenses'
import { manByNameRoute } from './routes/man.$name'
import { manByNameAndSectionRoute } from './routes/man.$name.$section'
import { searchRoute } from './routes/search'
import { sectionRoute } from './routes/section.$section'

const routeTree = rootRoute.addChildren([
  indexRoute,
  searchRoute,
  licensesRoute,
  sectionRoute,
  manByNameRoute,
  manByNameAndSectionRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
