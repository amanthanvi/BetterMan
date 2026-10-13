import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { requireVercelProvenance } from './check-vercel-provenance.mjs'

const type = 'https://slsa.dev/provenance/v1'
const verify = async () => {}
function fixture(change = () => {}) {
  const statement = {
    predicateType: type,
    subject: [{ name: 'pkg:npm/vercel@58.4.4', digest: { sha512: 'a'.repeat(128) } }],
    predicate: { buildDefinition: {
      externalParameters: { workflow: { repository: 'https://github.com/vercel/vercel', path: '.github/workflows/release.yml', ref: 'refs/heads/main' } },
      resolvedDependencies: [{ uri: 'git+https://github.com/vercel/vercel@refs/heads/main', digest: { gitCommit: 'b'.repeat(40) } }],
    } },
  }
  change(statement)
  return { invalid: [], missing: [], verified: [{ name: 'vercel', version: '58.4.4', location: 'node_modules/vercel', registry: 'https://registry.npmjs.org/',
    attestations: { provenance: { predicateType: type } },
    attestationBundles: [{ predicateType: type, bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } } }],
  }] }
}

test('accepts the audited package and public release workflow identity', async () => {
  assert.deepEqual(await requireVercelProvenance(fixture(), '58.4.4', verify), { version: '58.4.4', sourceCommit: 'b'.repeat(40) })
})
test('rejects registry signatures alone and the wrong installed version', async () => {
  const report = fixture()
  delete report.verified[0].attestationBundles
  await assert.rejects(() => requireVercelProvenance(report, '58.4.4', verify), /no verified/)
  await assert.rejects(() => requireVercelProvenance(fixture(), '59.10.0', verify), /no verified/)
})
test('rejects failed signature audits and unexpected package or workflow identity', async () => {
  await assert.rejects(() => requireVercelProvenance({ ...fixture(), invalid: [{}] }, '58.4.4', verify), /did not pass/)
  await assert.rejects(() => requireVercelProvenance({ ...fixture(), missing: [{}] }, '58.4.4', verify), /did not pass/)
  for (const change of [
    (s) => { s.predicateType = 'https://slsa.dev/provenance/v0.2' },
    (s) => { s.subject[0].name = 'pkg:npm/other@58.4.4' },
    (s) => { s.subject[0].digest.sha512 = '' },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.repository = 'https://github.com/other/repo' },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.path = '.github/workflows/other.yml' },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.ref = 'refs/heads/other' },
    (s) => { s.predicate.buildDefinition.resolvedDependencies[0].uri = 'git+https://github.com/vercel/private@refs/heads/main' },
    (s) => { s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = '' },
  ]) await assert.rejects(() => requireVercelProvenance(fixture(change), '58.4.4', verify), /does not match/)
})
test('rejects incomplete audits, alternate package locations, and publish-only attestations', async () => {
  for (const field of ['invalid', 'missing', 'verified']) {
    const report = fixture()
    delete report[field]
    await assert.rejects(() => requireVercelProvenance(report, '58.4.4', verify), /did not pass/)
  }
  for (const change of [
    (entry) => { entry.location = 'node_modules/other/node_modules/vercel' },
    (entry) => { entry.registry = 'https://registry.example.com/' },
    (entry) => { delete entry.attestations.provenance },
    (entry) => { entry.attestationBundles[0].predicateType = 'https://github.com/npm/attestation/tree/main/specs/publish/v0.1' },
  ]) {
    const report = fixture()
    change(report.verified[0])
    await assert.rejects(() => requireVercelProvenance(report, '58.4.4', verify), /no verified/)
  }
})
test('requires the expected certificate signer and issuer even with matching payload claims', async () => {
  const report = fixture()
  const auditedBundle = report.verified[0].attestationBundles[0].bundle
  await assert.rejects(() => requireVercelProvenance(report, '58.4.4', async (bundle, options) => {
    assert.equal(bundle, auditedBundle)
    assert.deepEqual(options, {
      certificateIdentityURI: 'https://github.com/vercel/vercel/.github/workflows/release.yml@refs/heads/main',
      certificateIssuer: 'https://token.actions.githubusercontent.com',
    })
    throw new Error('certificate identity mismatch')
  }), /certificate identity mismatch/)
})

const readRepositoryFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// Intentionally strict contracts for the existing workflow format, not a YAML parser.
function stepBlocks(workflow) {
  return workflow.match(/^      - [\s\S]*?(?=^      - |^  [a-z_]+:|(?![\s\S]))/gm) ?? []
}

test('CI retains a mandatory provenance gate and runs its regression tests', () => {
  const pkg = JSON.parse(readRepositoryFile('package.json'))
  assert.equal(pkg.scripts['deps:provenance'], 'node scripts/check-vercel-provenance.mjs')
  assert.ok(
    pkg.scripts['ops:test'].split(/\s+/).includes('scripts/check-vercel-provenance.test.mjs') ||
      pkg.scripts['ops:test'].includes('scripts/*.test.mjs'),
    'ops:test must run this test file (explicitly or via the scripts/*.test.mjs glob)',
  )
  const ci = readRepositoryFile('.github/workflows/ci.yml')
  const nextjs = ci.split('\n  nextjs:\n')[1]?.split('\n  ingestion:\n')[0]
  assert.ok(nextjs, 'nextjs job must exist')
  const steps = stepBlocks(nextjs)
  const gate = steps.findIndex((step) => step.includes('deps:provenance'))
  assert.ok(gate > 0, 'provenance gate must follow dependency installation')
  assert.equal(steps[gate].trim(), '- run: pnpm deps:provenance')
  assert.equal(steps[gate - 1].trim(), '- run: pnpm install --frozen-lockfile')
  assert.doesNotMatch(nextjs, /continue-on-error:/)
  assert.ok(stepBlocks(ci).some((step) => step.trim() === '- name: Test production completion checks\n        run: pnpm ops:test'))
})

test('all production paths verify trusted tooling before deployment secrets are available', () => {
  const workflow = readRepositoryFile('.github/workflows/deploy.yml')
  const job = workflow.split('\n  deploy_production:\n')[1]
  assert.ok(job, 'production job must exist')
  const steps = stepBlocks(job)
  const gate = steps.findIndex((step) => step.includes('deps:provenance'))
  assert.ok(gate > 0, 'provenance gate must follow trusted tooling installation')
  assert.equal(steps[gate].trim(), '- name: Verify trusted Vercel CLI provenance\n        run: pnpm --dir "$GITHUB_WORKSPACE/tooling" deps:provenance')
  assert.equal(steps[gate - 1].trim(), '- name: Install trusted deployment-tool dependencies\n        run: pnpm --dir "$GITHUB_WORKSPACE/tooling" install --frozen-lockfile')
  assert.doesNotMatch(job, /continue-on-error:|always\s*\(/)
  for (const secret of ['CONVEX_DEPLOY_KEY', 'VERCEL_TOKEN']) {
    const use = steps.findIndex((step) => step.includes(`secrets.${secret}`))
    assert.ok(use > gate, `${secret} must only be exposed after provenance verification`)
  }
  const deployment = steps.find((step) => step.includes('scripts/deploy-vercel.sh'))
  assert.ok(deployment?.includes('export PATH="$GITHUB_WORKSPACE/tooling/node_modules/.bin:$PATH"'))
  const version = JSON.parse(readRepositoryFile('package.json')).devDependencies.vercel
  assert.match(version, /^\d+\.\d+\.\d+$/)
  assert.ok(deployment.includes(`if [[ "$(vercel --version)" != "${version}" ]]; then`))
})

function deploymentSmokeFixture(failure = '') {
  const dir = mkdtempSync(join(tmpdir(), 'betterman-deploy-test-'))
  const log = join(dir, 'commands.jsonl')
  writeFileSync(join(dir, 'git'), '#!/usr/bin/env bash\necho fixture-sha\n')
  writeFileSync(join(dir, 'vercel'), `#!${process.execPath}
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const target = args[args.indexOf('--deployment') + 1]
const promoted = process.env.SMOKE_PROMOTED
const command = args[0]
const record = { command }
if (command === 'curl') {
  record.path = args[1]
  record.target = target
  record.bypassesCache = args.includes('Cache-Control: no-cache, no-store') && args.includes('Pragma: no-cache')
}
appendFileSync(process.env.SMOKE_LOG, JSON.stringify(record) + '\\n')
if (command === 'inspect') console.log(JSON.stringify({ id: existsSync(promoted) ? 'new-deployment' : 'previous-deployment', readyState: 'READY' }))
if (command === 'deploy') console.log(JSON.stringify({ id: 'new-deployment', url: 'staged.betterman.test' }))
if (command === 'api') console.log(JSON.stringify({ meta: { githubCommitSha: 'fixture-sha' } }))
if (command === 'promote') writeFileSync(promoted, 'yes')
if (command === 'curl') {
  const path = args[1]
  if (path.startsWith('/api/v1/search?')) {
    const phase = target.includes('staged.') ? 'before' : 'after'
    if (process.env.SMOKE_FAILURE === phase) process.exit(22)
    const headerFile = args[args.indexOf('--dump-header') + 1]
    writeFileSync(headerFile, process.env.SMOKE_FAILURE === 'missing-marker' ? 'HTTP/2 200\\r\\n' : 'HTTP/2 200\\r\\nServer-Timing: rate_limit;dur=1.0, total;dur=2.0\\r\\n')
    console.log(JSON.stringify({ query: 'tar', results: [{ name: 'tar', section: '1' }] }))
  } else if (path === '/api/v1/info') console.log(JSON.stringify({ datasetReleaseId: 'fixture-release' }))
  else if (path === '/robots.txt') console.log('User-agent: *\\nSitemap: https://betterman.test/sitemap.xml')
  else if (path === '/sitemap.xml') console.log('<sitemapindex><loc>https://betterman.test/sitemap-1.xml</loc></sitemapindex>')
  else if (path === '/man/tar/1') console.log('<title>tar(1)</title><script id="bm-jsonld:fixture"></script>')
}
`)
  chmodSync(join(dir, 'git'), 0o755)
  chmodSync(join(dir, 'vercel'), 0o755)
  const result = spawnSync('bash', ['scripts/deploy-vercel.sh'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      RUNNER_TEMP: dir,
      GITHUB_OUTPUT: '',
      BETTERMAN_DEPLOY_REF: 'main', BETTERMAN_DEPLOY_SHA: 'fixture-sha',
      BETTERMAN_PRODUCTION_DOMAIN: 'betterman.test', BETTERMAN_REQUIRE_CURRENT_MAIN: 'false',
      VERCEL_ORG_ID: 'fixture-org', VERCEL_PROJECT_ID: 'fixture-project', VERCEL_TOKEN: 'fixture-token',
      SMOKE_LOG: log, SMOKE_PROMOTED: join(dir, 'promoted'), SMOKE_FAILURE: failure,
    },
  })
  const commands = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  rmSync(dir, { recursive: true, force: true })
  return { ...result, commands }
}

test('deployment checks fresh authenticated search before promotion and on both production aliases', () => {
  const { status, stderr, commands } = deploymentSmokeFixture()
  assert.equal(status, 0, stderr)
  const searches = commands.filter((row) => row.path?.startsWith('/api/v1/search?'))
  assert.equal(searches.length, 3)
  assert.deepEqual(searches.map((row) => row.target), ['https://staged.betterman.test', 'https://betterman.test', 'https://www.betterman.test'])
  assert.equal(new Set(searches.map((row) => row.path)).size, 3)
  for (const search of searches) {
    assert.ok(search.bypassesCache)
    const params = new URLSearchParams(search.path.split('?')[1])
    assert.equal(params.get('q'), 'tar')
    assert.equal(params.get('limit'), '1')
    assert.ok(params.get('bm_deploy_smoke'))
  }
  const promotion = commands.findIndex((row) => row.command === 'promote')
  assert.ok(commands.indexOf(searches[0]) < promotion)
  assert.ok(commands.indexOf(searches[1]) > promotion)
  assert.ok(commands.indexOf(searches[2]) > promotion)
  assert.equal(commands.some((row) => row.command === 'rollback'), false)
})

test('failed authenticated staged search or absent timing proof blocks promotion', () => {
  for (const failure of ['before', 'missing-marker']) {
    const { status, commands } = deploymentSmokeFixture(failure)
    assert.notEqual(status, 0)
    assert.equal(commands.some((row) => row.command === 'promote'), false)
    assert.equal(commands.some((row) => row.command === 'rollback'), false)
  }
})

test('failed authenticated production search rolls back Vercel and reports the Convex recovery limit', () => {
  const { status, stderr, commands } = deploymentSmokeFixture('after')
  assert.notEqual(status, 0)
  assert.ok(commands.some((row) => row.command === 'promote'))
  assert.ok(commands.some((row) => row.command === 'rollback'))
  assert.match(stderr, /restores Vercel only/)
  assert.match(stderr, /docs\/RELEASING\.md/)
})
