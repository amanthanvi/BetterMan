export const queryKeys = {
  info: (distro: string) => ['info', distro] as const,
  sections: (distro: string) => ['sections', distro] as const,
  search: (distro: string, q: string, section?: string) => ['search', distro, q, section ?? null] as const,
  suggest: (distro: string, name: string) => ['suggest', distro, name] as const,
  section: (distro: string, section: string) => ['section', distro, section] as const,
  manByName: (distro: string, name: string) => ['manByName', distro, name] as const,
  man: (distro: string, name: string, section: string) => ['man', distro, name, section] as const,
  related: (distro: string, name: string, section: string) => ['related', distro, name, section] as const,
  licenses: (distro: string) => ['licenses', distro] as const,
  licenseText: (distro: string, pkg: string | null) => ['licenseText', distro, pkg] as const,
  paletteSearch: (distro: string, q: string) => ['paletteSearch', distro, q] as const,
  manAlternatives: (distro: string, name: string) => ['manAlternatives', distro, name] as const,
} as const
