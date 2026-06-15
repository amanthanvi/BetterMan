import { ConvexHttpClient } from 'convex/browser'

let client: ConvexHttpClient | null = null

export type DatasetStage = 'staging' | 'prod'

export function getDatasetStage(): DatasetStage {
  const raw = process.env.BETTERMAN_DATASET_STAGE?.trim().toLowerCase()
  return raw === 'staging' ? 'staging' : 'prod'
}

export function getConvexUrl(): string {
  const value = process.env.NEXT_PUBLIC_CONVEX_URL?.trim() || process.env.CONVEX_URL?.trim()
  if (!value) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL or CONVEX_URL is required')
  }
  return value
}

export function getConvexClient(): ConvexHttpClient {
  if (!client) client = new ConvexHttpClient(getConvexUrl())
  return client
}
