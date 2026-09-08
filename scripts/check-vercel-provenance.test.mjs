import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
  assert.ok(pkg.scripts['ops:test'].split(/\s+/).includes('scripts/check-vercel-provenance.test.mjs'))
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
