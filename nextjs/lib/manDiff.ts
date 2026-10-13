import type { BlockNode, InlineNode, ManPageContent } from './docModel'

export type DiffEntry = {
  area: 'Document' | 'Options'
  type: string
  before?: string
  after?: string
}

export type ManDiff = { added: DiffEntry[]; removed: DiffEntry[]; changed: DiffEntry[] }

function inlineText(inlines: InlineNode[]): string {
  return inlines.map((inline) => 'text' in inline ? inline.text : inlineText(inline.inlines)).join('')
}

/** Compare readable content rather than release-specific anchors or inline styling. */
export function blockText(block: BlockNode): string {
  switch (block.type) {
    case 'heading':
    case 'code_block':
      return block.text
    case 'paragraph':
      return inlineText(block.inlines)
    case 'list':
      return block.items.map((item, index) => {
        const marker = block.ordered ? `${index + 1}.` : '•'
        const indent = ' '.repeat(marker.length + 1)
        const lines = item.map(blockText).join('\n').split('\n')
        // A leading nested list starts below its parent's marker, so its
        // first item retains its depth rather than becoming parent text.
        if (item[0]?.type === 'list') lines.unshift('')
        return lines.map((line, lineIndex) => lineIndex === 0 ? `${marker}${line ? ` ${line}` : ''}` : `${indent}${line}`).join('\n')
      }).join('\n')
    case 'definition_list':
      return block.items.map((item) => `${inlineText(item.termInlines)}\n${item.definitionBlocks.map(blockText).join('\n')}`).join('\n')
    case 'table':
      return [block.headers, ...block.rows].map((row) => row.join('\t')).join('\n')
    case 'horizontal_rule':
      return '—'
  }
}

type DiffValue = { type: string; text: string }

/**
 * Myers alignment finds the shortest insertion/deletion path, including when
 * blocks repeat. Cap the edit distance to bound both work and trace storage;
 * substantially rewritten documents use unique patience anchors instead.
 */
function smallEditAnchors(before: string[], after: string[]): [number, number][] | null {
  const maxEdits = 64
  if (Math.abs(before.length - after.length) > maxEdits) return null
  const frontier = new Map<number, number>([[1, 0]])
  const trace: Map<number, number>[] = []
  for (let edits = 0; edits <= maxEdits; edits++) {
    trace.push(new Map(frontier))
    for (let diagonal = -edits; diagonal <= edits; diagonal += 2) {
      const down = diagonal === -edits || (diagonal !== edits &&
        (frontier.get(diagonal - 1) ?? -Infinity) < (frontier.get(diagonal + 1) ?? -Infinity))
      let x = down ? frontier.get(diagonal + 1) ?? 0 : (frontier.get(diagonal - 1) ?? 0) + 1
      let y = x - diagonal
      while (x < before.length && y < after.length && before[x] === after[y]) {
        x++
        y++
      }
      frontier.set(diagonal, x)
      if (x >= before.length && y >= after.length) {
        const anchors: [number, number][] = []
        for (let depth = edits; depth >= 0; depth--) {
          const previous = trace[depth]
          const currentDiagonal = x - y
          const previousDiagonal = currentDiagonal === -depth || (currentDiagonal !== depth &&
            (previous.get(currentDiagonal - 1) ?? -Infinity) < (previous.get(currentDiagonal + 1) ?? -Infinity))
            ? currentDiagonal + 1 : currentDiagonal - 1
          const previousX = previous.get(previousDiagonal) ?? 0
          const previousY = previousX - previousDiagonal
          while (x > previousX && y > previousY) anchors.push([--x, --y])
          x = previousX
          y = previousY
        }
        return anchors.reverse()
      }
    }
  }
  return null
}

function patienceAnchors(before: string[], after: string[]): [number, number][] {
  const uniquePositions = (values: string[]) => {
    const positions = new Map<string, number>()
    values.forEach((value, index) => positions.set(value, positions.has(value) ? -1 : index))
    return positions
  }
  const oldPositions = uniquePositions(before)
  const newPositions = uniquePositions(after)
  const matches: [number, number][] = []
  before.forEach((value, index) => {
    const next = newPositions.get(value)
    if (oldPositions.get(value) === index && next !== undefined && next >= 0) matches.push([index, next])
  })
  const tails: number[] = []
  const parents: number[] = []
  matches.forEach((match, index) => {
    let low = 0
    let high = tails.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (matches[tails[mid]][1] < match[1]) low = mid + 1
      else high = mid
    }
    parents[index] = low > 0 ? tails[low - 1] : -1
    tails[low] = index
  })
  const anchors: [number, number][] = []
  let current = tails.at(-1) ?? -1
  while (current !== -1) {
    anchors.push(matches[current])
    current = parents[current]
  }
  return anchors.reverse()
}

/** O(n log n) space/time bound with a fixed maximum Myers edit distance. */
function unchangedAnchors(before: DiffValue[], after: DiffValue[]): [number, number][] {
  const signature = (value: DiffValue) => JSON.stringify([value.type, value.text])
  const oldKeys = before.map(signature)
  const newKeys = after.map(signature)
  const prefix: [number, number][] = []
  let start = 0
  while (start < oldKeys.length && start < newKeys.length && oldKeys[start] === newKeys[start]) {
    prefix.push([start, start])
    start++
  }
  let oldEnd = oldKeys.length
  let newEnd = newKeys.length
  const suffix: [number, number][] = []
  while (oldEnd > start && newEnd > start && oldKeys[oldEnd - 1] === newKeys[newEnd - 1]) {
    suffix.push([--oldEnd, --newEnd])
  }
  const oldMiddle = oldKeys.slice(start, oldEnd)
  const newMiddle = newKeys.slice(start, newEnd)
  const middle = smallEditAnchors(oldMiddle, newMiddle) ?? patienceAnchors(oldMiddle, newMiddle)
  return [...prefix, ...middle.map(([oldIndex, newIndex]): [number, number] => [oldIndex + start, newIndex + start]), ...suffix.reverse()]
}

function diffValues(before: DiffValue[], after: DiffValue[], area: DiffEntry['area'], out: ManDiff) {
  let beforeIndex = 0
  let afterIndex = 0
  for (const [beforeEnd, afterEnd] of [...unchangedAnchors(before, after), [before.length, after.length]]) {
    while (beforeIndex < beforeEnd || afterIndex < afterEnd) {
      const oldValue = beforeIndex < beforeEnd ? before[beforeIndex] : undefined
      const newValue = afterIndex < afterEnd ? after[afterIndex] : undefined
      if (oldValue && newValue && oldValue.type === newValue.type) {
        out.changed.push({ area, type: oldValue.type, before: oldValue.text, after: newValue.text })
        beforeIndex++
        afterIndex++
      } else if (oldValue) {
        out.removed.push({ area, type: oldValue.type, before: oldValue.text })
        beforeIndex++
      } else if (newValue) {
        out.added.push({ area, type: newValue.type, after: newValue.text })
        afterIndex++
      }
    }
    beforeIndex = beforeEnd + 1
    afterIndex = afterEnd + 1
  }
}

export function diffManContent(before: ManPageContent, after: ManPageContent): ManDiff {
  const out: ManDiff = { added: [], removed: [], changed: [] }
  const values = (blocks: BlockNode[]) => blocks.map((block) => ({ type: block.type, text: blockText(block) }))
  diffValues(values(before.blocks), values(after.blocks), 'Document', out)

  // Flag strings identify an option; descriptions and arguments are its content.
  // Sorting makes option order alone irrelevant without collapsing duplicates.
  const options = (content: ManPageContent) => [...(content.options ?? [])]
    .sort((a, b) => a.flags.localeCompare(b.flags))
    .map((option) => ({
      type: option.flags,
      text: `${option.flags}${option.argument ? ` ${option.argument}` : ''}\n${option.description}`,
    }))
  const groups = new Map<string, { before: DiffValue[]; after: DiffValue[] }>()
  for (const [side, entries] of [['before', options(before)], ['after', options(after)]] as const) {
    for (const option of entries) {
      const group = groups.get(option.type) ?? { before: [], after: [] }
      group[side].push(option)
      groups.set(option.type, group)
    }
  }
  for (const [flags, group] of groups) {
    // Match exact entries first, preserving multiplicity. A new duplicate flag
    // must not consume an unchanged description or turn a reorder into changes.
    const remaining = new Map<string, number>()
    for (const option of group.after) remaining.set(option.text, (remaining.get(option.text) ?? 0) + 1)
    const oldUnmatched = group.before.filter((option) => {
      const count = remaining.get(option.text) ?? 0
      if (!count) return true
      remaining.set(option.text, count - 1)
      return false
    })
    const newUnmatched = group.after.filter((option) => {
      const count = remaining.get(option.text) ?? 0
      if (!count) return false
      remaining.set(option.text, count - 1)
      return true
    })
    for (let index = 0; index < Math.max(oldUnmatched.length, newUnmatched.length); index++) {
      const oldOption = oldUnmatched[index]
      const newOption = newUnmatched[index]
      if (oldOption && newOption) out.changed.push({ area: 'Options', type: flags, before: oldOption.text, after: newOption.text })
      else if (oldOption) out.removed.push({ area: 'Options', type: flags, before: oldOption.text })
      else if (newOption) out.added.push({ area: 'Options', type: flags, after: newOption.text })
    }
  }
  return out
}
