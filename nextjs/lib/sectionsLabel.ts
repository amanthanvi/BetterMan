import type { ServerT } from './i18n/server'

/** Names numeric sections compactly: `['1', '2', '3', '5']` is `Sections 1–3, 5`. */
export function sectionsLabel(sections: string[], t: ServerT): string {
  const nums = [...new Set(sections.map(Number))].filter(Number.isInteger).sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < nums.length; ) {
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j += 1
    parts.push(j > i ? `${nums[i]}–${nums[j]}` : `${nums[i]}`)
    i = j + 1
  }
  return t(nums.length === 1 ? 'Section {list}' : 'Sections {list}', { list: parts.join(', ') })
}
