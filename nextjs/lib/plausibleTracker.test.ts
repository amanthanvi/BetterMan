import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('ships the pinned unmodified base tracker with its MIT notice and no engagement code', () => {
  const script = readFileSync(new URL('../public/assets/site.js', import.meta.url))
  expect(createHash('sha256').update(script).digest('hex')).toBe('e3409ac09af396e35fd67c5e024386d36c52138b7541e6a4644c31a94a2d33a4')
  expect(script.byteLength).toBe(1407)
  expect(script.toString()).not.toMatch(/pageleave|engagement|sendBeacon/)
  const license = readFileSync(new URL('../public/assets/site.LICENSE.txt', import.meta.url), 'utf8')
  expect(license).toContain('Copyright 2020 Plausible Insights OÜ')
  expect(license).toContain('Permission is hereby granted, free of charge')
})
