import assert from 'node:assert/strict'
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
  for (const change of [
    (s) => { s.subject[0].name = 'pkg:npm/other@58.4.4' },
    (s) => { s.subject[0].digest.sha512 = '' },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.repository = 'https://github.com/other/repo' },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.path = '.github/workflows/other.yml' },
  ]) await assert.rejects(() => requireVercelProvenance(fixture(change), '58.4.4', verify), /does not match/)
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
