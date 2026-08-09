#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const convexRoot = fileURLToPath(new URL('../convex/', import.meta.url))
const libPath = new URL('../convex/lib.ts', import.meta.url)
const schemaPath = new URL('../convex/schema.ts', import.meta.url)
const publicRegistrars = new Set(['action', 'mutation', 'query'])
const compatibilityFunctions = new Set([
  'content.ts:getManByName',
  'content.ts:getManByNameAndSection',
  'queries.ts:getInfo',
  'queries.ts:getLicense',
  'queries.ts:getManMetaByNameAndSection',
  'queries.ts:getRelated',
  'queries.ts:listLicenses',
  'queries.ts:listSection',
  'queries.ts:listSections',
  'queries.ts:listSeoReleases',
  'queries.ts:listSitemapPage',
  'queries.ts:listSitemapPageChunk',
  'queries.ts:search',
  'queries.ts:suggest',
])
const seenCompatibilityFunctions = new Set()
const violations = []
let publicFunctions = 0

function typescriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === '_generated' ? [] : typescriptFiles(entryPath)
    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : []
  })
}

for (const filePath of typescriptFiles(convexRoot)) {
  const fileName = path.relative(convexRoot, filePath).split(path.sep).join('/')
  const source = fs.readFileSync(filePath, 'utf8')
  const publicPattern = /export const\s+(\w+)\s*=\s*(action|mutation|query)\(\{/g
  const argsPattern = /export const\s+(\w+)\s*=\s*(action|mutation|query)\(\{\s*args:\s*\{([\s\S]*?)\n?\s*\},\n\s*(?:handler|returns):/g
  const registered = [...source.matchAll(publicPattern)].filter((match) => publicRegistrars.has(match[2]))
  const inspected = [...source.matchAll(argsPattern)].filter((match) => publicRegistrars.has(match[2]))

  if (registered.length !== inspected.length) {
    throw new Error(`${fileName}: public functions must keep an analyzable leading args object`)
  }

  publicFunctions += inspected.length
  for (const match of inspected) {
    const functionName = `${fileName}:${match[1]}`
    const stageProperty = match[3].match(/^\s*stage\s*:\s*([^,\n]+),?\s*$/m)?.[1]
    const nextExport = source.indexOf('\nexport const ', match.index + match[0].length)
    const functionSource = source.slice(match.index, nextExport === -1 ? source.length : nextExport)

    if (compatibilityFunctions.has(functionName)) {
      seenCompatibilityFunctions.add(functionName)
      if (stageProperty !== 'publicStageCompatibilityValidator') {
        violations.push(`${functionName} must retain only the optional compatibility validator`)
      }
      if (/\bargs\.stage\b/.test(functionSource)) {
        violations.push(`${functionName} must ignore the compatibility stage field`)
      }
    } else if (stageProperty) {
      violations.push(`${functionName} must not accept caller stage`)
    }
  }
}

const libSource = fs.readFileSync(libPath, 'utf8')
const publicStage = libSource.match(
  /export const PUBLIC_DATASET_STAGE(?::\s*DatasetStage)?\s*=\s*["'](\w+)["']/,
)?.[1]
const schemaSource = fs.readFileSync(schemaPath, 'utf8')
const compatibilityValidatorIsOptional =
  /export const publicStageCompatibilityValidator\s*=\s*v\.optional\(datasetStageValidator\)/.test(
    schemaSource,
  )

if (!publicFunctions) throw new Error('No public Convex functions were inspected')
const missingCompatibilityFunctions = compatibilityFunctions.difference(seenCompatibilityFunctions)
if (missingCompatibilityFunctions.size) {
  violations.push(`Missing compatibility functions: ${[...missingCompatibilityFunctions].join(', ')}`)
}
if (violations.length) {
  throw new Error(`Public Convex stage contract failed: ${violations.join('; ')}`)
}
if (publicStage !== 'prod') {
  throw new Error(`PUBLIC_DATASET_STAGE must fail closed to prod, found: ${publicStage ?? 'missing'}`)
}
if (!compatibilityValidatorIsOptional) {
  throw new Error('publicStageCompatibilityValidator must remain optional during the rollout window')
}

console.log(
  `Public Convex API contract passed (${publicFunctions} functions, ${seenCompatibilityFunctions.size} ignored compatibility fields, stage=prod).`,
)
