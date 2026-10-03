const MAN_NAME_PATTERN = /^(?:[a-zA-Z0-9_][a-zA-Z0-9._+:-]{0,127}|\[)$/
const MAN_SECTION_PATTERN = /^[0-9][a-zA-Z0-9]{0,7}$/

export function isValidManImageParams(name: string, section: string): boolean {
  return MAN_NAME_PATTERN.test(name) && MAN_SECTION_PATTERN.test(section)
}

export function truncateOgText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}
