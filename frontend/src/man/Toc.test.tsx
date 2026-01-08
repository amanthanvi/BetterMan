import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Toc } from './Toc'

describe('Toc', () => {
  it('moves focus with arrow keys and j/k', async () => {
    const user = userEvent.setup()
    render(
      <Toc
        items={[
          { id: 'a', title: 'A', level: 2 },
          { id: 'b', title: 'B', level: 2 },
          { id: 'c', title: 'C', level: 2 },
        ]}
        activeId="b"
      />,
    )

    const nav = document.querySelector('nav[aria-label="On this page"]')
    expect(nav).toBeTruthy()

    const links = within(nav as HTMLElement).getAllByRole('link')
    expect(links[1]?.className).toContain('bg-[color:var(--bm-accent)/0.12]')

    links[0]?.focus()
    expect(links[0]).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(links[1]).toHaveFocus()

    await user.keyboard('j')
    expect(links[2]).toHaveFocus()

    await user.keyboard('k')
    expect(links[1]).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(links[0]).toHaveFocus()
  })
})

