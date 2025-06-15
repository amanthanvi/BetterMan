// Auto-generated index file
import page0 from './ls.1.json'
import page1 from './cd.1.json'
import page2 from './grep.1.json'

export const manPages = {
  'ls.1': page0,
  'cd.1': page1,
  'grep.1': page2
}

export const manPageList = [
  page0,
  page1,
  page2
]

export function getManPage(name: string, section?: number) {
  const key = section ? `${name}.${section}` : Object.keys(manPages).find(k => k.startsWith(name + '.'))
  return key ? manPages[key as keyof typeof manPages] : null
}