import { Fragment, type ReactNode } from 'react'

import type { T, Vars } from './translate'

// Private-use characters around a name: they never occur in a message.
const MARK = /\uE000(\w+)\uE001/

/**
 * A message with elements in it: `{link}` in the message stands for `nodes.link`.
 * The translator keeps the sentence whole and moves the placeholder where the
 * language wants it, so a link or a key cap never forces English word order.
 */
export function tRich<K extends string>(t: T<K>, key: K, nodes: Record<string, ReactNode>, vars?: Vars): ReactNode[] {
  const marks: Vars = { ...vars }
  for (const name in nodes) marks[name] = `\uE000${name}\uE001`
  // Splitting on a capture group alternates text and the name of the node that goes between.
  return t(key, marks).split(MARK).map((part, index) => (index % 2 ? <Fragment key={index}>{nodes[part]}</Fragment> : part))
}
