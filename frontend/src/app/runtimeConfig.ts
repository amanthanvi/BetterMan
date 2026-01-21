export type BetterManRuntimeConfig = {
  sentryDsn?: string | null
}

export function getRuntimeConfig(): BetterManRuntimeConfig | null {
  const raw = (globalThis as unknown as { __BETTERMAN_CONFIG__?: unknown }).__BETTERMAN_CONFIG__
  if (!raw || typeof raw !== 'object') return null
  return raw as BetterManRuntimeConfig
}
