import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export async function expectNoCriticalOrSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')

  expect(
    bad.map((v) => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.length })),
  ).toEqual([])
}

