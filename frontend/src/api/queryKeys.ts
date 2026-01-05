export const queryKeys = {
  info: () => ['info'] as const,
  search: (q: string, section?: string) => ['search', q, section ?? null] as const,
  section: (section: string) => ['section', section] as const,
  man: (name: string, section: string) => ['man', name, section] as const,
  related: (name: string, section: string) => ['related', name, section] as const,
} as const

