import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

type SimplifiedA11yViolation = {
  id: string
  impact?: string
  description: string
  help: string
  helpUrl: string
  nodes: Array<{
    target: string[]
    failureSummary: string
    html: string
  }>
}

export async function expectNoCriticalOrSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')

  const simplified: SimplifiedA11yViolation[] = bad.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.slice(0, 5).map((n) => ({
      target: n.target,
      failureSummary: n.failureSummary ?? '',
      html: n.html,
    })),
  }))

  expect(simplified).toEqual([])
}
